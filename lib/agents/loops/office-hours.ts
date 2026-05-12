import "server-only";

import { runAgent, extractJson } from "@/lib/agents/anthropic";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import {
  createDocument,
  type SectionSeed,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

// SKILL spec at /.claude/skills/office-hours/SKILL.md.
// Inlined here as the runtime source. Keep in sync — the harness
// "think-like-the-agent exercise" verifies them before each ship.

const OFFICE_HOURS_SYSTEM_PROMPT = `You are running an internal office-hours session for the operator of a single venture. The operator brings a strategic question. Your job is to put it through a six-question reframe (modelled on Gary's GStack) and produce a structured Decision Document that the operator (and a critic) will review.

You operate inside SoloDesk — the operator's portfolio operating system. Hard rules, in order of priority:

1. One venture only. You see only this venture's COMPANY.md context, prior decisions, and memories. Cross-venture leakage is forbidden. Don't reference other ventures by name.
2. Be a forcing function, not a yes-man. Default to challenge. If the question contains an unstated assumption, surface it. If the operator's framing is weak, reframe it before answering.
3. Decision Documents over chat. Your output is structured, not conversational. No "Great question!" preamble, no "Let me know if you'd like…" sign-off.
4. Voice. Reserved, precise, terse. Like a senior partner reviewing a memo. Curly quotes and em dashes — no emoji, no exclamation marks.

The six-question reframe (use internally):
1. What problem is this actually solving?
2. Who exactly has it?
3. What are they doing today?
4. What changes if you ship this?
5. What kills it?
6. What does win look like in 90 days?

Output contract — return ONLY a JSON object matching this exact shape, no prose around it, no fenced markdown:

{
  "title": "One-line title for the decision",
  "context": "1-3 sentence framing — the reframed problem",
  "recommendation": {
    "text": "The claim. What you're recommending and why.",
    "confidence": "low" | "medium" | "high"
  },
  "alternatives": "3-5 options considered. For each: what it would mean, and why you'd reject or pick it.",
  "kill_criteria": "Concrete trigger.",
  "evidence": "Bullets pointing to memory hits, prior decisions, or external observations. Cite venture COMPANY.md anti-patterns by name when they apply.",
  "risk": {
    "text": "Top 1-3 risks.",
    "severity": "low" | "medium" | "high",
    "mitigation": "How to reduce or contain."
  },
  "agent_notes": [
    {
      "question": "Ambiguity you resolved on your own.",
      "assumption": "What you assumed — your reasoning for that call.",
      "alternatives": "What other readings would have changed the recommendation."
    }
  ]
}

Field semantics: 'assumption' is YOUR reasoning — fill it. 'decision' is for the operator to fill after reviewing — NEVER populate it. An agent_note without 'assumption' is dropped.

Anti-patterns:
- No "feels off" or vague language. Every claim is backed by a memory hit, a venture anti-pattern, or first-principles reasoning made explicit.
- No five-paragraph answers. Reserved is the voice. Prose sections are 1-4 sentences.
- No empty agent_notes unless you genuinely had nothing to resolve. An empty array is correct when the question was clear.
- No mention of being an AI.`;

const OFFICE_HOURS_BUDGET_TOKENS = 25_000;
const OFFICE_HOURS_BUDGET_CENTS = 50;

export type RunOfficeHoursInput = {
  ventureSlug: string;
  question: string;
};

export type RunOfficeHoursResult =
  | {
      ok: true;
      documentId: string;
      loopRunId: string;
      tokensUsed: number;
      costCents: number;
    }
  | { ok: false; error: string };

type AgentJsonShape = {
  title?: string;
  context?: string;
  recommendation?: { text?: string; confidence?: "low" | "medium" | "high" };
  alternatives?: string;
  kill_criteria?: string;
  evidence?: string;
  risk?: {
    text?: string;
    severity?: "low" | "medium" | "high";
    mitigation?: string;
  };
  agent_notes?: Array<{
    question?: string;
    assumption?: string;
    alternatives?: string;
  }>;
};

/**
 * Run the office-hours skill end-to-end:
 *  1. Create a loop_runs row
 *  2. Build the agent prompt via buildAgentPrompt (Sprint 0.5 substrate)
 *  3. Invoke runAgent (Anthropic) with the budget
 *  4. Parse JSON output
 *  5. Compose Section seeds + write the Decision Document
 *
 * The adversarial-strategy critic runs as a separate invocation — see
 * runAdversarialStrategy in ./adversarial-strategy.ts.
 */
export async function runOfficeHours(
  input: RunOfficeHoursInput,
): Promise<RunOfficeHoursResult> {
  const venture = await getVentureBySlug(input.ventureSlug);
  if (!venture) return { ok: false, error: "venture not found" };

  const supabase = createSupabaseAdminClient();
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: "office-hours",
      venture_id: venture.id,
      trigger: "manual",
      input: { question: input.question.slice(0, 500) } as Json,
      status: "running",
      budget_tokens: OFFICE_HOURS_BUDGET_TOKENS,
      budget_cents: OFFICE_HOURS_BUDGET_CENTS,
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

  // Compose prompt via the Sprint 0.5 substrate. Recall is hard-scoped
  // to this venture by ventureId — cross-venture context impossible.
  let composed: Awaited<ReturnType<typeof buildAgentPrompt>>;
  try {
    composed = await buildAgentPrompt({
      skill: "office-hours",
      ventureId: venture.id,
      task: input.question,
      systemSkillPrompt: OFFICE_HOURS_SYSTEM_PROMPT,
      budgetTokens: OFFICE_HOURS_BUDGET_TOKENS,
    });
  } catch (e) {
    await markLoopFailed(loopRunId, e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "prompt build failed",
    };
  }

  const result = await runAgent({
    loopRunId,
    skill: "office-hours",
    ventureId: venture.id,
    systemPrompt: composed.systemPrompt,
    userMessage: composed.userMessage,
    budgetTokens: OFFICE_HOURS_BUDGET_TOKENS,
    budgetCents: OFFICE_HOURS_BUDGET_CENTS,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<AgentJsonShape>(result.text);
  if (!parsed) {
    await markLoopFailed(loopRunId, new Error("agent did not return JSON"));
    return { ok: false, error: "agent did not return parseable JSON" };
  }

  const sections = composeSections(parsed);
  if (sections.length === 0) {
    await markLoopFailed(loopRunId, new Error("agent produced no sections"));
    return { ok: false, error: "agent produced no sections" };
  }

  const created = await createDocument({
    ventureId: venture.id,
    type: "decision",
    title: parsed.title?.trim() || `Office hours — ${formatDate(new Date())}`,
    loopName: "office-hours",
    sections,
    metadata: {
      loop_run_id: loopRunId,
      generator_skill: "office-hours",
      question: input.question.slice(0, 500),
    },
  });
  if (!created.ok) {
    await markLoopFailed(loopRunId, new Error(created.error));
    return { ok: false, error: created.error };
  }

  // Document lands with Sections in 'draft' state. The Decision detail
  // page already supports the draft -> approve flow. The critic runs
  // next in a separate invocation (see runAdversarialStrategy).

  // Update loop_runs with output_decision_id once the document is
  // approved (Sprint 1.2 phase 1 writes a decisions row on approval).
  await supabase
    .from("loop_runs")
    .update({
      input: {
        question: input.question.slice(0, 500),
        document_id: created.documentId,
      } as Json,
    })
    .eq("id", loopRunId);

  return {
    ok: true,
    documentId: created.documentId,
    loopRunId,
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
    costCents: result.usage.cents,
  };
}

export function composeSections(parsed: AgentJsonShape): SectionSeed[] {
  const sections: SectionSeed[] = [];
  if (parsed.context && parsed.context.trim()) {
    sections.push({ kind: "prose", content: { text: parsed.context.trim() } });
  }
  const rec = parsed.recommendation;
  if (rec?.text && rec.text.trim()) {
    sections.push({
      kind: "recommendation",
      content: {
        text: rec.text.trim(),
        ...(rec.confidence ? { confidence: rec.confidence } : {}),
      },
    });
  }
  if (parsed.alternatives && parsed.alternatives.trim()) {
    sections.push({
      kind: "alternatives",
      content: { text: parsed.alternatives.trim() },
    });
  }
  if (parsed.evidence && parsed.evidence.trim()) {
    sections.push({
      kind: "evidence",
      content: { text: parsed.evidence.trim() },
    });
  }
  if (parsed.kill_criteria && parsed.kill_criteria.trim()) {
    sections.push({
      kind: "kill_criteria",
      content: { text: parsed.kill_criteria.trim() },
    });
  }
  const risk = parsed.risk;
  if (risk?.text && risk.text.trim()) {
    sections.push({
      kind: "risk",
      content: {
        text: risk.text.trim(),
        ...(risk.severity ? { severity: risk.severity } : {}),
        ...(risk.mitigation ? { mitigation: risk.mitigation } : {}),
      },
    });
  }
  if (Array.isArray(parsed.agent_notes)) {
    for (const note of parsed.agent_notes) {
      if (!note.question || !note.assumption) continue;
      sections.push({
        kind: "agent_note",
        content: {
          question: note.question.trim(),
          assumption: note.assumption.trim(),
          decision: "",
          ...(note.alternatives ? { alternatives: note.alternatives.trim() } : {}),
        },
      });
    }
  }
  return sections;
}

async function markLoopFailed(loopRunId: string, e: unknown): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("loop_runs")
    .update({
      status: "failed",
      error_message: e instanceof Error ? e.message : "unknown",
    })
    .eq("id", loopRunId);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
