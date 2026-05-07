import "server-only";

import { runAgent, extractJson } from "@/lib/agents/anthropic";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import {
  getDocumentWithSections,
  type IntelSignal,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const SYSTEM_PROMPT = `You are the critic for an Intel Digest. Default suspicion. The scout has a recall bias — it surfaces too much. Your job is to kill noise and flag what was under-rated.

Posture:
- One venture, one document. No cross-venture context.
- Comments anchor to signal rows by signal_index (0-based).
- Voice: terse, specific, declarative.

Rubric:
1. Misclassified as signal — demote to noise.
2. Severity wrong — promote or demote.
3. Missing context — connect to relevant prior decision or anti-pattern.
4. Action too vague.

Output contract — return ONLY a JSON object:

{
  "comments": [
    {
      "section_id": "<the intel_signals_table uuid>",
      "signal_index": 0,
      "body": "Terse, max 2 sentences.",
      "verdict": "demote_to_noise" | "promote_severity" | "demote_severity" | "change_action" | "missing_context",
      "evidence": [
        {
          "kind": "anti_pattern" | "prior_decision" | "memory_hit" | "url" | "first_principles",
          "ref": "<id, slug, or short citation>",
          "label": "Optional human-readable label"
        }
      ]
    }
  ],
  "blocking": false,
  "summary": "1-sentence overall verdict."
}

blocking is almost always false — operator triages signals themselves.

Anti-patterns: no global comments, no evidence-less comments, no hedges, no mention of being an AI.`;

const BUDGET_TOKENS = 15_000;
const BUDGET_CENTS = 40;

export type RunIntelCriticInput = {
  documentId: string;
  ventureSlug: string;
};

export type RunIntelCriticResult =
  | {
      ok: true;
      loopRunId: string;
      commentsWritten: number;
      summary: string;
    }
  | { ok: false; error: string };

type AgentJsonShape = {
  comments?: Array<{
    section_id?: string;
    signal_index?: number;
    body?: string;
    verdict?: string;
    evidence?: Array<{
      kind?: string;
      ref?: string;
      label?: string;
    }>;
  }>;
  blocking?: boolean;
  summary?: string;
};

export async function runIntelCritic(
  input: RunIntelCriticInput,
): Promise<RunIntelCriticResult> {
  const venture = await getVentureBySlug(input.ventureSlug);
  if (!venture) return { ok: false, error: "venture not found" };

  const ctx = await getDocumentWithSections({
    documentId: input.documentId,
    ventureId: venture.id,
  });
  if (!ctx) return { ok: false, error: "document not found" };
  if (ctx.document.type !== "intel_digest") {
    return { ok: false, error: "not an intel digest" };
  }

  const tableSection = ctx.sections.find(
    (s) => s.kind === "intel_signals_table",
  );
  if (!tableSection) {
    return { ok: false, error: "document has no intel_signals_table" };
  }
  const tableContent = tableSection.content as { signals?: IntelSignal[] } | null;
  const signals = Array.isArray(tableContent?.signals) ? tableContent.signals : [];

  const supabase = createSupabaseAdminClient();
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: "intel-critic",
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

  const taskPayload = [
    `Document: ${ctx.document.title}`,
    `Venture: ${venture.slug}`,
    `intel_signals_table SECTION_ID: ${tableSection.id}`,
    "",
    "Signals (anchor comments by signal_index):",
    ...signals.map((s, idx) =>
      `[${idx}] tag=${s.tag} severity=${s.severity} action=${s.suggested_action}\n    obs: ${s.observation}\n    src: ${s.source ?? "—"}\n    why: ${s.reasoning ?? "—"}`,
    ),
  ].join("\n");

  const composed = await buildAgentPrompt({
    skill: "intel-critic",
    ventureId: venture.id,
    task: taskPayload,
    systemSkillPrompt: SYSTEM_PROMPT,
    budgetTokens: BUDGET_TOKENS,
  });

  const result = await runAgent({
    loopRunId,
    skill: "intel-critic",
    ventureId: venture.id,
    systemPrompt: composed.systemPrompt,
    userMessage: composed.userMessage,
    budgetTokens: BUDGET_TOKENS,
    budgetCents: BUDGET_CENTS,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<AgentJsonShape>(result.text);
  if (!parsed) return { ok: false, error: "critic did not return JSON" };

  const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
  let written = 0;
  for (const c of comments) {
    if (!c.section_id || c.section_id !== tableSection.id) continue;
    if (!c.body || c.body.trim().length === 0) continue;
    const evidence = Array.isArray(c.evidence)
      ? c.evidence.filter((e) => e.kind && e.ref)
      : [];
    if (evidence.length === 0) continue;

    const evidenceWithSignal: Array<{
      kind: string;
      ref: string;
      label?: string;
    }> = [];
    if (typeof c.signal_index === "number") {
      evidenceWithSignal.push({
        kind: "signal",
        ref: String(c.signal_index),
        label: `signal ${c.signal_index + 1}`,
      });
    }
    if (c.verdict) {
      evidenceWithSignal.push({
        kind: "verdict",
        ref: c.verdict,
        label: `verdict: ${c.verdict.replace(/_/g, " ")}`,
      });
    }
    for (const e of evidence) {
      evidenceWithSignal.push({
        kind: e.kind ?? "first_principles",
        ref: e.ref ?? "",
        ...(e.label ? { label: e.label } : {}),
      });
    }

    const { error: insertError } = await supabase.from("comments").insert({
      section_id: tableSection.id,
      author: "agent:intel-critic",
      body: c.body.trim(),
      evidence: evidenceWithSignal as unknown as Json,
    });
    if (!insertError) written += 1;
  }

  return {
    ok: true,
    loopRunId,
    commentsWritten: written,
    summary: parsed.summary?.slice(0, 200) ?? "",
  };
}
