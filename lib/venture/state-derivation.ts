// Pure derivation helpers for the Bridge tile.
//
// Separated from /lib/db/bridge.ts so the formatting + display logic stays
// trivially unit-testable without a Supabase round-trip. The RPC produces
// raw tile state; these functions render it for the UI.
//
// SPRINT 8 CAVEAT — `documents.status='drafting'` is reserved for Sprint 10
// (streaming Sections). Until then, the active StateDot derives purely from
// loop_runs activity in the last 5 minutes (handled at the SQL layer). When
// Sprint 10 ships, the SQL function will extend to include drafting docs;
// no change to these derivers is needed.

import type { BridgeTile, BridgeTileState } from "@/lib/db/bridge";

/**
 * Cap pending count at 99 for display. The DB still returns the true count;
 * the cap is purely visual.
 */
export function formatPendingCount(count: number): string {
  if (count <= 0) return "0 pending";
  if (count > 99) return "99+ pending";
  if (count === 1) return "1 pending";
  return `${count} pending`;
}

/**
 * Human-readable "last activity" string. Returns "No activity" when the
 * tile has never logged anything (timestamp null).
 *
 * Coarse buckets — we don't need second-precision on the Bridge.
 */
export function formatLastActivity(
  ts: string | null,
  now: Date = new Date(),
): string {
  if (!ts) return "No activity";
  const then = new Date(ts);
  if (Number.isNaN(then.getTime())) return "No activity";
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 60_000) return "Just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * The vital-sign string is a short, punchy summary the operator scans first.
 * Until Loops produce richer signals, the RPC returns the latest event's
 * `source · type` string. This helper falls back to a quiet default.
 */
export function formatVitalSign(
  vitalSign: string | null,
  state: BridgeTileState,
): string {
  if (vitalSign && vitalSign.trim().length > 0) return vitalSign;
  if (state === "active") return "Working now";
  if (state === "idle") return "Recent activity";
  return "No activity";
}

/**
 * Map BridgeTileState to the StateDot component's status prop.
 */
export function tileStateToDot(
  state: BridgeTileState,
): "active" | "idle" | "quiet" {
  return state;
}

/**
 * Time-of-day chrome tone derivation. Returns the tone keyword for the
 * --chrome-tone CSS variable. Single source of truth for the cutoffs so
 * the TimeOfDayProvider client component and any server-side preview
 * stay in sync.
 *
 * Cutoffs:
 *   06:00–12:00 -> warm   (morning)
 *   12:00–18:00 -> neutral (afternoon)
 *   18:00–06:00 -> cool   (evening / overnight)
 */
export type ChromeTone = "warm" | "neutral" | "cool";

export function chromeToneForHour(hour: number): ChromeTone {
  if (hour >= 6 && hour < 12) return "warm";
  if (hour >= 12 && hour < 18) return "neutral";
  return "cool";
}

/**
 * Helper: is a tile "active" in the rendering sense? Centralises the
 * boolean used by StateDot, the active-pulse styles, and Watch ordering
 * later in Sprint 9.
 */
export function isActiveTile(tile: BridgeTile): boolean {
  return tile.state === "active";
}
