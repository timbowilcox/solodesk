// TEMPORARY DIAGNOSTIC ROUTE — Sprint 0 deploy verification only.
// To be reverted in the immediately-following commit. Public-repo exposure
// window is intended to be < 5 minutes.
//
// What it does:
//   1. Raw SMTP RCPT TO probe to both Migadu MX servers for the canonical,
//      plus-tagged, hello@, and a negative-control mailbox. Tells us
//      whether each address is accepted at the recipient SMTP layer.
//   2. Sends a fresh email through Resend, then polls Resend's
//      emails.get() for delivery status. Tells us what Resend reports
//      back from its outbound transaction with Migadu.
//
// Together these isolate where the failure is: at Resend, between Resend
// and Migadu, or at Migadu's mailbox routing.
//
// Auth: ephemeral header token. Diagnostic-only; revert after use.

import "server-only";

import { createConnection, type Socket } from "node:net";

import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DIAG_TOKEN = "claude-diag-2026-05-06-smtp-mx-probe-revert-after";
const FROM_DOMAIN = "solodesk.ai";
const MX_HOSTS = ["aspmx1.migadu.com", "aspmx2.migadu.com"];
const MX_PORT = 25;
const PROBE_TIMEOUT_MS = 15000;

type RcptResult = { code: string; reply: string; verdict: "ACCEPT" | "REJECT" | "UNKNOWN" };
type ProbeOutcome =
  | { host: string; banner: string; ehlo: string; results: Record<string, RcptResult> }
  | { host: string; error: string; partialLog?: unknown[] };

async function smtpRcptProbe(host: string, addresses: string[]): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    let buf = "";
    const queue: Array<(s: string) => void> = [];
    const log: unknown[] = [];
    let settled = false;

    const sock: Socket = createConnection({ host, port: MX_PORT, timeout: PROBE_TIMEOUT_MS });

    function flushReplies() {
      while (true) {
        const lines = buf.split(/\r?\n/);
        let endIdx = -1;
        for (let i = 0; i < lines.length - 1; i++) {
          const ln = lines[i] ?? "";
          if (ln.length >= 4 && ln[3] === " ") {
            endIdx = i;
            break;
          }
        }
        if (endIdx === -1) return;
        const reply = lines.slice(0, endIdx + 1).join("\n");
        buf = lines.slice(endIdx + 1).join("\r\n");
        const next = queue.shift();
        if (next) next(reply);
      }
    }

    function settle(out: ProbeOutcome) {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {}
      resolve(out);
    }

    sock.setEncoding("ascii");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      flushReplies();
    });
    sock.on("error", (err: Error) => settle({ host, error: err.message, partialLog: log }));
    sock.on("timeout", () => settle({ host, error: "socket timeout", partialLog: log }));

    function recv(): Promise<string> {
      return new Promise((res) => {
        queue.push(res);
        flushReplies();
      });
    }
    function send(line: string): Promise<string> {
      sock.write(line + "\r\n");
      return recv();
    }

    void (async () => {
      try {
        const banner = await recv();
        log.push({ banner });
        const ehlo = await send(`EHLO diag.${FROM_DOMAIN}`);
        log.push({ ehlo });
        await send(`MAIL FROM:<probe@${FROM_DOMAIN}>`);

        const results: Record<string, RcptResult> = {};
        for (const addr of addresses) {
          const reply = await send(`RCPT TO:<${addr}>`);
          const code = reply.slice(0, 3);
          const verdict: RcptResult["verdict"] = code.startsWith("2")
            ? "ACCEPT"
            : /^[45]/.test(code)
            ? "REJECT"
            : "UNKNOWN";
          results[addr] = { code, reply, verdict };
          await send("RSET");
          await send(`MAIL FROM:<probe@${FROM_DOMAIN}>`);
        }
        await send("QUIT");
        settle({ host, banner, ehlo, results });
      } catch (e) {
        settle({ host, error: e instanceof Error ? e.message : "unknown", partialLog: log });
      }
    })();
  });
}

async function resendSendAndPoll(to: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "REPLACE_ME") {
    return { error: "RESEND_API_KEY missing or placeholder" };
  }
  const r = new Resend(key);
  const sendRes = await r.emails.send({
    from: "SoloDesk <hello@solodesk.ai>",
    to,
    subject: "[diag] SoloDesk SMTP probe — please ignore",
    text: "Diagnostic test email from Sprint 0 deploy verification. Safe to delete.\n",
  });
  if (sendRes.error) {
    return { send_error: sendRes.error.message };
  }
  const id = sendRes.data?.id;
  if (!id) return { error: "Resend returned no id" };

  const poll: Array<{ at_s: number; last_event?: string; error?: string }> = [];
  let final: string | undefined;
  for (let i = 0; i < 12; i++) {
    await new Promise((res) => setTimeout(res, 2500));
    try {
      const got = await r.emails.get(id);
      const last_event = (got.data as { last_event?: string } | null)?.last_event;
      poll.push({ at_s: (i + 1) * 2.5, last_event, error: got.error?.message });
      if (
        last_event &&
        ["delivered", "bounced", "complained", "delivery_delayed", "failed"].includes(last_event)
      ) {
        final = last_event;
        break;
      }
    } catch (e) {
      poll.push({ at_s: (i + 1) * 2.5, error: e instanceof Error ? e.message : "unknown" });
      break;
    }
  }
  return { id, to, final, poll };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-diag-token") !== DIAG_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ts = Date.now();
  const probeAddresses = [
    "tim@solodesk.ai",
    `tim+claude-diag-${ts}@solodesk.ai`,
    "hello@solodesk.ai",
    "definitely-not-real-mailbox-xyz@solodesk.ai",
  ];
  const resendTo = `tim+claude-diag-resend-${ts}@solodesk.ai`;

  const [mx1, mx2, resend] = await Promise.all([
    smtpRcptProbe(MX_HOSTS[0]!, probeAddresses),
    smtpRcptProbe(MX_HOSTS[1]!, probeAddresses),
    resendSendAndPoll(resendTo),
  ]);

  const payload = {
    ts: new Date(ts).toISOString(),
    probe_addresses: probeAddresses,
    mx_probes: { aspmx1: mx1, aspmx2: mx2 },
    resend_test: { ...resend, sent_to: resendTo },
  };
  console.log("[diag/smtp-probe]", JSON.stringify(payload));
  return NextResponse.json(payload, { status: 200 });
}
