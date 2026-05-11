"use server";

// lib/autonomy/replay.ts
//
// Deferred tool-call replay dispatcher.
// Called by the deferred-replay cron (approved rows) and via the exported
// server action for manual operator trigger.
//
// Contract:
//   - Atomic status guard: UPDATE WHERE status='approved' → 'executing'.
//     If 0 rows returned, another cron tick already claimed the row — skip.
//   - Kill switch checked after claiming; approval before kill ≠ permission after.
//   - Bypasses the autonomy gateway — operator modal approval IS the override.
//   - Writes a new actions row (via_modal=true) linking back to the original
//     modal_event_id and deferred_action_id for full audit trail.
//   - tool='' (Promotion archetype — no tool to replay) → silently executed.
//   - tool_not_found → status='failed', no escalation.
//   - handler throws → status='failed', escalation written.
//   - handler returns ok:false → status='failed', no escalation (controlled).
//   - kill_switch_engaged → status='failed', no escalation.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkKillSwitch } from "@/lib/autonomy/gateway";
import { runStreamingLoop } from "@/lib/loops/runner";
import { SUPPORTED_LOOPS } from "@/lib/loops/config";
import type { Json } from "@/lib/supabase/types";

type ReplayResult = { ok: true } | { ok: false; error: string };

type ToolHandler = (
  params: Record<string, unknown>,
  ventureId: string | null,
) => Promise<ReplayResult>;

// ─── Tool execution registry ──────────────────────────────────────────────────
// invoke_loop is the primary Phase B tool. Gate tools (send_email, etc.) are
// stubs here — Phase C wires their real skill invocations.

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  invoke_loop: async (params, ventureId) => {
    const loopId = typeof params.loopId === "string" ? params.loopId : null;
    const task = typeof params.task === "string" ? params.task : null;
    const title = typeof params.title === "string" ? params.title : "Untitled";

    if (!loopId || !task || !ventureId) {
      return {
        ok: false,
        error: `invoke_loop: missing params (loopId=${loopId ?? "null"}, task=${task !== null}, ventureId=${ventureId !== null})`,
      };
    }

    const config = SUPPORTED_LOOPS[loopId];
    if (!config) {
      return { ok: false, error: `invoke_loop: unknown loopId '${loopId}'` };
    }

    await runStreamingLoop(
      {
        loopName: config.loopName,
        loopId,
        ventureId,
        documentType: config.documentType,
        documentTitle: title,
        systemSkillPrompt: config.skillPrompt,
        task,
        budgetTokens: config.budgetTokens,
        budgetCents: config.budgetCents,
      },
      () => {}, // no-op emit — cron has no response stream to write to
    );

    return { ok: true };
  },

  send_email: async () => ({ ok: false, error: "send_email replay not yet implemented" }),
  publish_post: async () => ({ ok: false, error: "publish_post replay not yet implemented" }),
  pay_invoice: async () => ({ ok: false, error: "pay_invoice replay not yet implemented" }),
  sign_contract: async () => ({ ok: false, error: "sign_contract replay not yet implemented" }),
  execute_trade: async () => ({ ok: false, error: "execute_trade replay not yet implemented" }),
  modify_production_data: async () => ({ ok: false, error: "modify_production_data replay not yet implemented" }),
  allocate_budget: async () => ({ ok: false, error: "allocate_budget replay not yet implemented" }),
};

// ─── Core replay logic ────────────────────────────────────────────────────────

export async function replayApprovedTool(deferredActionId: string): Promise<ReplayResult> {
  const supabase = createSupabaseAdminClient();

  // Atomic optimistic lock: transition approved → executing.
  // Using UPDATE WHERE status='approved' as the concurrency guard — if another
  // cron tick already claimed this row the UPDATE returns 0 rows.
  const { data: claimed } = await supabase
    .from("deferred_actions")
    .update({ status: "executing" })
    .eq("id", deferredActionId)
    .eq("status", "approved")
    .select("id, skill_id, tool, params, venture_id, action_id, modal_event_id")
    .maybeSingle();

  if (!claimed) {
    // Not in 'approved' state — already executing, executed, or failed by another process.
    return { ok: false, error: "row not in approved state — skipped" };
  }

  const tool = (claimed.tool as string) ?? "";

  // Empty tool = Promotion archetype — no actual tool call to replay.
  if (tool === "") {
    await supabase
      .from("deferred_actions")
      .update({ status: "executed", replayed_at: new Date().toISOString() })
      .eq("id", deferredActionId);
    return { ok: true };
  }

  // Kill switch — approval before kill does not grant permission after.
  const killed = await checkKillSwitch();
  if (killed) {
    await supabase
      .from("deferred_actions")
      .update({
        status: "failed",
        error: "kill_switch_engaged",
        replayed_at: new Date().toISOString(),
      })
      .eq("id", deferredActionId);
    return { ok: false, error: "kill_switch_engaged" };
  }

  const skillId = claimed.skill_id as string;
  const params = (claimed.params as Record<string, unknown>) ?? {};
  const ventureId = (claimed.venture_id as string | null) ?? null;
  const originalActionId = (claimed.action_id as string | null) ?? null;
  const modalEventId = (claimed.modal_event_id as string | null) ?? null;

  // Look up original autonomy_level for the replayed actions row.
  let originalLevel: "advise" | "operate" | "steward" = "advise";
  if (originalActionId) {
    const { data: orig } = await supabase
      .from("actions")
      .select("autonomy_level")
      .eq("id", originalActionId)
      .maybeSingle();
    if (orig?.autonomy_level) {
      originalLevel = orig.autonomy_level as typeof originalLevel;
    }
  }

  // Tool not found — fail silently (no escalation, operator can't act on a bad registry).
  const handler = TOOL_HANDLERS[tool];
  if (!handler) {
    await supabase
      .from("deferred_actions")
      .update({
        status: "failed",
        error: "tool_not_found",
        replayed_at: new Date().toISOString(),
      })
      .eq("id", deferredActionId);
    return { ok: false, error: "tool_not_found" };
  }

  // Dispatch to handler. Distinguish unexpected throw (escalate) from controlled
  // ok:false return (no escalation — Phase C stubs use this path).
  let result: ReplayResult;
  let handlerThrew = false;
  try {
    result = await handler(params, ventureId);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "handler threw" };
    handlerThrew = true;
  }

  if (result.ok) {
    // Audit trail: new actions row for the replayed execution.
    try {
      await supabase.from("actions").insert({
        skill_id: skillId,
        venture_id: ventureId,
        tool,
        params: params as Json,
        autonomy_level: originalLevel,
        modal_surfaced: false,
        via_modal: true,
        deferred_action_id: deferredActionId,
        modal_event_id: modalEventId,
        result: { ok: true } as Json,
      });
    } catch (e) {
      // Non-fatal — audit write failure should not undo the actual execution.
      console.error("[replay] actions row insert failed", e);
    }

    await supabase
      .from("deferred_actions")
      .update({ status: "executed", replayed_at: new Date().toISOString() })
      .eq("id", deferredActionId);
  } else {
    // Escalation only for unexpected throws — stubs returning ok:false are expected.
    if (handlerThrew && originalActionId) {
      try {
        await supabase.from("escalations").insert({
          action_id: originalActionId,
          skill_id: skillId,
          reason: `replay failed: ${result.error}`,
          trigger_type: "config_error" as const,
        });
      } catch {
        // Non-fatal
      }
    }

    await supabase
      .from("deferred_actions")
      .update({
        status: "failed",
        error: result.error,
        replayed_at: new Date().toISOString(),
      })
      .eq("id", deferredActionId);
  }

  return result;
}

// ─── Server action wrapper ────────────────────────────────────────────────────
// Export for manual operator replay trigger from UI. Thin wrapper so the
// cron can call replayApprovedTool directly without going through the action layer.

export async function replayDeferredAction(deferredActionId: string): Promise<ReplayResult> {
  return replayApprovedTool(deferredActionId);
}
