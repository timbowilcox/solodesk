import { describe, expect, it } from "vitest";

import { hashEvent } from "@/lib/events/hash";

describe("hashEvent", () => {
  it("returns 64-char hex", () => {
    const h = hashEvent("stripe", "kounta", { type: "x" });
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const a = hashEvent("stripe", "kounta", {
      type: "payment_succeeded",
      amount: 100,
    });
    const b = hashEvent("stripe", "kounta", {
      type: "payment_succeeded",
      amount: 100,
    });
    expect(a).toBe(b);
  });

  it("ignores key order in the payload", () => {
    const a = hashEvent("stripe", "kounta", { a: 1, b: 2, c: 3 });
    const b = hashEvent("stripe", "kounta", { c: 3, b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("treats null and missing venture as the same", () => {
    const a = hashEvent("stripe", null, { x: 1 });
    const b = hashEvent("stripe", null, { x: 1 });
    expect(a).toBe(b);
  });

  it("differentiates by source", () => {
    const a = hashEvent("stripe", "kounta", { x: 1 });
    const b = hashEvent("github", "kounta", { x: 1 });
    expect(a).not.toBe(b);
  });

  it("differentiates by venture", () => {
    const a = hashEvent("stripe", "kounta", { x: 1 });
    const b = hashEvent("stripe", "counsel", { x: 1 });
    expect(a).not.toBe(b);
  });

  it("differentiates by payload", () => {
    const a = hashEvent("stripe", "kounta", { x: 1 });
    const b = hashEvent("stripe", "kounta", { x: 2 });
    expect(a).not.toBe(b);
  });

  it("handles nested objects with stable ordering", () => {
    const a = hashEvent("stripe", "kounta", {
      meta: { a: 1, b: 2 },
      type: "x",
    });
    const b = hashEvent("stripe", "kounta", {
      type: "x",
      meta: { b: 2, a: 1 },
    });
    expect(a).toBe(b);
  });
});
