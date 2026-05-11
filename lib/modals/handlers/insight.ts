import "server-only";
import type { InsightAction } from "../types";

export async function handleInsight(
  _modalEventId: string,
  _action: InsightAction,
): Promise<void> {
  // Insight actions are UI navigation only — action_taken telemetry is written
  // by the caller (apply-action.ts). No DB side effects needed.
}
