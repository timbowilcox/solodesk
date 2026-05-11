// Tests for POST /api/webhooks/resend-inbound (B.6).
// Verifies: auth, venture resolution, triage result routing.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

const getVentureBySupportEmailMock = vi.fn<() => Promise<unknown>>();
const runSupportTriageMock = vi.fn<() => Promise<unknown>>();
const insertEventMock = vi.fn(async () => ({ data: { id: "evt-1" }, error: null }));
const hashEventMock = vi.fn(() => "hash-abc");

vi.mock("@/lib/security/timing-safe", () => ({
  timingSafeEquals: vi.fn((a: string, b: string) => a === b),
}));

vi.mock("@/lib/db/ventures", () => ({
  getVentureBySupportEmail: getVentureBySupportEmailMock,
}));

vi.mock("@/lib/agents/loops/support-triage", () => ({
  runSupportTriage: runSupportTriageMock,
}));

vi.mock("@/lib/db/events", () => ({
  insertEvent: insertEventMock,
}));

vi.mock("@/lib/events/hash", () => ({
  hashEvent: hashEventMock,
}));

const { POST } = await import("@/app/api/webhooks/resend-inbound/route");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = "test-secret-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

function makeRequest(opts: {
  authHeader?: string | null;
  body?: unknown;
}): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.authHeader !== null) {
    headers["authorization"] = opts.authHeader ?? `Bearer ${SECRET}`;
  }
  return new NextRequest("http://app.solodesk.ai/api/webhooks/resend-inbound", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {
      type: "email",
      data: {
        from: "customer@example.com",
        to: ["support@kounta.inbound.solodesk.ai"],
        subject: "Login issue",
        text: "I cannot log in.",
      },
    }),
  });
}

const mockVenture = {
  id: "venture-kounta-id",
  slug: "kounta",
  name: "Kounta",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.RESEND_INBOUND_SECRET = SECRET;
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.RESEND_INBOUND_SECRET;
});

describe("POST /api/webhooks/resend-inbound — auth", () => {
  it("returns 500 when RESEND_INBOUND_SECRET not set", async () => {
    delete process.env.RESEND_INBOUND_SECRET;
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toContain("misconfigured");
  });

  it("returns 401 when authorization header missing", async () => {
    const res = await POST(makeRequest({ authHeader: null }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is wrong", async () => {
    const res = await POST(makeRequest({ authHeader: "Bearer wrong-token" }));
    expect(res.status).toBe(401);
  });

  it("accepts correct Bearer token", async () => {
    getVentureBySupportEmailMock.mockResolvedValue(mockVenture);
    runSupportTriageMock.mockResolvedValue({
      ok: true,
      documentId: "doc-1",
      classification: "bug",
      urgency: "high",
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/webhooks/resend-inbound — venture resolution", () => {
  it("returns 400 when email body is empty", async () => {
    const res = await POST(makeRequest({
      body: {
        type: "email",
        data: { from: "a@b.com", to: ["x@y.com"], text: "" },
      },
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toContain("Empty email body");
  });

  it("returns 200 with status=unrouted when no venture matches the to address", async () => {
    getVentureBySupportEmailMock.mockResolvedValue(null);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, string>;
    expect(body.status).toBe("unrouted");
  });

  it("tries each to address until a venture matches", async () => {
    getVentureBySupportEmailMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockVenture);
    runSupportTriageMock.mockResolvedValue({
      ok: true,
      documentId: "doc-2",
      classification: "question",
      urgency: "low",
    });
    const req = makeRequest({
      body: {
        type: "email",
        data: {
          from: "c@d.com",
          to: ["unknown@x.com", "support@kounta.inbound.solodesk.ai"],
          subject: "Help",
          text: "Need help.",
        },
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getVentureBySupportEmailMock).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/webhooks/resend-inbound — triage routing", () => {
  beforeEach(() => {
    getVentureBySupportEmailMock.mockResolvedValue(mockVenture);
  });

  it("returns ok=true with classification and documentId on successful triage", async () => {
    runSupportTriageMock.mockResolvedValue({
      ok: true,
      documentId: "doc-ok",
      classification: "bug",
      urgency: "high",
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.documentId).toBe("doc-ok");
    expect(body.classification).toBe("bug");
  });

  it("returns 200 triage_failed (not 500) when triage throws — Resend must not retry", async () => {
    runSupportTriageMock.mockRejectedValue(new Error("LLM timeout"));
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, string>;
    expect(body.status).toBe("triage_failed");
  });

  it("returns 200 triage_failed when triage returns ok=false", async () => {
    runSupportTriageMock.mockResolvedValue({ ok: false, error: "gateway blocked" });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, string>;
    expect(body.status).toBe("triage_failed");
  });

  it("writes an event row before calling triage", async () => {
    runSupportTriageMock.mockResolvedValue({ ok: true, documentId: "d", classification: "question", urgency: "low" });
    await POST(makeRequest({}));
    expect(insertEventMock).toHaveBeenCalledOnce();
    const call = (insertEventMock.mock.calls as unknown as [Record<string, unknown>][])[0]![0]!;
    expect(call.source).toBe("resend");
    expect(call.type).toBe("email.inbound");
  });
});
