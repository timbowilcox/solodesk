import { NextResponse, type NextRequest } from "next/server";

import { processBacklog } from "@/lib/memory/embed";
import { timingSafeEquals } from "@/lib/security/timing-safe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_LIMIT = 100;

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
 * Vercel cron target: processes the embedding_backlog view, embedding any
 * row that's missing its vector. Run every 5 minutes (configured in
 * vercel.json). Requires `Authorization: Bearer ${CRON_SECRET}` header —
 * Vercel Cron sends this automatically when configured with the secret.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processBacklog(DEFAULT_LIMIT);
    return NextResponse.json({ status: "ok", ...result });
  } catch (e) {
    console.error(
      "[cron/embeddings] failed",
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
