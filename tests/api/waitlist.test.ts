import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/waitlist", () => ({
  upsertWaitlistSignup: vi.fn(),
  markWaitlistConfirmed: vi.fn(),
}));

vi.mock("@/lib/resend", () => ({
  sendWaitlistConfirmation: vi.fn(),
}));

vi.mock("@/lib/db/events", () => ({
  insertEvent: vi.fn(),
}));

const { POST } = await import("@/app/api/waitlist/route");
const { upsertWaitlistSignup, markWaitlistConfirmed } = await import(
  "@/lib/db/waitlist"
);
const { sendWaitlistConfirmation } = await import("@/lib/resend");
const { insertEvent } = await import("@/lib/db/events");
const { resetRateLimit } = await import("@/lib/rate-limit");

function makeRequest(body: unknown, ip: string = "1.2.3.4"): Request {
  return new Request("http://solodesk.ai/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimit();
});

afterEach(() => {
  resetRateLimit();
});

describe("POST /api/waitlist", () => {
  it("rejects malformed JSON with 400", async () => {
    const req = makeRequest("{not json");
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("rejects invalid email with 400", async () => {
    const req = makeRequest({ email: "not-an-email" });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("happy path: inserts signup, sends email, marks confirmed", async () => {
    vi.mocked(upsertWaitlistSignup).mockResolvedValueOnce({
      id: "signup-1",
      isNew: true,
    });
    vi.mocked(sendWaitlistConfirmation).mockResolvedValueOnce({
      ok: true,
      id: "email-1",
    });

    const req = makeRequest({ email: "new@example.com" });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(upsertWaitlistSignup).toHaveBeenCalledWith("new@example.com");
    expect(sendWaitlistConfirmation).toHaveBeenCalledWith("new@example.com");
    expect(markWaitlistConfirmed).toHaveBeenCalledWith("signup-1");
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("duplicate signup: returns 200, no second email, no event", async () => {
    vi.mocked(upsertWaitlistSignup).mockResolvedValueOnce({
      id: "signup-1",
      isNew: false,
    });

    const req = makeRequest({ email: "dupe@example.com" });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.duplicate).toBe(true);
    expect(sendWaitlistConfirmation).not.toHaveBeenCalled();
    expect(markWaitlistConfirmed).not.toHaveBeenCalled();
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("send failure: row saved, waitlist_send_failed event written, response still 200", async () => {
    vi.mocked(upsertWaitlistSignup).mockResolvedValueOnce({
      id: "signup-1",
      isNew: true,
    });
    vi.mocked(sendWaitlistConfirmation).mockResolvedValueOnce({
      ok: false,
      error: "Resend exploded",
    });
    vi.mocked(insertEvent).mockResolvedValueOnce({ id: "evt-1" });

    const req = makeRequest({ email: "fail@example.com" });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(markWaitlistConfirmed).not.toHaveBeenCalled();
    expect(insertEvent).toHaveBeenCalledOnce();
    const eventArg = vi.mocked(insertEvent).mock.calls[0]?.[0];
    expect(eventArg?.type).toBe("waitlist_send_failed");
    expect(eventArg?.source).toBe("resend");
    const payload = eventArg?.payload as Record<string, unknown> | undefined;
    expect(payload?.email).toBe("fail@example.com");
    expect(payload?.signup_id).toBe("signup-1");
  });

  it("rate-limits the 6th request from the same IP within an hour", async () => {
    vi.mocked(upsertWaitlistSignup).mockResolvedValue({
      id: "x",
      isNew: false,
    });
    const ip = "9.9.9.9";
    for (let i = 0; i < 5; i++) {
      const r = await POST(
        makeRequest(
          { email: `a${i}@example.com` },
          ip,
        ) as unknown as Parameters<typeof POST>[0],
      );
      expect(r.status).toBe(200);
    }
    const blocked = await POST(
      makeRequest({ email: "blocked@example.com" }, ip) as unknown as Parameters<
        typeof POST
      >[0],
    );
    expect(blocked.status).toBe(429);
  });

  it("normalises email casing before hitting the DB", async () => {
    vi.mocked(upsertWaitlistSignup).mockResolvedValueOnce({
      id: "signup-2",
      isNew: true,
    });
    vi.mocked(sendWaitlistConfirmation).mockResolvedValueOnce({
      ok: true,
      id: "e",
    });

    const req = makeRequest({ email: "  Mixed@CASE.com  " });
    await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(upsertWaitlistSignup).toHaveBeenCalledWith("mixed@case.com");
  });
});
