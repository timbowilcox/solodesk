"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ApplyModalActionInput, ApplyModalActionResult } from "./types";
import { handleDecision } from "./handlers/decision";
import { handleBrief } from "./handlers/brief";
import { handleInsight } from "./handlers/insight";
import { handleAlert } from "./handlers/alert";
import { handleCompletion } from "./handlers/completion";
import { handleQuestion } from "./handlers/question";
import { handlePromotion } from "./handlers/promotion";
import { handleEscalation } from "./handlers/escalation";

/**
 * applyModalAction — server action called by modal archetype components
 * when the operator taps an action button.
 *
 * Validates archetype ↔ action compatibility at runtime (compile-time safety
 * is provided by the ModalAction discriminated union in types.ts), dispatches
 * to the per-archetype handler, then records the action in modal_events.
 */
export async function applyModalAction(
  input: ApplyModalActionInput,
): Promise<ApplyModalActionResult> {
  const supabase = createSupabaseAdminClient();
  const startedAt = Date.now();

  try {
    // Fetch the modal_events row to validate archetype and get context.
    const { data: event, error: fetchError } = await supabase
      .from("modal_events")
      .select("id, archetype, action_id, fired_at, dismissed_at")
      .eq("id", input.modalEventId)
      .single();

    if (fetchError || !event) {
      return { ok: false, error: `modal_events row not found: ${fetchError?.message ?? "unknown"}` };
    }

    // Guard: already actioned.
    if (event.dismissed_at) {
      return { ok: false, error: "modal already dismissed" };
    }

    const archetype = event.archetype as string;
    const actionId = event.action_id as string | null;

    // Runtime archetype↔action validation.
    if (archetype !== input.action.archetype) {
      return {
        ok: false,
        error: `archetype mismatch: event is "${archetype}", action is "${input.action.archetype}"`,
      };
    }

    // Derive skillId from the deferred_actions row (action_id FK).
    let skillId: string | null = null;
    if (actionId) {
      const { data: act } = await supabase
        .from("actions")
        .select("skill_id")
        .eq("id", actionId)
        .single();
      skillId = (act?.skill_id as string | null) ?? null;
    }

    // Dispatch to per-archetype handler.
    const action = input.action;
    switch (action.archetype) {
      case "decision":
        await handleDecision(input.modalEventId, action, actionId, skillId, input.notes);
        break;
      case "brief":
        await handleBrief(input.modalEventId, action);
        break;
      case "insight":
        await handleInsight(input.modalEventId, action);
        break;
      case "alert":
        await handleAlert(input.modalEventId, action);
        break;
      case "completion":
        await handleCompletion(input.modalEventId, action);
        break;
      case "question":
        await handleQuestion(input.modalEventId, action);
        break;
      case "promotion":
        await handlePromotion(input.modalEventId, action);
        break;
      case "escalation":
        await handleEscalation(input.modalEventId, action, actionId, skillId, input.notes);
        break;
    }

    // Record the action in modal_events (telemetry).
    const actionLabel = action.action === "pick_option"
      ? `pick_option:${action.option}`
      : action.action;

    await supabase
      .from("modal_events")
      .update({
        dismissed_at: new Date().toISOString(),
        action_taken: actionLabel,
        time_to_action_ms: Date.now() - startedAt,
      })
      .eq("id", input.modalEventId);

    return { ok: true, actionId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "applyModalAction error";
    return { ok: false, error: message };
  }
}
