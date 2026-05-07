import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

// Default models per CLAUDE.md:
//   - claude-opus-4-7 for generation
//   - claude-haiku-4-5-20251001 for classification
export const DEFAULT_MODEL = "claude-opus-4-7";
export const CHEAP_MODEL = "claude-haiku-4-5-20251001";

// Approximate pricing (cents per million tokens). voyage-3 input is
// ~$0.06/M; for Anthropic the rough numbers we charge against budget are
// listed below. Actual invoice comes from Anthropic.
const COST_TABLE_CENTS_PER_M = {
  "claude-opus-4-7": { input: 1500, output: 7500 },
  "claude-haiku-4-5-20251001": { input: 80, output: 400 },
} as const;

let cached: Anthropic | null = null;

function getClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "REPLACE_ME") {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export function resetClientForTests(): void {
  cached = null;
}

export type CostUsage = {
  inputTokens: number;
  outputTokens: number;
  cents: number;
  model: string;
};

function costFor(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = COST_TABLE_CENTS_PER_M[model as keyof typeof COST_TABLE_CENTS_PER_M];
  if (!rate) return 0;
  const cents =
    (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
  return Math.ceil(cents);
}

export type RunAgentOptions = {
  /** loop_runs row already created by the caller — invoker logs cost into this row. */
  loopRunId: string;
  /** Skill identifier for trace metadata. */
  skill: string;
  /** Venture context for trace metadata. Required for venture-portability. */
  ventureId: string;
  systemPrompt: string;
  userMessage: string;
  budgetTokens: number;
  budgetCents: number;
  model?: string;
  maxOutputTokens?: number;
};

export type RunAgentResult =
  | {
      ok: true;
      text: string;
      usage: CostUsage;
      stop_reason: string | null;
    }
  | {
      ok: false;
      error: string;
      partial?: { inputTokens: number; outputTokens: number; cents: number };
    };

/**
 * Single-shot agent invocation. Enforces budgets, logs cost back to the
 * caller's loop_runs row, returns text. Tool-use / streaming live in
 * future helpers.
 */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const supabase = createSupabaseAdminClient();
  const startedAt = Date.now();

  let client: Anthropic;
  try {
    client = getClient();
  } catch (e) {
    const error = e instanceof Error ? e.message : "client init failed";
    await markFailed(supabase, opts.loopRunId, error, model, Date.now() - startedAt);
    return { ok: false, error };
  }

  // Anthropic SDK normalises max_tokens; cap at our budget output remainder.
  const maxOutputTokens = Math.min(
    opts.maxOutputTokens ?? 4096,
    Math.max(256, Math.floor(opts.budgetTokens * 0.6)),
  );

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxOutputTokens,
      system: opts.systemPrompt,
      messages: [{ role: "user", content: opts.userMessage }],
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "anthropic call failed";
    await markFailed(supabase, opts.loopRunId, error, model, Date.now() - startedAt);
    return { ok: false, error };
  }

  // Concatenate text blocks
  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const cents = costFor(model, inputTokens, outputTokens);

  // Budget guard — log as blown_budget but still return content
  const blownTokens = totalTokens > opts.budgetTokens;
  const blownCents = cents > opts.budgetCents;
  const status =
    blownTokens || blownCents ? "blown_budget" : "succeeded";

  const updateInput: Json = {
    skill: opts.skill,
    model,
    stop_reason: response.stop_reason ?? null,
    blown_tokens: blownTokens,
    blown_cents: blownCents,
  };
  await supabase
    .from("loop_runs")
    .update({
      status,
      tokens_in: inputTokens,
      tokens_out: outputTokens,
      cost_cents: cents,
      duration_ms: Date.now() - startedAt,
      model,
      input: updateInput,
    })
    .eq("id", opts.loopRunId);

  return {
    ok: true,
    text,
    usage: { inputTokens, outputTokens, cents, model },
    stop_reason: response.stop_reason,
  };
}

async function markFailed(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  loopRunId: string,
  error: string,
  model: string,
  durationMs: number,
): Promise<void> {
  await supabase
    .from("loop_runs")
    .update({
      status: "failed",
      error_message: error,
      duration_ms: durationMs,
      model,
    })
    .eq("id", loopRunId);
}

/**
 * Parse a JSON object out of an LLM response. Expects either a clean
 * JSON object or a fenced ```json block. Returns null on failure.
 */
export function extractJson<T = unknown>(text: string): T | null {
  const trimmed = text.trim();
  // Try fenced block first
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Try the largest balanced { } range
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
