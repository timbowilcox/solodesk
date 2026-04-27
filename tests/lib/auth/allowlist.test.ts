import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeChainableSupabase } from "../../_helpers/mock-supabase";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

const { findAllowedUser, isAllowedUser, touchLastLogin } = await import(
  "@/lib/auth/allowlist"
);
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findAllowedUser", () => {
  it("returns the row when an active match exists", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeChainableSupabase({
        allowed_users: {
          data: {
            id: "u1",
            email: "tim@solodesk.ai",
            role: "admin",
            active: true,
          },
          error: null,
        },
      }) as never,
    );
    const result = await findAllowedUser("tim@solodesk.ai");
    expect(result).toEqual({
      id: "u1",
      email: "tim@solodesk.ai",
      role: "admin",
      active: true,
    });
    expect(await isAllowedUser("tim@solodesk.ai")).toBe(true);
  });

  it("returns null for a missing email", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeChainableSupabase({
        allowed_users: { data: null, error: null },
      }) as never,
    );
    const result = await findAllowedUser("nobody@example.com");
    expect(result).toBeNull();
    expect(await isAllowedUser("nobody@example.com")).toBe(false);
  });

  it("returns null for a postgres error and logs", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      makeChainableSupabase({
        allowed_users: { data: null, error: { message: "boom" } },
      }) as never,
    );
    const result = await findAllowedUser("err@example.com");
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("ignores empty/whitespace input", async () => {
    const result = await findAllowedUser("   ");
    expect(result).toBeNull();
  });
});

describe("touchLastLogin", () => {
  it("does nothing for empty input", async () => {
    const supa = makeChainableSupabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(supa as never);
    await touchLastLogin("");
    expect(supa.from).not.toHaveBeenCalled();
  });
});
