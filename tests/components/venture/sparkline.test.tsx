// Sparkline edge-case tests — Sprint 7 acceptance criterion.
//
// Renders directly to string via React's built-in renderer. We assert
// on the resulting svg structure (path "d" attribute, presence of
// circle for single point, etc.). No DOM library required.

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Sparkline } from "@/components/venture/Sparkline";

describe("Sparkline edge cases (Sprint 7 acceptance)", () => {
  test("empty array renders nothing", () => {
    const html = renderToStaticMarkup(<Sparkline data={[]} />);
    expect(html).toBe("");
  });

  test("single point renders a centered dot, not a line", () => {
    const html = renderToStaticMarkup(<Sparkline data={[42]} />);
    expect(html).toContain("<circle");
    expect(html).not.toContain("<path");
  });

  test("flat data renders a centered horizontal line, not stacked at bottom", () => {
    const html = renderToStaticMarkup(
      <Sparkline data={[7, 7, 7, 7, 7, 7, 7, 7]} />,
    );
    expect(html).toContain("<path");
    // Centered horizontal — y should be VIEW_H/2 = 9
    expect(html).toMatch(/M\s*1\s*9\s*L\s*69\s*9/);
    // Should NOT be stacked at the bottom (y=16 etc.)
    expect(html).not.toMatch(/y\s*16/);
  });

  test("all-zero data renders a centered horizontal line, not at the bottom", () => {
    const html = renderToStaticMarkup(
      <Sparkline data={[0, 0, 0, 0, 0, 0, 0, 0]} />,
    );
    expect(html).toContain("<path");
    expect(html).toMatch(/M\s*1\s*9\s*L\s*69\s*9/);
  });

  test("negative values are min-max normalized into the viewbox", () => {
    const html = renderToStaticMarkup(
      <Sparkline data={[-5, -2, 0, 1, -3, 2, 4, -1]} />,
    );
    expect(html).toContain("<path");
    // Pull the d attribute and confirm every y is within [PAD_Y=2, VIEW_H-PAD_Y=16]
    const dMatch = /d="([^"]+)"/.exec(html);
    expect(dMatch).not.toBeNull();
    const d = dMatch![1]!;
    const ys = Array.from(d.matchAll(/[ML]\s+[\d.]+\s+([\d.]+)/g)).map((m) =>
      parseFloat(m[1]!),
    );
    expect(ys.length).toBe(8);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(2);
      expect(y).toBeLessThanOrEqual(16);
    }
    // At least one point at the top (smallest y near 2 — corresponds to the max value)
    expect(Math.min(...ys)).toBeLessThan(3);
    // At least one point at the bottom (largest y near 16 — corresponds to the min value)
    expect(Math.max(...ys)).toBeGreaterThan(15);
  });

  test("eight ascending points render eight M/L commands", () => {
    const html = renderToStaticMarkup(
      <Sparkline data={[1, 2, 3, 4, 5, 6, 7, 8]} />,
    );
    const moveCount = (html.match(/M\s+\d/g) ?? []).length;
    const lineCount = (html.match(/L\s+\d/g) ?? []).length;
    expect(moveCount).toBe(1);
    expect(lineCount).toBe(7);
  });

  test("accentColor prop sets svg color style", () => {
    const html = renderToStaticMarkup(
      <Sparkline data={[1, 2, 3]} accentColor="#3B6D11" />,
    );
    expect(html).toMatch(/style="color:\s*#3B6D11/);
  });

  test("custom width/height attributes are reflected in the svg element", () => {
    const html = renderToStaticMarkup(
      <Sparkline data={[1, 2, 3]} width={140} height={36} />,
    );
    expect(html).toMatch(/width="140"/);
    expect(html).toMatch(/height="36"/);
  });
});
