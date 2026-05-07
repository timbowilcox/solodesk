import "server-only";

import { runAgent, extractJson } from "@/lib/agents/anthropic";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import { getDocumentWithSections } from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const SYSTEM_PROMPT = `You are the critic for a draft produced by content-writer. Default rejection. The draft passes only when nothing on the rubric trips and the voice matches the venture.

Posture:
- One venture, one document. No cross-venture context.
- Comments anchor to specific paragraphs of the content_block Section. Each comment includes the offending paragraph index (0-based, splitting on blank-line breaks) and an evidence pointer.
- Voice is COMPANY.md. Single source of truth. Enforce explicit anti-patterns.

Rubric — what earns a comment:
1. Anti-pattern hit (banned words / framings / topics from COMPANY.md).
2. Generic SaaS voice (three-adjective stacks, "delighted to", "powerful platform", "game-changer", "revolutionise").
3. Fake hook (first-line question that doesn't deliver, or implied promise the body breaks).
4. Fake numbers (statistics with no source).
5. Wrong audience.
6. Wrong channel format.
7. CTA mismatch.
8. Realtelligence anti-pattern: drafts for the realtelligence venture mentioning RealStyler before 1 November 2026 are hard-rejected.

What does NOT earn a comment: style preference, length within ±20%, anything that doesn't change send/no-send.

Output contract — return ONLY a JSON object:

{
  "comments": [
    {
      "section_id": "<the content_block uuid>",
      "paragraph_index": 0,
      "body": "Terse, max 3 sentences.",
      "evidence": [
        {
          "kind": "anti_pattern" | "voice_rule" | "rubric" | "url" | "first_principles",
          "ref": "<id, slug, or short citation>",
          "label": "Optional human-readable label"
        }
      ]
    }
  ],
  "blocking": true | false,
  "summary": "1-sentence verdict for trace metadata."
}

Anti-patterns: no global comments, no evidence-less comments, no style nits, no mention of being an AI.`;

const BUDGET_TOKENS = 15_000;
const BUDGET_CENTS = 30;

export type RunContentCriticInput = {
  documentId: string;
  ventureSlug: string;
};

export type RunContentCriticResult =
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
    paragraph_index?: number;
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

export async function runContentCritic(
  input: RunContentCriticInput,
): Promise<RunContentCriticResult> {
  const venture = await getVentureBySlug(input.ventureSlug);
  if (!venture) return { ok: false, error: "venture not found" };

  const ctx = await getDocumentWithSections({
    documentId: input.documentId,
    ventureId: venture.id,
  });
  if (!ctx) return { ok: false, error: "document not found" };
  if (ctx.document.type !== "content") {
    return { ok: false, error: "not a content document" };
  }

  const contentBlock = ctx.sections.find((s) => s.kind === "content_block");
  if (!contentBlock) {
    return { ok: false, error: "document has no content_block" };
  }

  const supabase = createSupabaseAdminClient();
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: "content-critic",
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

  const cb = contentBlock.content as {
    channel?: string;
    subject?: string;
    body?: string;
    audience?: string;
    cta?: string;
  } | null;
  const body = cb?.body ?? "";
  const paragraphs = body.split(/\n\s*\n/);

  const taskPayload = [
    `Document: ${ctx.document.title}`,
    `Venture slug: ${venture.slug}`,
    `Channel: ${cb?.channel ?? "unknown"}`,
    cb?.audience ? `Audience: ${cb.audience}` : "",
    cb?.cta ? `CTA: ${cb.cta}` : "",
    "",
    `content_block SECTION_ID: ${contentBlock.id}`,
    "",
    cb?.subject ? `Subject: ${cb.subject}` : "",
    "",
    "Body paragraphs (anchor comments to these by paragraph_index):",
    ...paragraphs.map((p, idx) => `[${idx}] ${p}`),
  ]
    .filter(Boolean)
    .join("\n");

  const composed = await buildAgentPrompt({
    skill: "content-critic",
    ventureId: venture.id,
    task: taskPayload,
    systemSkillPrompt: SYSTEM_PROMPT,
    budgetTokens: BUDGET_TOKENS,
  });

  const result = await runAgent({
    loopRunId,
    skill: "content-critic",
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
    if (!c.section_id || c.section_id !== contentBlock.id) continue;
    if (!c.body || c.body.trim().length === 0) continue;
    const evidence = Array.isArray(c.evidence)
      ? c.evidence.filter((e) => e.kind && e.ref)
      : [];
    if (evidence.length === 0) continue;

    // Encode paragraph_index in the evidence so the UI can render it
    // alongside the comment. The 'rubric' / 'voice_rule' evidence kinds
    // get a synthetic 'paragraph' pointer prepended.
    const evidenceWithParagraph: Array<{
      kind: string;
      ref: string;
      label?: string;
    }> = [];
    if (typeof c.paragraph_index === "number") {
      evidenceWithParagraph.push({
        kind: "paragraph",
        ref: String(c.paragraph_index),
        label: `paragraph ${c.paragraph_index}`,
      });
    }
    for (const e of evidence) {
      evidenceWithParagraph.push({
        kind: e.kind ?? "first_principles",
        ref: e.ref ?? "",
        ...(e.label ? { label: e.label } : {}),
      });
    }

    const { error: insertError } = await supabase.from("comments").insert({
      section_id: contentBlock.id,
      author: "agent:content-critic",
      body: c.body.trim(),
      evidence: evidenceWithParagraph as unknown as Json,
    });
    if (!insertError) written += 1;
  }

  const blocking = !!parsed.blocking;
  if (blocking && comments.length > 0) {
    await supabase
      .from("sections")
      .update({ status: "reviewing" })
      .eq("id", contentBlock.id);
  }

  return {
    ok: true,
    loopRunId,
    commentsWritten: written,
    blocking,
    summary: parsed.summary?.slice(0, 200) ?? "",
  };
}
