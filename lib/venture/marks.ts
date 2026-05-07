// SoloDesk venture marks — Sprint 7 / Experience layer.
//
// Per the design-system.md venture identity section: marks are six
// geometric SVGs + a generic fallback, defined as DATA (not React
// components) so the renderer is the single source of truth for sizing,
// stroke widths, and accent flow via `currentColor`.
//
// Every shape uses currentColor — the renderer sets `color: <accent>`
// on the wrapping element so accent flows in. No fill/stroke colour is
// hardcoded in this file.
//
// All marks live on a 24x24 viewBox. Designed to remain identifiable
// at 16px (the smallest used size — Watch entries / Day items).

import type { VentureMarkSlug } from "@/lib/supabase/types";

export type MarkShape =
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      filled?: boolean;
      strokeWidth?: number;
    }
  | {
      kind: "polygon";
      points: string;
      filled?: boolean;
      strokeWidth?: number;
    }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      strokeWidth?: number;
    }
  | {
      kind: "circle";
      cx: number;
      cy: number;
      r: number;
      filled?: boolean;
      strokeWidth?: number;
    };

export type MarkData = {
  /** ARIA label used when the mark renders standalone. */
  label: string;
  /** Ordered list of shape primitives composing the mark. */
  shapes: MarkShape[];
};

export const MARK_VIEWBOX = 24 as const;

const KOUNTA: MarkData = {
  label: "Kounta",
  // Three horizontal bars — ledger entries / book-rules. Reads as financial.
  shapes: [
    { kind: "rect", x: 4, y: 6, width: 16, height: 2, filled: true },
    { kind: "rect", x: 4, y: 11, width: 16, height: 2, filled: true },
    { kind: "rect", x: 4, y: 16, width: 16, height: 2, filled: true },
  ],
};

const CORUM: MarkData = {
  label: "Corum",
  // Diamond outline — board / governance. Square rotated 45°.
  shapes: [
    { kind: "polygon", points: "12,3 21,12 12,21 3,12", strokeWidth: 2 },
  ],
};

const COUNSEL: MarkData = {
  label: "Counsel",
  // Outer square + inner triangle. Reads as a heritage shield reduced.
  shapes: [
    {
      kind: "rect",
      x: 3,
      y: 3,
      width: 18,
      height: 18,
      strokeWidth: 2,
    },
    { kind: "polygon", points: "12,7 17,17 7,17", filled: true },
  ],
};

const CANEMATE: MarkData = {
  label: "CaneMate",
  // Three vertical stems — sugarcane field.
  shapes: [
    { kind: "rect", x: 5, y: 4, width: 2, height: 16, filled: true },
    { kind: "rect", x: 11, y: 4, width: 2, height: 16, filled: true },
    { kind: "rect", x: 17, y: 4, width: 2, height: 16, filled: true },
  ],
};

const REALSTYLER: MarkData = {
  label: "RealStyler",
  // Pentagon outline — gabled house silhouette.
  shapes: [
    {
      kind: "polygon",
      points: "12,3 20,10 17,21 7,21 4,10",
      strokeWidth: 2,
    },
  ],
};

const REALTELLIGENCE: MarkData = {
  label: "Realtelligence",
  // Two stacked filled blocks with a gap — printed page split / column
  // block. Reads as publishing without depending on a paper-colour
  // cutout (which would shift between light and dark themes).
  shapes: [
    { kind: "rect", x: 4, y: 4, width: 16, height: 7, filled: true },
    { kind: "rect", x: 4, y: 13, width: 16, height: 7, filled: true },
  ],
};

const GENERIC: MarkData = {
  label: "Venture",
  // Plain square outline — placeholder for any venture without a mark.
  shapes: [
    { kind: "rect", x: 4, y: 4, width: 16, height: 16, strokeWidth: 2 },
  ],
};

export const MARKS: Record<VentureMarkSlug, MarkData> = {
  kounta: KOUNTA,
  corum: CORUM,
  counsel: COUNSEL,
  canemate: CANEMATE,
  realstyler: REALSTYLER,
  realtelligence: REALTELLIGENCE,
  generic: GENERIC,
};

export function getMark(slug: VentureMarkSlug | string): MarkData {
  return (MARKS as Record<string, MarkData | undefined>)[slug] ?? GENERIC;
}
