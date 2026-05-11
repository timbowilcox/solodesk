import { NextResponse, type NextRequest } from "next/server";

import { timingSafeEquals } from "@/lib/security/timing-safe";
import { getVentureBySupportEmail } from "@/lib/db/ventures";
import { runSupportTriage } from "@/lib/agents/loops/support-triage";
import { insertEvent } from "@/lib/db/events";
import { hashEvent } from "@/lib/events/hash";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Resend inbound email webhook shape (simplified).
type ResendInboundPayload = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
    created_at?: string;
  };
};

/**
 * POST /api/webhooks/resend-inbound
 *
 * Receives inbound support emails forwarded by Resend.
 * Resolves the venture from the `to` address (matched against
 * ventures.support_email), then fires support triage.
 *
 * Auth: Bearer ${RESEND_INBOUND_SECRET}
 *
 * Resend inbound setup:
 *   1. Set the inbound webhook URL in Resend dashboard
 *   2. Set RESEND_INBOUND_SECRET env var
 *   3. Set ventures.support_email to the inbound address per venture
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_INBOUND_SECRET;
  if (!secret || secret === "REPLACE_ME") {
    return NextResponse.json(
      { error: "Server misconfigured: RESEND_INBOUND_SECRET not set" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const [scheme, token] = authHeader.split(" ", 2);
  if (scheme !== "Bearer" || !token || !timingSafeEquals(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: ResendInboundPayload;
  try {
    raw = (await req.json()) as ResendInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailData = raw.data;
  if (!emailData) {
    return NextResponse.json({ error: "Missing data field" }, { status: 400 });
  }

  const fromAddress = emailData.from?.trim() ?? null;
  const subject = emailData.subject?.trim() ?? null;
  const body = (emailData.text ?? emailData.html ?? "").trim();
  const toAddresses = emailData.to ?? [];

  if (!body) {
    return NextResponse.json({ error: "Empty email body" }, { status: 400 });
  }

  // Resolve venture from the first `to` address that matches a support_email.
  let venture: Awaited<ReturnType<typeof getVentureBySupportEmail>> = null;
  for (const addr of toAddresses) {
    venture = await getVentureBySupportEmail(addr);
    if (venture) break;
  }

  if (!venture) {
    // No venture matched — log and ack without creating a ticket.
    console.warn("[resend-inbound] no venture matched for to:", toAddresses);
    return NextResponse.json({ status: "unrouted" }, { status: 200 });
  }

  // Record the raw email as an event for the audit log.
  const hash = hashEvent("resend", venture.slug, raw);
  await insertEvent({
    source: "resend",
    venture_id: venture.id,
    type: "email.inbound",
    actor: fromAddress,
    payload: raw as unknown as Json,
    hash,
  }).catch((e: unknown) => {
    console.error("[resend-inbound] event insert failed", e);
  });

  // Fire support triage. Responds to Resend immediately while triage runs.
  // Triage is not blocking the ack — it runs, but we still await it here
  // because this is already a background worker endpoint (maxDuration: 60s).
  const triageResult = await runSupportTriage({
    ventureSlug: venture.slug,
    fromAddress: fromAddress ?? undefined,
    subject: subject ?? undefined,
    body,
  }).catch((e: unknown) => {
    console.error("[resend-inbound] triage threw", e);
    return { ok: false, error: "triage threw" } as const;
  });

  if (!triageResult.ok) {
    console.error("[resend-inbound] triage failed", triageResult.error);
    // Still return 200 so Resend doesn't retry — the event is logged.
    return NextResponse.json(
      { status: "triage_failed", error: triageResult.error },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      documentId: triageResult.documentId,
      classification: triageResult.classification,
      urgency: triageResult.urgency,
    },
    { status: 200 },
  );
}
