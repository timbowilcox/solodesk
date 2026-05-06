import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const callVoyageMock = vi.fn();
const rpcMock = vi.fn();
const insertMock = vi.fn(async () => ({ data: null, error: null }));
const fromMock = vi.fn(() => ({ insert: insertMock }));

vi.mock("@/lib/memory/voyage", () => ({
  callVoyage: callVoyageMock,
  isVoyageError: (r: unknown): r is { error: string } =>
    !!r && typeof r === "object" && "error" in (r as Record<string, unknown>),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.VOYAGE_API_KEY = "test-key";
  callVoyageMock.mockReset();
  rpcMock.mockReset();
  insertMock.mockClear();
  fromMock.mockClear();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("recallContext — venture-isolation contract", () => {
  test("throws when ventureId is empty", async () => {
    const { recallContext } = await import("@/lib/memory/recall");
    await expect(
      recallContext({ ventureId: "", query: "anything" }),
    ).rejects.toThrow(/ventureId/i);
  });

  test("returns [] for empty query without calling Voyage", async () => {
    const { recallContext } = await import("@/lib/memory/recall");
    const out = await recallContext({
      ventureId: "v1",
      query: "   ",
    });
    expect(out).toEqual([]);
    expect(callVoyageMock).not.toHaveBeenCalled();
  });

  test("passes ventureId to every RPC call (no cross-venture leak path)", async () => {
    callVoyageMock.mockResolvedValue({
      data: [{ embedding: new Array(1024).fill(0), index: 0 }],
      totalTokens: 10,
      model: "voyage-3",
    });
    rpcMock.mockResolvedValue({ data: [], error: null });

    const { recallContext } = await import("@/lib/memory/recall");
    await recallContext({
      ventureId: "kounta-uuid",
      query: "pricing strategy",
    });

    // One rpc call per requested table — default = 4 tables.
    expect(rpcMock).toHaveBeenCalledTimes(4);
    for (const call of rpcMock.mock.calls) {
      const [, params] = call;
      expect(params).toMatchObject({ p_venture_id: "kounta-uuid" });
    }
  });
});
