"use server";

// lib/atrium/telemetry.ts
// Server actions for recording modal telemetry to modal_events.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ModalArchetype } from "@/lib/autonomy/types";
import { FREQUENCY_BUDGETS } from "./types";

/**
 * Record that a modal was dismissed.
 * Updates dismissed_at, action_taken, and time_to_action_ms.
 */
export async function recordModalDismiss(opts: {
  modalEventId: string;
  actionTaken: string;
  firedAt: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const timeToActionMs = Date.now() - new Date(opts.firedAt).getTime();

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("modal_events")
    .update({
      dismissed_at: now,
      action_taken: opts.actionTaken,
      time_to_action_ms: Math.max(0, timeToActionMs),
    })
    .eq("id", opts.modalEventId);
}

/**
 * Load the pending modal queue (undismissed modal_events rows),
 * ordered by priority (escalation/alert first) then fired_at asc.
 * Returns up to 50 pending events.
 */
export async function loadPendingModalQueue(): Promise<
  Array<{
    id: string;
    archetype: ModalArchetype;
    scope_id: string;
    scope_type: string;
    action_id: string | null;
    fired_at: string;
  }>
> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("modal_events")
    .select("id, archetype, scope_id, scope_type, action_id, fired_at")
    .is("dismissed_at", null)
    .order("fired_at", { ascending: true })
    .limit(50);

  if (!data) return [];

  // Sort so high-priority archetypes come first.
  const HIGH = new Set(["escalation", "alert"]);
  return [...data].sort((a, b) => {
    const aHigh = HIGH.has(a.archetype) ? 0 : 1;
    const bHigh = HIGH.has(b.archetype) ? 0 : 1;
    if (aHigh !== bHigh) return aHigh - bHigh;
    return new Date(a.fired_at).getTime() - new Date(b.fired_at).getTime();
  }) as Array<{
    id: string;
    archetype: ModalArchetype;
    scope_id: string;
    scope_type: string;
    action_id: string | null;
    fired_at: string;
  }>;
}

/**
 * Check if any archetype has breached its frequency ceiling.
 * Called after every modal surfacing. Logs a warning when a ceiling is hit.
 */
export async function checkFrequencyBudget(archetype: ModalArchetype): Promise<void> {
  const budget = FREQUENCY_BUDGETS.find((b) => b.archetype === archetype);
  if (!budget || budget.ceiling === null) return;

  const supabase = createSupabaseAdminClient();
  const period = budget.period;
  const since = period === "day"
    ? new Date(Date.now() - 86_400_000).toISOString()
    : new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { count } = await supabase
    .from("modal_events")
    .select("id", { count: "exact", head: true })
    .eq("archetype", archetype)
    .gte("fired_at", since);

  if (count !== null && count >= budget.ceiling) {
    // Ceiling breached — log to server console. A future Watch integration
    // can surface this as a system alarm when the events table supports
    // venture_id=null (system-scoped) events.
    console.warn(
      `[atrium] frequency ceiling breached: ${archetype} ${count}/${budget.ceiling} per ${period}`,
    );
  }
}
