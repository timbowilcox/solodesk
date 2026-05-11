import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeEvalRun } from "@/lib/autonomy/gateway";
import type { EscalationAction } from "../types";

export async function handleEscalation(
  modalEventId: string,
  action: EscalationAction,
  actionId: string | null,
  skillId: string | null,
  notes?: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  // Fetch scope info from the modal_events row.
  const { data: event } = await supabase
    .from("modal_events")
    .select("scope_id, scope_type")
    .eq("id", modalEventId)
    .single();

  const resolvedSkillId = skillId ?? (event?.scope_id as string | null);

  if (action.action === "approve_once") {
    if (actionId && resolvedSkillId) {
      await writeEvalRun({
        actionId,
        skillId: resolvedSkillId,
        outcome: "approved",
        notes,
      });
    }
    // Mark deferred_action as approved — the cron will replay it once.
    await supabase
      .from("deferred_actions")
      .update({ status: "approved" })
      .eq("modal_event_id", modalEventId);

    // Resolve the escalation row.
    if (actionId) {
      await supabase
        .from("escalations")
        .update({ resolved_at: new Date().toISOString(), resolution: "approved" })
        .eq("action_id", actionId);
    }

  } else if (action.action === "rejected") {
    if (actionId && resolvedSkillId) {
      await writeEvalRun({
        actionId,
        skillId: resolvedSkillId,
        outcome: "rejected",
        notes,
      });
    }
    await supabase
      .from("deferred_actions")
      .update({ status: "rejected" })
      .eq("modal_event_id", modalEventId);

    if (actionId) {
      await supabase
        .from("escalations")
        .update({ resolved_at: new Date().toISOString(), resolution: "rejected" })
        .eq("action_id", actionId);
    }

  } else if (action.action === "demoted") {
    if (actionId && resolvedSkillId) {
      await writeEvalRun({
        actionId,
        skillId: resolvedSkillId,
        outcome: "rejected",
        notes,
      });
    }
    // Demote one level: insert an autonomy_levels row at `advise`.
    // (In v0 all escalation demotions floor to advise — steward→operate demotion is Phase C.)
    if (resolvedSkillId) {
      await supabase.from("autonomy_levels").insert({
        scope_type: "skill" as const,
        scope_id: resolvedSkillId,
        level: "advise" as const,
        hard_advise_only: false,
      });
    }
    await supabase
      .from("deferred_actions")
      .update({ status: "rejected" })
      .eq("modal_event_id", modalEventId);

    if (actionId) {
      await supabase
        .from("escalations")
        .update({ resolved_at: new Date().toISOString(), resolution: "demoted" })
        .eq("action_id", actionId);
    }

  } else {
    // adjust_rule: keep deferred pending, let operator update guardrail config.
    if (actionId) {
      await supabase
        .from("escalations")
        .update({ resolved_at: new Date().toISOString(), resolution: "approved" })
        .eq("action_id", actionId);
    }
  }
}
