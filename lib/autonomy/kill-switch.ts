import "server-only";

// lib/autonomy/kill-switch.ts
//
// Server actions for the operator kill switch.
// DB-backed — state survives process restarts.
// Restore is a separate explicit action; no toggling.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUserContext } from "@/lib/auth/guard";
import type { KillSwitchState } from "./types";

/**
 * Flip the kill switch on for the current operator.
 * Forces every tool call to surface a Decision modal until restored.
 * Idempotent: calling while already killed updates the reason only.
 */
export async function killAllAutonomy(reason?: string): Promise<void> {
  const user = await requireUserContext();
  const supabase = createSupabaseAdminClient();

  // Ensure a row exists for this operator.
  await supabase.rpc("ensure_kill_switch_row", { p_operator_id: user.userId });

  await supabase
    .from("operator_kill_switch")
    .update({
      killed: true,
      killed_at: new Date().toISOString(),
      killed_reason: reason ?? null,
      restored_at: null, // clear any prior restore timestamp
    })
    .eq("operator_id", user.userId);
}

/**
 * Restore autonomy for the current operator.
 * Records restored_at timestamp; does not clear killed_at (audit trail).
 */
export async function restoreAutonomy(): Promise<void> {
  const user = await requireUserContext();
  const supabase = createSupabaseAdminClient();

  await supabase.rpc("ensure_kill_switch_row", { p_operator_id: user.userId });

  await supabase
    .from("operator_kill_switch")
    .update({
      killed: false,
      restored_at: new Date().toISOString(),
    })
    .eq("operator_id", user.userId);
}

/**
 * Read the current kill switch state for the calling operator.
 */
export async function getKillSwitchState(): Promise<KillSwitchState> {
  const user = await requireUserContext();
  const supabase = createSupabaseAdminClient();

  await supabase.rpc("ensure_kill_switch_row", { p_operator_id: user.userId });

  const { data } = await supabase
    .from("operator_kill_switch")
    .select("killed, killed_at, killed_reason")
    .eq("operator_id", user.userId)
    .maybeSingle();

  if (!data || !data.killed) return { killed: false };
  return {
    killed: true,
    killedAt: data.killed_at as string,
    killedReason: (data.killed_reason as string | null) ?? null,
  };
}
