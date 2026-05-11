import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeEvalRun } from "@/lib/autonomy/gateway";
import type { DecisionAction } from "../types";

export async function handleDecision(
  modalEventId: string,
  action: DecisionAction,
  actionId: string | null,
  skillId: string | null,
  notes?: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  if (action.action === "approved") {
    // Write eval_run so the trust ratchet can accumulate.
    if (actionId && skillId) {
      await writeEvalRun({
        actionId,
        skillId,
        outcome: "approved",
        notes,
      });
    }
    // Mark deferred_action as approved — the cron will replay it.
    await supabase
      .from("deferred_actions")
      .update({ status: "approved" })
      .eq("modal_event_id", modalEventId);

  } else if (action.action === "rejected") {
    if (actionId && skillId) {
      await writeEvalRun({
        actionId,
        skillId,
        outcome: "rejected",
        notes,
      });
    }
    await supabase
      .from("deferred_actions")
      .update({ status: "rejected" })
      .eq("modal_event_id", modalEventId);

  } else {
    // refined: operator wants to adjust params before replaying.
    // Keep deferred_action as pending; operator will re-approve via UI.
    if (actionId && skillId) {
      await writeEvalRun({
        actionId,
        skillId,
        outcome: "deferred",
        notes,
      });
    }
  }
}
