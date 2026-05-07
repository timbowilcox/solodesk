import "server-only";

// Loop 8 reactive — single entry point for all three trigger types.
//
// Triggers converge here:
//   - Stripe webhook handler calls triggerLoop8({ source: 'webhook', ... })
//   - Threshold cron calls triggerLoop8({ source: 'threshold', ... })
//   - Command bar 'loop8-investigate' handler calls triggerLoop8({ source: 'manual', ... })
//
// Bright lines kept:
//   - venture_id flows through; never null
//   - Dedup before runner invocation; same fingerprint within 1h is suppressed
//   - Loop output uses the streaming substrate; goes through buildAgentPrompt
//   - Output is typed Sections — Loop 8 prompt enforces the kind whitelist

import { runStreamingLoop, type SseEvent } from "@/lib/loops/runner";
import { LOOP8_INVESTIGATOR_SKILL_PROMPT } from "@/lib/loops/skills/loop8-investigator";
import {
  computeFingerprint,
  recordFingerprint,
  shouldDedup,
} from "@/lib/loops/loop-8/dedup";
import type {
  AnomalyFingerprintSource,
  Json,
} from "@/lib/supabase/types";

const LOOP8_BUDGET_TOKENS = 18_000;
const LOOP8_BUDGET_CENTS = 60;

export type Loop8TriggerInput = {
  source: AnomalyFingerprintSource;
  ventureId: string;
  metricKind: string;
  /** Short title for the produced Document. */
  title: string;
  /** Body the runner will hand to buildAgentPrompt as the task. */
  task: string;
  /** Trigger context recorded on the fingerprint row for audit. */
  payload?: Json;
};

export type Loop8TriggerResult =
  | { ok: true; documentId: string; runId: string; deduped: false }
  | { ok: true; deduped: true }
  | { ok: false; error: string };

/**
 * Idempotent invocation of Loop 8. Computes a fingerprint, dedups,
 * runs the streaming Loop, records the fingerprint with the resulting
 * documentId.
 *
 * Caller is typically a route handler (webhook, cron, command bar
 * handler). The streaming SSE events are discarded for fire-and-forget
 * invocations (webhook); the command bar calls the underlying runner
 * directly so it can stream to the operator's UI.
 */
export async function triggerLoop8(
  input: Loop8TriggerInput,
): Promise<Loop8TriggerResult> {
  const fingerprint = computeFingerprint({
    ventureId: input.ventureId,
    metricKind: input.metricKind,
  });
  const isDup = await shouldDedup({
    ventureId: input.ventureId,
    fingerprint,
  });
  if (isDup) {
    return { ok: true, deduped: true };
  }

  // Discard SSE events — webhook/cron triggers are background; we don't
  // stream to anyone.
  const noopEmit = (event: SseEvent) => {
    void event;
  };

  let runId = "";
  let documentId = "";
  try {
    const handle = await runStreamingLoop(
      {
        loopName: "08-metrics-investigator",
        loopId: "08-metrics",
        ventureId: input.ventureId,
        documentType: "decision",
        documentTitle: input.title,
        systemSkillPrompt: LOOP8_INVESTIGATOR_SKILL_PROMPT,
        task: input.task,
        budgetTokens: LOOP8_BUDGET_TOKENS,
        budgetCents: LOOP8_BUDGET_CENTS,
      },
      noopEmit,
    );
    runId = handle.runId;
    documentId = handle.documentId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "runner threw" };
  }

  // Record fingerprint regardless of run outcome — even a failed run
  // shouldn't re-fire on the same fingerprint within the dedup window.
  await recordFingerprint({
    ventureId: input.ventureId,
    fingerprint,
    documentId: documentId || null,
    source: input.source,
    payload: input.payload ?? ({} as Json),
  });

  return { ok: true, deduped: false, documentId, runId };
}
