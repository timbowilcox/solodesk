import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PromotionAction } from "../types";

export async function handlePromotion(
  modalEventId: string,
  action: PromotionAction,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  if (action.action === "promoted") {
    // Read the modal_events.payload to get the target level.
    const { data: event } = await supabase
      .from("modal_events")
      .select("scope_id, payload")
      .eq("id", modalEventId)
      .single();

    const payload = event?.payload as Record<string, unknown> | null;
    const skillId = event?.scope_id as string | undefined;
    const toLevel = (payload?.to_level as string) ?? "operate";

    if (skillId) {
      await supabase.from("autonomy_levels").insert({
        scope_type: "skill" as const,
        scope_id: skillId,
        level: toLevel as "advise" | "operate" | "steward",
        hard_advise_only: false,
      });
    }

    // Mark any pending deferred_action for this modal as approved so the cron
    // can replay it at the newly promoted level.
    await supabase
      .from("deferred_actions")
      .update({ status: "approved" })
      .eq("modal_event_id", modalEventId)
      .eq("status", "pending");

  } else if (action.action === "decide_later") {
    // Defer for 7 days — the cron will re-surface the modal.
    const retryAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await supabase
      .from("deferred_actions")
      .update({ status: "deferred", retry_at: retryAt })
      .eq("modal_event_id", modalEventId);

  }
  // keep_current: no DB writes — just telemetry via action_taken (caller).
}
