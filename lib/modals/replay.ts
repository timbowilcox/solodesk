import "server-only";

// lib/modals/replay.ts
//
// Deferred tool-call replay dispatcher.
// Called by the deferred-replay cron for approved deferred_actions rows.
// Each registered tool maps to a typed handler that reconstructs and
// re-fires the original tool call.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ReplayResult =
  | { ok: true }
  | { ok: false; error: string };

type ToolHandler = (
  params: Record<string, unknown>,
  ventureId: string | null,
) => Promise<ReplayResult>;

// ─── Tool handler registry ────────────────────────────────────────────────────
// Add entries here as new gated tools gain replay implementations.
// In Phase B, the gate tools (send_email, publish_post, etc.) are stubs —
// the real implementations are wired in Phase C when the skill layer is complete.

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  send_email: async (_params, _ventureId) => {
    // Phase C: invoke the email-sender skill with params.
    return { ok: false, error: "send_email replay not yet implemented" };
  },
  publish_post: async (_params, _ventureId) => {
    return { ok: false, error: "publish_post replay not yet implemented" };
  },
  pay_invoice: async (_params, _ventureId) => {
    return { ok: false, error: "pay_invoice replay not yet implemented" };
  },
  sign_contract: async (_params, _ventureId) => {
    return { ok: false, error: "sign_contract replay not yet implemented" };
  },
  execute_trade: async (_params, _ventureId) => {
    return { ok: false, error: "execute_trade replay not yet implemented" };
  },
  modify_production_data: async (_params, _ventureId) => {
    return { ok: false, error: "modify_production_data replay not yet implemented" };
  },
  allocate_budget: async (_params, _ventureId) => {
    return { ok: false, error: "allocate_budget replay not yet implemented" };
  },
};

// ─── Replay entry point ───────────────────────────────────────────────────────

export async function replayDeferredAction(deferredId: string): Promise<ReplayResult> {
  const supabase = createSupabaseAdminClient();

  const { data: deferred, error } = await supabase
    .from("deferred_actions")
    .select("id, skill_id, tool, params, venture_id, status")
    .eq("id", deferredId)
    .single();

  if (error || !deferred) {
    return { ok: false, error: `deferred_actions row not found: ${error?.message ?? "unknown"}` };
  }

  if (deferred.status !== "approved") {
    return { ok: false, error: `unexpected status: ${deferred.status as string}` };
  }

  const handler = TOOL_HANDLERS[deferred.tool as string];
  if (!handler) {
    await supabase
      .from("deferred_actions")
      .update({ status: "failed", error: `no handler for tool: ${deferred.tool as string}`, replayed_at: new Date().toISOString() })
      .eq("id", deferredId);
    return { ok: false, error: `no handler for tool: ${deferred.tool as string}` };
  }

  const params = (deferred.params as Record<string, unknown>) ?? {};
  const ventureId = (deferred.venture_id as string | null) ?? null;

  const result = await handler(params, ventureId);

  if (result.ok) {
    await supabase
      .from("deferred_actions")
      .update({ status: "replayed", replayed_at: new Date().toISOString() })
      .eq("id", deferredId);
  } else {
    await supabase
      .from("deferred_actions")
      .update({ status: "failed", error: result.error, replayed_at: new Date().toISOString() })
      .eq("id", deferredId);
  }

  return result;
}
