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
 * Vercel cron target: fires Loop 11 (portfolio audit). Cron at
 * 0 21 * * 0 (07:00 Sunday Australia/Sydney). Auth: Bearer ${CRON_SECRET}.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  ensureSchedulesRegistered();
  try {
    const report = await runSchedule("loop-11-portfolio-audit");
    return NextResponse.json({ status: "ok", ...report });
  } catch (e) {
    return NextResponse.json(
      {
        status: "error",
        error: e instanceof Error ? e.message : "unknown",
      },
      { status: 500 },
    );
  }
}
