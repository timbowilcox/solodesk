import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { VentureMarkSlug, VenturePhase } from "@/lib/supabase/types";

/**
 * One row per visible venture, fully populated by the `bridge_tiles` Postgres
 * function in a single roundtrip. The Sprint 8 quality rubric requires this
 * to be one query — do not split across per-venture roundtrips.
 *
 * Membership filtering happens INSIDE the function at the SQL layer. The
 * client cannot widen the visible set by mutating the input.
 */
export type BridgeTile = {
  ventureId: string;
  slug: string;
  name: string;
  phase: VenturePhase;
  accentColor: string;
  markSlug: VentureMarkSlug;
  state: BridgeTileState;
  pendingCount: number;
  lastActivityAt: string | null;
  vitalSign: string | null;
  sparkline: number[];
  connections: string[];
};

export type BridgeTileState = "active" | "idle" | "quiet";

export type ListBridgeTilesInput = {
  userId: string;
  isAdmin: boolean;
};

export type ListBridgeTilesResult =
  | { ok: true; tiles: BridgeTile[] }
  | { ok: false; error: string };

/**
 * Fetch all Bridge tiles the user can see in one SQL roundtrip.
 *
 * Bright line: the function takes (userId, isAdmin) and filters on the SQL
 * side. A member who passes isAdmin=true cannot escalate — the caller
 * (server component) is responsible for honestly forwarding the user's
 * actual role from `requireUserContext()`.
 */
export async function listBridgeTiles(
  input: ListBridgeTilesInput,
): Promise<ListBridgeTilesResult> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("bridge_tiles", {
    p_user_id: input.userId,
    p_is_admin: input.isAdmin,
  });
  if (error) {
    console.error("[bridge] listBridgeTiles failed", error.message);
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: true, tiles: [] };
  const tiles = data.map<BridgeTile>((row) => ({
    ventureId: row.venture_id,
    slug: row.slug,
    name: row.name,
    phase: row.phase,
    accentColor: row.accent_color,
    markSlug: row.mark_slug,
    state: row.state,
    pendingCount: row.pending_count,
    lastActivityAt: row.last_activity_at,
    vitalSign: row.vital_sign,
    sparkline: Array.isArray(row.sparkline) ? row.sparkline : [],
    connections: Array.isArray(row.connections) ? row.connections : [],
  }));
  return { ok: true, tiles };
}
