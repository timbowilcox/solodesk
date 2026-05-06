import { describe, expect, test } from "vitest";

import { chunkMarkdown } from "@/lib/memory/chunk";

describe("chunkMarkdown", () => {
  test("returns [] for empty input", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   \n\n  ")).toEqual([]);
  });

  test("returns single chunk for short content with no headings", () => {
    const out = chunkMarkdown("Just one paragraph of text.");
    expect(out).toHaveLength(1);
    expect(out[0]?.ord).toBe(0);
    expect(out[0]?.text).toBe("Just one paragraph of text.");
  });

  test("splits on `## ` headings, keeps heading attached to body", () => {
    const md = `# Title\n\nIntro paragraph.\n\n## Section A\n\nA body.\n\n## Section B\n\nB body.`;
    const out = chunkMarkdown(md);
    expect(out).toHaveLength(3);
    expect(out[0]?.text).toContain("# Title");
    expect(out[0]?.text).toContain("Intro paragraph");
    expect(out[1]?.text.startsWith("## Section A")).toBe(true);
    expect(out[2]?.text.startsWith("## Section B")).toBe(true);
  });

  test("ord is sequential starting at 0", () => {
    const md = `## A\nbody.\n\n## B\nbody.\n\n## C\nbody.`;
    const out = chunkMarkdown(md);
    expect(out.map((c) => c.ord)).toEqual([0, 1, 2]);
  });

  test("windows oversized sections with ~50-token overlap", () => {
    // 500 tokens ≈ 2000 chars. Build a section of ~5000 chars → 3 windows.
    const big = "## Big\n" + "x".repeat(5000);
    const out = chunkMarkdown(big);
    expect(out.length).toBeGreaterThanOrEqual(2);
    // every window text is at most TARGET_CHARS (≈2000) long
    for (const c of out) {
      expect(c.text.length).toBeLessThanOrEqual(2000);
    }
  });

  test("does not split if total length is under window size", () => {
    const md = "## Section\n" + "y".repeat(1500);
    const out = chunkMarkdown(md);
    expect(out).toHaveLength(1);
  });
});
