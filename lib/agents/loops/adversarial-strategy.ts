import "server-only";

import { runAgent, extractJson } from "@/lib/agents/anthropic";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import {
  getDocumentWithSections,
  type SectionRow,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

// SKILL spec at /.claude/skills/adversarial-strategy/SKILL.md.
// Inlined runtime prompt below.

const ADVERSARIAL_SYSTEM_PROMPT_BASE = `You are the adversarial critic for a Decision Document produced by the office-hours skill. Your job is to find what's wrong.

Posture:
- Find the weakness. Default rejection. Approve nothing that survives only because nothing challenged it.
- One venture, one document. No cross-venture context.
- Comments anchor to Sections. Never write a global review note. Every comment targets a specific Section by id and cites a concrete reason from one of: a memory hit, a COMPANY.md anti-pattern, a prior decision, an external observation, or first principles. Comments without evidence are dropped by the runner.
- Voice. Reserved, terse, specific. No "I think" / "perhaps" hedges.

What earns a comment:
1. Anti-pattern hit. Recommendation trips a COMPANY.md anti-pattern.
2. Recycled idea. Materially similar to a prior decision that was killed or didn't deliver.
3. Vague or unfalsifiable. Kill criteria that aren't concrete.
4. Unstated assumption.
5. Wrong frame.
6. Confidence overstated.

What does NOT earn a comment:
- Style nits, voice differences, word choice.
- "Could be more detailed."
- Anything that doesn't change the operator's choice.

Output contract — return ONLY a JSON object:

{
  "comments": [
    {
      "section_id": "<the exact uuid you were given>",
      "body": "Your comment, terse, max ~3 sentences.",
      "evidence": [
        {
          "kind": "anti_pattern" | "memory_hit" | "prior_decision" | "url" | "first_principles",
          "ref": "<id, slug, or short citation>",
          "label": "Optional human-readable label"
        }
      ]
    }
  ],
  "blocking": true | false,
  "summary": "1-sentence overall verdict for trace metadata."
}

Anti-patterns:
- No global comments. If you can't anchor to a Section by id, the comment doesn't belong.
- No evidence-less comments. Every comment must have at least one evidence entry.
- Default to scrutiny. Most drafts have at least one weakness.`;

const BUDGET_TOKENS = 25_000;
const BUDGET_CENTS = 50;

export type RunAdversarialStrategyInput = {
  documentId: string;
  ventureSlug: string;
};

export type RunAdversarialStrategyResult =
  | {
      ok: true;
      loopRunId: string;
      commentsWritten: number;
      blocking: boolean;
      summary: string;
    }
  | { ok: false; error: string };

type AgentJsonShape = {
  comments?: Array<{
    section_id?: string;
    body?: string;
    evidence?: Array<{
      kind?: string;
      ref?: string;
      label?: string;
    }>;
  }>;
  blocking?: boolean;
  summary?: string;
};

export async function runAdversarialStrategy(
  input: RunAdversarialStrategyInput,
): Promise<RunAdversarialStrategyResult> {
  const venture = await getVentureBySlug(input.ventureSlug);
  if (!venture) return { ok: false, error: "venture not found" };

  const ctx = await getDocumentWithSections({
    documentId: input.documentId,
    ventureId: venture.id,
  });
  if (!ctx) return { ok: false, error: "document not found" };
  if (ctx.document.type !== "decision") {
    return { ok: false, error: "not a decision document" };
  }

  const supabase = createSupabaseAdminClient();
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: "adversarial-strategy",
      venture_id: venture.id,
      trigger: "manual",
      input: { document_id: input.documentId } as Json,
      status: "running",
      budget_tokens: BUDGET_TOKENS,
      budget_cents: BUDGET_CENTS,
    })
    .select("id")
    .single();
  if (runError || !runRow) {
    return {
      ok: false,
      error: runError?.message ?? "loop_runs insert failed",
    };
  }
  const loopRunId = runRow.id;

  // Build the user message containing the document title + every section's
  // id, kind, and content. The agent's JSON response must reference these
  // ids back so we know which Section each comment anchors to.
  const sectionIds = new Set(ctx.sections.map((s) => s.id));
  const docPayload = serialiseForCritic(ctx.document.title, ctx.sections);

  const composed = await buildAgentPrompt({
    skill: "adversarial-strategy",
    ventureId: venture.id,
    task: docPayload,
    systemSkillPrompt: ADVERSARIAL_SYSTEM_PROMPT_BASE,
    budgetTokens: BUDGET_TOKENS,
  });

  const result = await runAgent({
    loopRunId,
    skill: "adversarial-strategy",
    ventureId: venture.id,
    systemPrompt: composed.systemPrompt,
    userMessage: composed.userMessage,
    budgetTokens: BUDGET_TOKENS,
    budgetCents: BUDGET_CENTS,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<AgentJsonShape>(result.text);
  if (!parsed) {
    return { ok: false, error: "critic did not return parseable JSON" };
  }

  const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
  let written = 0;
  for (const c of comments) {
    if (!c.section_id || !sectionIds.has(c.section_id)) continue;
    if (!c.body || c.body.trim().length === 0) continue;
    const evidence = Array.isArray(c.evidence)
      ? c.evidence.filter((e) => e.kind && e.ref)
      : [];
    if (evidence.length === 0) {
      // Per spec: drop comments without evidence.
      continue;
    }
    const { error: insertError } = await supabase.from("comments").insert({
      section_id: c.section_id,
      author: "agent:adversarial-strategy",
      body: c.body.trim(),
      evidence: evidence as unknown as Json,
    });
    if (!insertError) written += 1;
  }

  // Flip section status to 'reviewing' if the critic is blocking. v1 keeps
  // doc status at 'draft' regardless — the existing detail page lets the
  // operator approve when ready.
  const blocking = !!parsed.blocking;
  if (blocking && comments.length > 0) {
    await supabase
      .from("sections")
      .update({ status: "reviewing" })
      .eq("document_id", input.documentId)
      .eq("status", "draft");
  }

  return {
    ok: true,
    loopRunId,
    commentsWritten: written,
    blocking,
    summary: parsed.summary?.slice(0, 200) ?? "",
  };
}

function serialiseForCritic(title: string, sections: SectionRow[]): string {
  const parts: string[] = [];
  parts.push(`# Decision Document: ${title}\n`);
  parts.push(
    `The Sections below are the document. Each has an id (uuid). Anchor every comment by quoting the exact id.\n`,
  );
  for (const s of sections) {
    parts.push(`---`);
    parts.push(`SECTION_ID: ${s.id}`);
    parts.push(`KIND: ${s.kind}`);
    parts.push(`CONTENT:`);
    const content = s.content as Record<string, unknown> | null;
    if (content) {
      parts.push(JSON.stringify(content, null, 2));
    } else {
      parts.push("(empty)");
    }
  }
  return parts.join("\n");
}
