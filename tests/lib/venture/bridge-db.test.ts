// Unit test for lib/db/bridge.ts — verifies the RPC wrapper passes
// (userId, isAdmin) faithfully and shapes the result in BridgeTile form.
//
// The bright-line guarantee is enforced at the SQL layer (membership
// scoping inside bridge_tiles). This test verifies the TS wrapper does
// not silently widen, narrow, or reshape what the SQL function returns.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpcMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: rpcMock,
  }),
}));

beforeEach(() => {
  rpcMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listBridgeTiles", () => {
  test("forwards userId and isAdmin to the RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const { listBridgeTiles } = await import("@/lib/db/bridge");
    const result = await listBridgeTiles({
      userId: "user-1",
      isAdmin: false,
    });
    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("bridge_tiles", {
      p_user_id: "user-1",
      p_is_admin: false,
    });
  });

  test("admin call passes isAdmin=true", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const { listBridgeTiles } = await import("@/lib/db/bridge");
    await listBridgeTiles({ userId: "user-2", isAdmin: true });
    expect(rpcMock).toHaveBeenCalledWith("bridge_tiles", {
      p_user_id: "user-2",
      p_is_admin: true,
    });
  });

  test("reshapes rows into camelCase BridgeTile objects", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          venture_id: "v1",
          slug: "kounta",
          name: "Kounta",
          phase: "build",
          accent_color: "#3B6D11",
          mark_slug: "kounta",
          state: "idle",
          pending_count: 3,
          last_activity_at: "2026-05-07T06:00:00Z",
          vital_sign: "stripe · charge",
          sparkline: [1, 2, 3, 4, 5, 6, 7, 8],
          connections: ["stripe", "resend"],
        },
      ],
      error: null,
    });
    const { listBridgeTiles } = await import("@/lib/db/bridge");
    const result = await listBridgeTiles({ userId: "u", isAdmin: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.tiles[0]!;
    expect(t.ventureId).toBe("v1");
    expect(t.markSlug).toBe("kounta");
    expect(t.accentColor).toBe("#3B6D11");
    expect(t.pendingCount).toBe(3);
    expect(t.lastActivityAt).toBe("2026-05-07T06:00:00Z");
    expect(t.sparkline).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(t.connections).toEqual(["stripe", "resend"]);
  });

  test("returns error result when RPC fails", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "kaboom" },
    });
    const { listBridgeTiles } = await import("@/lib/db/bridge");
    const result = await listBridgeTiles({ userId: "u", isAdmin: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("kaboom");
  });

  test("missing data resolves to an empty tile list", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const { listBridgeTiles } = await import("@/lib/db/bridge");
    const result = await listBridgeTiles({ userId: "u", isAdmin: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tiles).toEqual([]);
  });

  test("non-array sparkline / connections collapse to []", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          venture_id: "v1",
          slug: "x",
          name: "X",
          phase: "discovery",
          accent_color: "#000000",
          mark_slug: "generic",
          state: "quiet",
          pending_count: 0,
          last_activity_at: null,
          vital_sign: null,
          sparkline: null,
          connections: null,
        },
      ],
      error: null,
    });
    const { listBridgeTiles } = await import("@/lib/db/bridge");
    const result = await listBridgeTiles({ userId: "u", isAdmin: true });
    if (!result.ok) throw new Error("expected ok");
    expect(result.tiles[0]!.sparkline).toEqual([]);
    expect(result.tiles[0]!.connections).toEqual([]);
  });
});
