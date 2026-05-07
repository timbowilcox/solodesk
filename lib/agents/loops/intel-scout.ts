import "server-only";

import { runAgent, extractJson } from "@/lib/agents/anthropic";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import {
  createDocument,
  type IntelSignal,
  type SectionSeed,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const SYSTEM_PROMPT = `You triage raw observations for one venture's competitive landscape. The operator pastes a week of observations (URLs, screenshots-as-text, summaries, Reddit/X/HN posts they noticed). You produce a structured signals digest the operator can scan in under 5 minutes.

Hard rules:
1. One venture only. Voice, ICP, anti-patterns from this venture's COMPANY.md.
2. Default to noise. Most observations don't matter. Only escalate when the signal is real.
3. Concrete actions. Vague suggestions are noise.
4. Severity has meaning. low = noted, no action this week. medium = action this month if pattern repeats. high = action this week.

Signal classification:
- threat — competitor erodes moat / ICP / pricing, or platform/regulatory change does
- opportunity — gap to move into, partnership shape, wedge a competitor exposed
- noise — interesting but doesn't change the plan

Output contract — return ONLY a JSON object:

{
  "summary": "2-3 sentence weekly summary. What changed, what didn't.",
  "signals": [
    {
      "source": "URL, hand or 'team chat 2026-05-04', or short citation",
      "observation": "What you observed, in 1-2 sentences. Stick to facts.",
      "severity": "low" | "medium" | "high",
      "tag": "threat" | "opportunity" | "noise",
      "suggested_action": "continue_monitoring" | "surface_to_strategy" | "kill" | "escalate",
      "reasoning": "1-2 sentences. Why this severity, why this action."
    }
  ]
}

Anti-patterns: no more than 12 signals; no surface_to_strategy without a concrete strategic question; no "could be an opportunity" hedging; no mention of being an AI.`;

const BUDGET_TOKENS = 30_000;
const BUDGET_CENTS = 80;

export type RunIntelScoutInput = {
  ventureSlug: string;
  observations: string;
};

export type RunIntelScoutResult =
  | {
      ok: true;
      documentId: string;
      loopRunId: string;
      signalCount: number;
      tokensUsed: number;
      costCents: number;
    }
  | { ok: false; error: string };

type AgentJsonShape = {
  summary?: string;
  signals?: IntelSignal[];
};

export async function runIntelScout(
  input: RunIntelScoutInput,
): Promise<RunIntelScoutResult> {
  const venture = await getVentureBySlug(input.ventureSlug);
  if (!venture) return { ok: false, error: "venture not found" };

  const supabase = createSupabaseAdminClient();
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: "intel-scout",
      venture_id: venture.id,
      trigger: "manual",
      input: { observations_chars: input.observations.length } as Json,
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

  const taskPayload = `Observations from the week (paste from sources):\n\n${input.observations}`;

  const composed = await buildAgentPrompt({
    skill: "intel-scout",
    ventureId: venture.id,
    task: taskPayload,
    systemSkillPrompt: SYSTEM_PROMPT,
    budgetTokens: BUDGET_TOKENS,
  });

  const result = await runAgent({
    loopRunId,
    skill: "intel-scout",
    ventureId: venture.id,
    systemPrompt: composed.systemPrompt,
    userMessage: composed.userMessage,
    budgetTokens: BUDGET_TOKENS,
    budgetCents: BUDGET_CENTS,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<AgentJsonShape>(result.text);
  if (!parsed) {
    return { ok: false, error: "scout did not return parseable JSON" };
  }

  const signals = (Array.isArray(parsed.signals) ? parsed.signals : []).slice(
    0,
    12,
  );

  const sections: SectionSeed[] = [];
  if (parsed.summary?.trim()) {
    sections.push({ kind: "prose", content: { text: parsed.summary.trim() } });
  }
  sections.push({
    kind: "intel_signals_table",
    content: { signals },
  });

  const created = await createDocument({
    ventureId: venture.id,
    type: "intel_digest",
    title: `Intel digest — ${formatDate(new Date())}`,
    loopName: "intel-scout",
    sections,
    metadata: {
      loop_run_id: loopRunId,
      generator_skill: "intel-scout",
      signal_count: signals.length,
    },
  });
  if (!created.ok) return { ok: false, error: created.error };

  await supabase
    .from("loop_runs")
    .update({
      input: {
        observations_chars: input.observations.length,
        document_id: created.documentId,
        signal_count: signals.length,
      } as Json,
    })
    .eq("id", loopRunId);

  return {
    ok: true,
    documentId: created.documentId,
    loopRunId,
    signalCount: signals.length,
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
    costCents: result.usage.cents,
  };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
