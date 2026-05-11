import "server-only";
import type { BriefAction } from "../types";

export async function handleBrief(
  _modalEventId: string,
  _action: BriefAction,
): Promise<void> {
  // Brief actions are UI navigation only — action_taken telemetry is written
  // by the caller (apply-action.ts). No DB side effects needed.
}
