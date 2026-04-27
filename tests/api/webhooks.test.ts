import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeChainableSupabase } from "../_helpers/mock-supabase";

vi.mock("@/lib/db/events", () => ({
  insertEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

const { POST } = await import("@/app/api/webhooks/[source]/route");
const { insertEvent } = await import("@/lib/db/events");
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

const SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const params = (source: string) =>
  Promise.resolve({ source });

function makeRequest({
  secret,
  source = "stripe",
  body = { type: "payment_succeeded", id: "evt_1" },
  venture,
}: {
  secret?: string | null;
  source?: string;
  body?: unknown;
  venture?: string;
}): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret !== null) headers["x-solodesk-secret"] = secret ?? SECRET;
  const url = venture
    ? `http://app.solodesk.ai/api/webhooks/${source}?venture=${venture}`
    : `http://app.solodesk.ai/api/webhooks/${source}`;
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.WEBHOOK_SECRET = SECRET;
  vi.mocked(createSupabaseAdminClient).mockReturnValue(
    makeChainableSupabase() as never,
  );
});

afterEach(() => {
  delete process.env.WEBHOOK_SECRET;
});

describe("POST /api/webhooks/[source]", () => {
  it("rejects when secret header is missing", async () => {
    const req = makeRequest({ secret: null });
    const res = await POST(req, { params: params("stripe") });
    expect(res.status).toBe(401);
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("rejects when secret is wrong (timing-safe)", async () => {
    const req = makeRequest({ secret: SECRET.replace("0", "f") });
    const res = await POST(req, { params: params("stripe") });
    expect(res.status).toBe(401);
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid source param", async () => {
    const req = makeRequest({ source: "../../../etc/passwd" });
    const res = await POST(req, { params: params("../../../etc/passwd") });
    expect(res.status).toBe(400);
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const req = makeRequest({ body: "{not json" });
    const res = await POST(req, { params: params("stripe") });
    expect(res.status).toBe(400);
  });

  it("inserts event on happy path and echoes id", async () => {
    vi.mocked(insertEvent).mockResolvedValueOnce({ id: "evt-uuid-1" });
    const req = makeRequest({
      body: { type: "payment_succeeded", id: "ext_1", amount: 100 },
    });
    const res = await POST(req, { params: params("stripe") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", id: "evt-uuid-1" });
    expect(insertEvent).toHaveBeenCalledOnce();
    const arg = vi.mocked(insertEvent).mock.calls[0]?.[0];
    expect(arg?.source).toBe("stripe");
    expect(arg?.type).toBe("payment_succeeded");
    expect(arg?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns duplicate status (200) when insertEvent reports duplicate", async () => {
    vi.mocked(insertEvent).mockResolvedValueOnce({ duplicate: true });
    const req = makeRequest({});
    const res = await POST(req, { params: params("stripe") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "duplicate" });
  });

  it("hashes identical payloads identically across calls", async () => {
    vi.mocked(insertEvent)
      .mockResolvedValueOnce({ id: "evt-1" })
      .mockResolvedValueOnce({ duplicate: true });
    const payload = { type: "x", a: 1, b: { c: 2, d: 3 } };
    const req1 = makeRequest({ body: payload });
    const req2 = makeRequest({
      body: { type: "x", b: { d: 3, c: 2 }, a: 1 },
    });
    await POST(req1, { params: params("stripe") });
    await POST(req2, { params: params("stripe") });
    const calls = vi.mocked(insertEvent).mock.calls;
    expect(calls[0]?.[0].hash).toBe(calls[1]?.[0].hash);
  });

  it("rejects when WEBHOOK_SECRET is the placeholder", async () => {
    process.env.WEBHOOK_SECRET = "REPLACE_ME";
    const req = makeRequest({ secret: "REPLACE_ME" });
    const res = await POST(req, { params: params("stripe") });
    expect(res.status).toBe(500);
  });
});
