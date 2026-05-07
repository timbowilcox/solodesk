import { NextResponse, type NextRequest } from "next/server";

import { requireUserContext } from "@/lib/auth/guard";
import { canAccessVenture } from "@/lib/auth/membership";
import { requestCancel } from "@/lib/loops/runner";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Cancel a running streaming Loop. Idempotent: returns 202 even if the
// run already terminated or is already cancelling.
//
// Bright line: we verify membership via the run's venture_id before
// flipping the cancel flag. A user cannot cancel another venture's run.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const user = await requireUserContext();

  // Find the run and check membership.
  const supabase = createSupabaseAdminClient();
  const { data: run } = await supabase
    .from("loop_runs")
    .select("id, venture_id, status")
    .eq("id", runId)
    .maybeSingle();
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  if (!run.venture_id) {
    return NextResponse.json({ error: "run not venture-scoped" }, { status: 400 });
  }
  const allowed = await canAccessVenture({
    userId: user.userId,
    isAdmin: user.isAdmin,
    ventureId: run.venture_id,
  });
  if (!allowed) {
    return NextResponse.json({ error: "run not accessible" }, { status: 404 });
  }

  if (run.status !== "running") {
    // Already terminal — idempotent success.
    return NextResponse.json({ status: run.status }, { status: 202 });
  }

  const result = await requestCancel(runId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ status: "cancelling" }, { status: 202 });
}
