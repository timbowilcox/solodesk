import { NextResponse, type NextRequest } from "next/server";

import { hashEvent } from "@/lib/events/hash";
import { insertEvent } from "@/lib/db/events";
import { timingSafeEquals } from "@/lib/security/timing-safe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ source: string }> },
) {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected || expected === "REPLACE_ME") {
    return NextResponse.json(
      { error: "Server misconfigured: WEBHOOK_SECRET not set" },
      { status: 500 },
    );
  }

  const provided = request.headers.get("x-solodesk-secret") ?? "";
  if (!timingSafeEquals(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { source } = await context.params;
  if (!source || source.length > 64 || !/^[a-z0-9_-]+$/i.test(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const ventureSlug = request.nextUrl.searchParams.get("venture");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  let ventureId: string | null = null;
  if (ventureSlug) {
    const { data } = await supabase
      .from("ventures")
      .select("id")
      .eq("slug", ventureSlug)
      .maybeSingle();
    ventureId = data?.id ?? null;
  }

  const type =
    payload &&
    typeof payload === "object" &&
    "type" in payload &&
    typeof (payload as { type: unknown }).type === "string"
      ? (payload as { type: string }).type
      : "webhook";

  const hash = hashEvent(source, ventureSlug, payload);

  const result = await insertEvent({
    source,
    venture_id: ventureId,
    type,
    actor: null,
    payload: payload as Json,
    hash,
  });

  if ("duplicate" in result) {
    return NextResponse.json({ status: "duplicate" }, { status: 200 });
  }
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ status: "ok", id: result.id }, { status: 200 });
}
