import "server-only";
import type { CompletionAction } from "../types";

export async function handleCompletion(
  _modalEventId: string,
  _action: CompletionAction,
): Promise<void> {
  // Completion actions are UI navigation only — action_taken telemetry is written
  // by the caller (apply-action.ts). No DB side effects needed.
}
