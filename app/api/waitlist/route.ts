import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { insertEvent } from "@/lib/db/events";
import {
  markWaitlistConfirmed,
  upsertWaitlistSignup,
} from "@/lib/db/waitlist";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendWaitlistConfirmation } from "@/lib/resend";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rl = checkRateLimit(`waitlist:${ip}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString(),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const email = parsed.data.email;

  const result = await upsertWaitlistSignup(email);
  if ("error" in result) {
    console.error("[waitlist] upsert failed", result.error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  if (!result.isNew) {
    return NextResponse.json({ status: "ok", duplicate: true });
  }

  const send = await sendWaitlistConfirmation(email);
  if (send.ok) {
    await markWaitlistConfirmed(result.id);
  } else {
    console.error("[waitlist] resend failed", send.error);
    await insertEvent({
      source: "resend",
      type: "waitlist_send_failed",
      actor: null,
      payload: {
        email,
        signup_id: result.id,
        error: send.error,
      },
      hash: null,
    });
  }

  return NextResponse.json({ status: "ok" });
}
