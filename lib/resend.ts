import "server-only";

import { Resend } from "resend";

let cached: Resend | null = null;

function getClient(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "REPLACE_ME") {
    throw new Error("RESEND_API_KEY is not configured");
  }
  cached = new Resend(key);
  return cached;
}

const FROM = "SoloDesk <hello@solodesk.ai>";

const WAITLIST_SUBJECT = "You're on the SoloDesk waitlist";
const WAITLIST_BODY = `Got it — you're on the list.

I'll be in touch when there's something to show.

Tim Wilcox
SoloDesk
`;

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendWaitlistConfirmation(to: string): Promise<SendResult> {
  try {
    const result = await getClient().emails.send({
      from: FROM,
      to,
      subject: WAITLIST_SUBJECT,
      text: WAITLIST_BODY,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown send error",
    };
  }
}
