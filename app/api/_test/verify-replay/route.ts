// TEMPORARY — B.4.6 verification route. DELETE before merging to main.
//
// Tests the deferred-action replay dispatcher against real Supabase without
// needing the CRON_SECRET. Covers three paths:
//   ?case=failure       send_email stub → status='failed' (no API call)
//   ?case=tool_not_found unknown tool  → status='failed', error='tool_not_found'
//   ?case=happy         invoke_loop    → real loop run (calls Anthropic)
//
// No auth — this route is only reachable on the preview URL, not production.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { replayApprovedTool } from "@/lib/autonomy/replay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const KOUNTA_VENTURE_ID = "c2a400d4-88e4-4839-b822-a92be5e892fb";

export async function GET(req: NextRequest) {
  const testCase = req.nextUrl.searchParams.get("case") ?? "failure";
  const supabase = createSupabaseAdminClient();

  // Pick tool and params based on test case.
  let tool: string;
  let params: Record<string, unknown>;

  if (testCase === "happy") {
    tool = "invoke_loop";
    params = {
      loopId: "01-strategy",
      task: "B.4.6 verification: outline three strategic priorities for Kounta's POS expansion. Keep it brief.",
      title: "B.4.6 Verify",
      ventureId: KOUNTA_VENTURE_ID,
    };
  } else if (testCase === "tool_not_found") {
    tool = "unknown_xyz_tool";
    params = {};
  } else {
    // default: failure (send_email stub)
    tool = "send_email";
    params = { to: "test@example.com", subject: "test" };
  }

  // Insert a fresh deferred_actions row at status='approved'.
  const { data: inserted, error: insertErr } = await supabase
    .from("deferred_actions")
    .insert({
      skill_id: "01-strategy",
      tool,
      params: params as import("@/lib/supabase/types").Json,
      venture_id: KOUNTA_VENTURE_ID,
      status: "approved",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: "insert failed", detail: insertErr?.message },
      { status: 500 },
    );
  }

  const deferredId = inserted.id as string;

  // Call the real dispatcher.
  const result = await replayApprovedTool(deferredId);

  // Query final state.
  const { data: finalRow } = await supabase
    .from("deferred_actions")
    .select("id, status, error, replayed_at")
    .eq("id", deferredId)
    .single();

  // Query actions row (only present on success).
  const { data: actionsRows } = await supabase
    .from("actions")
    .select("id, tool, via_modal, deferred_action_id, modal_event_id, autonomy_level")
    .eq("deferred_action_id", deferredId);

  // Idempotency: call again — should be skipped because status != 'approved'.
  const idempotentResult = await replayApprovedTool(deferredId);

  return NextResponse.json({
    testCase,
    deferredId,
    replayResult: result,
    finalRow,
    actionsRows,
    idempotentResult,
  });
}
