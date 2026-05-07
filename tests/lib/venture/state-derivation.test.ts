// Pure unit tests for the Bridge tile derivation helpers (Sprint 8).
// No DB, no React — single-shot assertions on the formatting functions.

import { describe, expect, test } from "vitest";

import {
  chromeToneForHour,
  formatLastActivity,
  formatPendingCount,
  formatVitalSign,
  isActiveTile,
  tileStateToDot,
} from "@/lib/venture/state-derivation";
import type { BridgeTile } from "@/lib/db/bridge";

const SAMPLE: BridgeTile = {
  ventureId: "00000000-0000-0000-0000-000000000001",
  slug: "kounta",
  name: "Kounta",
  phase: "build",
  accentColor: "#3B6D11",
  markSlug: "kounta",
  state: "idle",
  pendingCount: 3,
  lastActivityAt: null,
  vitalSign: null,
  sparkline: [0, 0, 0, 0, 0, 0, 0, 0],
  connections: [],
};

describe("formatPendingCount", () => {
  test("zero -> 0 pending", () => {
    expect(formatPendingCount(0)).toBe("0 pending");
  });
  test("negative collapses to 0 pending", () => {
    expect(formatPendingCount(-5)).toBe("0 pending");
  });
  test("one is singular", () => {
    expect(formatPendingCount(1)).toBe("1 pending");
  });
  test("many is plural", () => {
    expect(formatPendingCount(7)).toBe("7 pending");
  });
  test("over 99 caps display", () => {
    expect(formatPendingCount(100)).toBe("99+ pending");
    expect(formatPendingCount(9999)).toBe("99+ pending");
  });
});

describe("formatLastActivity", () => {
  const now = new Date("2026-05-07T12:00:00Z");

  test("null returns No activity", () => {
    expect(formatLastActivity(null, now)).toBe("No activity");
  });
  test("invalid date returns No activity", () => {
    expect(formatLastActivity("not-a-date", now)).toBe("No activity");
  });
  test("less than a minute -> Just now", () => {
    expect(formatLastActivity("2026-05-07T11:59:30Z", now)).toBe("Just now");
  });
  test("minutes bucket", () => {
    expect(formatLastActivity("2026-05-07T11:55:00Z", now)).toBe("5m ago");
  });
  test("hours bucket", () => {
    expect(formatLastActivity("2026-05-07T08:00:00Z", now)).toBe("4h ago");
  });
  test("days bucket", () => {
    expect(formatLastActivity("2026-05-04T12:00:00Z", now)).toBe("3d ago");
  });
  test("weeks bucket", () => {
    expect(formatLastActivity("2026-04-20T12:00:00Z", now)).toBe("2w ago");
  });
  test("months bucket", () => {
    expect(formatLastActivity("2026-01-07T12:00:00Z", now)).toBe("4mo ago");
  });
  test("years bucket", () => {
    expect(formatLastActivity("2024-05-07T12:00:00Z", now)).toBe("2y ago");
  });
});

describe("formatVitalSign", () => {
  test("returns the raw vital sign when present", () => {
    expect(formatVitalSign("stripe · charge.created", "active")).toBe(
      "stripe · charge.created",
    );
  });
  test("falls back per state when null", () => {
    expect(formatVitalSign(null, "active")).toBe("Working now");
    expect(formatVitalSign(null, "idle")).toBe("Recent activity");
    expect(formatVitalSign(null, "quiet")).toBe("No activity");
  });
  test("falls back when whitespace-only", () => {
    expect(formatVitalSign("   ", "quiet")).toBe("No activity");
  });
});

describe("tileStateToDot", () => {
  test("identity mapping", () => {
    expect(tileStateToDot("active")).toBe("active");
    expect(tileStateToDot("idle")).toBe("idle");
    expect(tileStateToDot("quiet")).toBe("quiet");
  });
});

describe("chromeToneForHour", () => {
  test("morning warm", () => {
    expect(chromeToneForHour(6)).toBe("warm");
    expect(chromeToneForHour(11)).toBe("warm");
  });
  test("afternoon neutral", () => {
    expect(chromeToneForHour(12)).toBe("neutral");
    expect(chromeToneForHour(17)).toBe("neutral");
  });
  test("evening cool", () => {
    expect(chromeToneForHour(18)).toBe("cool");
    expect(chromeToneForHour(23)).toBe("cool");
    expect(chromeToneForHour(0)).toBe("cool");
    expect(chromeToneForHour(5)).toBe("cool");
  });
});

describe("isActiveTile", () => {
  test("true only for active state", () => {
    expect(isActiveTile({ ...SAMPLE, state: "active" })).toBe(true);
    expect(isActiveTile({ ...SAMPLE, state: "idle" })).toBe(false);
    expect(isActiveTile({ ...SAMPLE, state: "quiet" })).toBe(false);
  });
});
