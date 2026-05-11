import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { replayApprovedTool } from "@/lib/autonomy/replay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/deferred-replay
 *
 * Processes approved deferred_actions rows whose retry_at is in the past.
 * Called by Vercel Cron every 5 minutes.
 *
 * Status flow: approved → replayed | failed
 * Deferred rows (retry_at = +7d from Promotion "decide later") are re-surfaced
 * by this cron when they cross retry_at — they stay as `deferred` and are
 * re-queued as Promotion modals so the operator gets another chance to decide.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // Fetch approved rows ready to replay.
  const { data: readyRows, error } = await supabase
    .from("deferred_actions")
    .select("id, tool, status")
    .eq("status", "approved")
    .lte("retry_at", now)
    .limit(50);

  if (error) {
    console.error("[deferred-replay] fetch error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch deferred rows whose retry_at has passed — re-surface as Promotion modal.
  const { data: deferredRows } = await supabase
    .from("deferred_actions")
    .select("id, modal_event_id, skill_id")
    .eq("status", "deferred")
    .lte("retry_at", now)
    .limit(20);

  const replayed: string[] = [];
  const failed: { id: string; error: string }[] = [];
  let resurfaced = 0;

  // Replay approved rows.
  for (const row of readyRows ?? []) {
    const result = await replayApprovedTool(row.id as string);
    if (result.ok) {
      replayed.push(row.id as string);
    } else {
      failed.push({ id: row.id as string, error: result.error });
    }
  }

  // Re-surface deferred Promotion rows as new modal_events.
  for (const row of deferredRows ?? []) {
    if (!row.skill_id) continue;

    // Write a fresh Promotion modal for the operator.
    try {
      await supabase.from("modal_events").insert({
        archetype: "promotion",
        scope_id: row.skill_id as string,
        scope_type: "skill" as const,
        action_id: null,
      });
    } catch (e) {
      console.error("[deferred-replay] re-surface modal insert failed", e);
    }

    // Reset retry_at to +7 more days so we don't re-surface every cron tick.
    const nextRetry = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await supabase
      .from("deferred_actions")
      .update({ retry_at: nextRetry })
      .eq("id", row.id as string);

    resurfaced++;
  }

  return NextResponse.json({ replayed, failed, resurfaced }, { status: 200 });
}
