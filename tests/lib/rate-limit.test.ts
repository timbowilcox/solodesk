import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimit());

  it("allows the first 5 requests in the window", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit("ip:1", now + i);
      expect(result.ok).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it("blocks the 6th request and reports retryAfterMs > 0", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) checkRateLimit("ip:1", now + i);
    const blocked = checkRateLimit("ip:1", now + 5);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates buckets per key", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) checkRateLimit("ip:1", now + i);
    const other = checkRateLimit("ip:2", now + 5);
    expect(other.ok).toBe(true);
  });

  it("expires timestamps older than the window", () => {
    const now = 1_700_000_000_000;
    const oneHour = 60 * 60 * 1000;
    for (let i = 0; i < 5; i++) checkRateLimit("ip:1", now);
    expect(checkRateLimit("ip:1", now).ok).toBe(false);
    // Advance past the window — all 5 entries expire
    const after = checkRateLimit("ip:1", now + oneHour + 1);
    expect(after.ok).toBe(true);
    expect(after.remaining).toBe(4);
  });
});
