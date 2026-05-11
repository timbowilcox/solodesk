import "server-only";
import type { QuestionAction } from "../types";

export async function handleQuestion(
  _modalEventId: string,
  _action: QuestionAction,
): Promise<void> {
  // Question actions (pick_option / deferred) are recorded via action_taken.
  // The chosen option string is already embedded in the action discriminant
  // and written to modal_events.action_taken by the caller (apply-action.ts).
}
