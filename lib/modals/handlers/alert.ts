import "server-only";
import type { AlertAction } from "../types";

export async function handleAlert(
  _modalEventId: string,
  _action: AlertAction,
): Promise<void> {
  // Alert actions are acknowledgement only — action_taken telemetry is written
  // by the caller (apply-action.ts). No DB side effects needed.
}
