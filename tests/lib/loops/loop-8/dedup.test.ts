// Pure unit tests for the Loop 8 fingerprint helper (Sprint 11).
//
// shouldDedup / recordFingerprint hit the DB; we only test the pure
// computeFingerprint here. The DB helpers are exercised through the
// runner's integration path (operator-driven).

import { describe, expect, test } from "vitest";

import { computeFingerprint } from "@/lib/loops/loop-8/dedup";

describe("computeFingerprint", () => {
  test("same inputs -> same fingerprint", () => {
    const a = computeFingerprint({
      ventureId: "v1",
      metricKind: "mrr",
      bucketDate: "2026-05-07",
    });
    const b = computeFingerprint({
      ventureId: "v1",
      metricKind: "mrr",
      bucketDate: "2026-05-07",
    });
    expect(a).toBe(b);
  });

  test("different ventureId -> different fingerprint", () => {
    const a = computeFingerprint({
      ventureId: "v1",
      metricKind: "mrr",
      bucketDate: "2026-05-07",
    });
    const b = computeFingerprint({
      ventureId: "v2",
      metricKind: "mrr",
      bucketDate: "2026-05-07",
    });
    expect(a).not.toBe(b);
  });

  test("different metricKind -> different fingerprint", () => {
    const a = computeFingerprint({
      ventureId: "v1",
      metricKind: "mrr",
      bucketDate: "2026-05-07",
    });
    const b = computeFingerprint({
      ventureId: "v1",
      metricKind: "arr",
      bucketDate: "2026-05-07",
    });
    expect(a).not.toBe(b);
  });

  test("different bucketDate -> different fingerprint", () => {
    const a = computeFingerprint({
      ventureId: "v1",
      metricKind: "mrr",
      bucketDate: "2026-05-07",
    });
    const b = computeFingerprint({
      ventureId: "v1",
      metricKind: "mrr",
      bucketDate: "2026-05-08",
    });
    expect(a).not.toBe(b);
  });

  test("returns 64-char hex (sha256)", () => {
    const a = computeFingerprint({
      ventureId: "v1",
      metricKind: "mrr",
      bucketDate: "2026-05-07",
    });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
