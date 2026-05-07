import { NextResponse, type NextRequest } from "next/server";

import { runSchedule } from "@/lib/scheduler/runner";
import { ensureSchedulesRegistered } from "@/lib/scheduler/schedules";
import { timingSafeEquals } from "@/lib/security/timing-safe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

function isAuthorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected === "REPLACE_ME") return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ", 2);
  if (scheme !== "Bearer" || !token) return false;
  return timingSafeEquals(token, expected);
}

/**
 * Vercel cron target: fires loop-8-daily-digest across all active ventures.
 * Configured at 0 20 * * * (06:00 Australia/Sydney) in vercel.json.
 * Auth: Bearer ${CRON_SECRET}.
 *
 * Idempotent — calling the endpoint twice on the same day finds the
 * existing digest and returns it.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  ensureSchedulesRegistered();
  try {
    const report = await runSchedule("loop-8-daily-digest");
    return NextResponse.json({ status: "ok", ...report });
  } catch (e) {
    console.error(
      "[cron/daily-digest] failed",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      {
        status: "error",
        error: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
