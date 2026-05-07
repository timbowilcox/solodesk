import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { VentureFunctionState } from "@/components/venture/VentureBridge";

/**
 * Fetch the six function-state lines for a single venture in one round-trip.
 *
 * Each function maps to a domain count or "quiet". The numbers are short and
 * scannable — operator should glance at the Venture Bridge and know which
 * function needs attention without drilling into each domain.
 *
 * Bright line: takes ventureId, scopes every query to that ventureId.
 * No cross-venture leakage path.
 */
export async function getVentureFunctionState(
  ventureId: string,
): Promise<VentureFunctionState> {
  const supabase = createSupabaseAdminClient();

  // Pull all relevant counts in parallel — single render, multiple queries
  // is fine for a per-venture page (vs. the Bridge which sees N ventures).
  const [
    decisionsRes,
    digestsRes,
    contentRes,
    supportRes,
    connectionsRes,
    memoriesRes,
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("venture_id", ventureId)
      .eq("type", "decision")
      .in("status", ["draft", "reviewing"]),
    supabase
      .from("documents")
      .select("created_at")
      .eq("venture_id", ventureId)
      .eq("type", "daily_digest")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("venture_id", ventureId)
      .eq("type", "content")
      .in("status", ["draft", "reviewing"]),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("venture_id", ventureId)
      .eq("type", "support_ticket")
      .in("status", ["draft", "reviewing"]),
    supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("venture_id", ventureId)
      .is("revoked_at", null),
    supabase
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("venture_id", ventureId),
  ]);

  return {
    strategy: stateLine(decisionsRes.count, "decision in review", "decisions in review"),
    metrics: digestStateLine(digestsRes.data?.created_at ?? null),
    content: stateLine(contentRes.count, "draft", "drafts"),
    customers: stateLine(supportRes.count, "open ticket", "open tickets"),
    compliance: stateLine(
      connectionsRes.count,
      "connection",
      "connections",
      "No connections",
    ),
    operations: stateLine(
      memoriesRes.count,
      "memory",
      "memories",
      "No memories yet",
    ),
  };
}

function stateLine(
  count: number | null | undefined,
  singular: string,
  plural: string,
  emptyText = "Quiet",
): string {
  const n = count ?? 0;
  if (n === 0) return emptyText;
  if (n === 1) return `1 ${singular}`;
  return `${n} ${plural}`;
}

function digestStateLine(latestCreatedAt: string | null): string {
  if (!latestCreatedAt) return "No digests yet";
  const ts = new Date(latestCreatedAt).getTime();
  const diffMs = Date.now() - ts;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Latest digest today";
  if (days === 1) return "Latest digest yesterday";
  if (days < 7) return `Latest digest ${days}d ago`;
  if (days < 30) return `Latest digest ${Math.floor(days / 7)}w ago`;
  return `Latest digest ${Math.floor(days / 30)}mo ago`;
}
