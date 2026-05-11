// lib/modals/types.ts
//
// ModalAction — compile-time discriminated union enforcing valid actions per archetype.
// No `any`. Each variant maps to exactly one archetype handler.

export type DecisionAction =
  | { archetype: "decision"; action: "approved" }
  | { archetype: "decision"; action: "refined" }
  | { archetype: "decision"; action: "rejected" };

export type BriefAction =
  | { archetype: "brief"; action: "open_queue" }
  | { archetype: "brief"; action: "mark_read" }
  | { archetype: "brief"; action: "dismissed" };

export type InsightAction =
  | { archetype: "insight"; action: "take_action" }
  | { archetype: "insight"; action: "snoozed" }
  | { archetype: "insight"; action: "dismissed" };

export type AlertAction =
  | { archetype: "alert"; action: "take_action" }
  | { archetype: "alert"; action: "acknowledged" };

export type CompletionAction =
  | { archetype: "completion"; action: "open_canvas" }
  | { archetype: "completion"; action: "send_to" }
  | { archetype: "completion"; action: "dismissed" };

export type QuestionAction =
  | { archetype: "question"; action: "pick_option"; option: string }
  | { archetype: "question"; action: "deferred" };

export type PromotionAction =
  | { archetype: "promotion"; action: "promoted" }
  | { archetype: "promotion"; action: "keep_current" }
  | { archetype: "promotion"; action: "decide_later" };

export type EscalationAction =
  | { archetype: "escalation"; action: "approve_once" }
  | { archetype: "escalation"; action: "adjust_rule" }
  | { archetype: "escalation"; action: "rejected" }
  | { archetype: "escalation"; action: "demoted" };

export type ModalAction =
  | DecisionAction
  | BriefAction
  | InsightAction
  | AlertAction
  | CompletionAction
  | QuestionAction
  | PromotionAction
  | EscalationAction;

export type ApplyModalActionInput = {
  modalEventId: string;
  action: ModalAction;
  /** Operator-supplied notes (optional, stored in eval_runs). */
  notes?: string;
};

export type ApplyModalActionResult =
  | { ok: true; actionId: string | null }
  | { ok: false; error: string };
