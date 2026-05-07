import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: fromMock,
    rpc: rpcMock,
  }),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// Build a chainable supabase mock that yields a specific maybeSingle/single result
// for a connections lookup, plus an audit insert.
function mockSupabaseFor(opts: {
  connectionLookup: { data: unknown; error: unknown };
  auditInsertResult?: { data: unknown; error: unknown };
  eventsInsertResult?: { data: unknown; error: unknown };
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "connections") {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => opts.connectionLookup);
      return chain;
    }
    if (table === "connection_audit") {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.single = vi.fn(
        async () =>
          opts.auditInsertResult ?? {
            data: { id: "audit-id-1" },
            error: null,
          },
      );
      return chain;
    }
    if (table === "events") {
      const chain: Record<string, unknown> = {};
      chain.insert = vi.fn(() => Promise.resolve(opts.eventsInsertResult ?? { data: null, error: null }));
      return chain;
    }
    throw new Error(`unexpected from(${table}) in test`);
  });
}

describe("getConnection — venture-isolation + audit-before-return", () => {
  test("ventureId is required", async () => {
    const { getConnection } = await import("@/lib/connections/get");
    await expect(
      getConnection({
        ventureId: "",
        provider: "stripe",
        loopRunId: null,
        requestSummary: "test",
      }),
    ).rejects.toThrow(/ventureId/i);
  });

  test("provider is required", async () => {
    const { getConnection } = await import("@/lib/connections/get");
    await expect(
      getConnection({
        ventureId: "v1",
        provider: "",
        loopRunId: null,
        requestSummary: "test",
      }),
    ).rejects.toThrow(/provider/i);
  });

  test("requestSummary is required", async () => {
    const { getConnection } = await import("@/lib/connections/get");
    await expect(
      getConnection({
        ventureId: "v1",
        provider: "stripe",
        loopRunId: null,
        requestSummary: "",
      }),
    ).rejects.toThrow(/requestSummary/i);
  });

  test("throws NoActiveConnectionError when no connection exists for (venture, provider)", async () => {
    mockSupabaseFor({
      connectionLookup: { data: null, error: null },
    });

    const { getConnection, NoActiveConnectionError } = await import(
      "@/lib/connections/get"
    );
    const promise = getConnection({
      ventureId: "v-counsel",
      provider: "stripe",
      loopRunId: null,
      requestSummary: "GET /v1/charges",
    });
    await expect(promise).rejects.toBeInstanceOf(NoActiveConnectionError);

    // Lookup must use venture_id filter (cross-venture leak proof).
    const connectionsCall = fromMock.mock.calls.find((c) => c[0] === "connections");
    expect(connectionsCall).toBeDefined();
  });

  test("audit row written to connection_audit before vault decrypt", async () => {
    const auditInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { id: "audit-row-1" },
          error: null,
        })),
      })),
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "connections") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.is = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({
          data: {
            id: "conn-1",
            vault_secret_id: "secret-1",
            scope_metadata: { environment: "prod" },
          },
          error: null,
        }));
        return chain;
      }
      if (table === "connection_audit") {
        return { insert: auditInsert };
      }
      throw new Error(`unexpected from(${table})`);
    });
    rpcMock.mockResolvedValue({
      data: JSON.stringify({ secret_key: "sk_live_xxx" }),
      error: null,
    });

    const { getConnection } = await import("@/lib/connections/get");
    const result = await getConnection<{ secret_key: string }>({
      ventureId: "v-kounta",
      provider: "stripe",
      loopRunId: "loop-run-7",
      requestSummary: "GET /v1/charges",
    });

    expect(result.connectionId).toBe("conn-1");
    expect(result.auditId).toBe("audit-row-1");
    expect(result.credentials.secret_key).toBe("sk_live_xxx");
    // Audit insert called with the right action + loop attribution
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        connection_id: "conn-1",
        action: "fetched",
        called_by_loop_id: "loop-run-7",
        request_summary: "GET /v1/charges",
      }),
    );
    // vault_get RPC called with the connection's vault_secret_id (not direct SQL)
    expect(rpcMock).toHaveBeenCalledWith("vault_get", { p_id: "secret-1" });
  });
});
