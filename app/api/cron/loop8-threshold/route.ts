import { NextResponse, type NextRequest } from "next/server";

import { triggerLoop8FromThreshold } from "@/lib/loops/loop-8/triggers";
import { timingSafeEquals } from "@/lib/security/timing-safe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Loop 8 threshold cron — runs once per day, computes ±2 stddev windows
// over the last 7 days of metric_snapshots per (venture, metric_name),
// fires a Loop 8 reactive trigger when the latest observation is outside
// the window. Each fingerprint (venture + metric + day) dedups within
// 1h via lib/loops/loop-8/dedup.ts.
//
// Vercel cron registration in vercel.json should target this once per day.

function isAuthorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected === "REPLACE_ME") return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ", 2);
  if (scheme !== "Bearer" || !token) return false;
  return timingSafeEquals(token, expected);
}

const STDDEV_THRESHOLD = 2;
const WINDOW_DAYS = 7;

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  // Pull latest snapshot per (venture_id, metric_name) over the window.
  const cutoff = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("metric_snapshots")
    .select("venture_id, metric_name, ts, value")
    .gte("ts", cutoff)
    .order("venture_id")
    .order("metric_name")
    .order("ts", { ascending: false });
  if (error) {
    console.error("[cron.loop8-threshold] fetch failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = { venture_id: string; metric_name: string; ts: string; value: number };
  const rows = (data ?? []) as unknown as Row[];

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.venture_id || !r.metric_name) continue;
    const key = `${r.venture_id}:${r.metric_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let breachCount = 0;
  let triggeredCount = 0;

  for (const [, points] of groups) {
    if (points.length < 3) continue;
    const sorted = [...points].sort((a, b) => a.ts.localeCompare(b.ts));
    const latest = sorted[sorted.length - 1]!;
    const prior = sorted.slice(0, -1).map((p) => Number(p.value));
    if (prior.length === 0) continue;
    const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
    const variance =
      prior.reduce((acc, v) => acc + (v - mean) ** 2, 0) / prior.length;
    const stddev = Math.sqrt(variance);
    const low = mean - STDDEV_THRESHOLD * stddev;
    const high = mean + STDDEV_THRESHOLD * stddev;
    const observed = Number(latest.value);
    if (observed < low || observed > high) {
      breachCount += 1;
      const result = await triggerLoop8FromThreshold({
        ventureId: latest.venture_id,
        metricKind: latest.metric_name,
        observedValue: observed,
        expectedLow: low,
        expectedHigh: high,
      });
      if (result.ok) triggeredCount += 1;
    }
  }

  return NextResponse.json(
    {
      status: "ok",
      groups_evaluated: groups.size,
      breaches: breachCount,
      triggered: triggeredCount,
    },
    { status: 200 },
  );
}
