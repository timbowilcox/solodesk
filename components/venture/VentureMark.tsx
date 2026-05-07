// VentureMark — pure presentational SVG of one venture's mark.
//
// Bright line: this component does not query data. mark slug + accent
// pass in via props. No router access, no Supabase, no fetch.

import { getMark, MARK_VIEWBOX, type MarkShape } from "@/lib/venture/marks";
import type { VentureMarkSlug } from "@/lib/supabase/types";

export type VentureMarkProps = {
  slug: VentureMarkSlug | string;
  /** Pixel size of the rendered svg (square). Defaults to 22 (Bridge tile). */
  size?: number;
  /** Hex accent color. Falls through to currentColor; if omitted, parent's color is used. */
  accentColor?: string;
  /** When true, decorative — aria-hidden. When false (default) uses mark.label. */
  decorative?: boolean;
  className?: string;
};

function renderShape(shape: MarkShape, idx: number) {
  switch (shape.kind) {
    case "rect":
      return (
        <rect
          key={idx}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={shape.filled ? "currentColor" : "none"}
          stroke={shape.filled ? "none" : "currentColor"}
          strokeWidth={shape.strokeWidth ?? 2}
        />
      );
    case "polygon":
      return (
        <polygon
          key={idx}
          points={shape.points}
          fill={shape.filled ? "currentColor" : "none"}
          stroke={shape.filled ? "none" : "currentColor"}
          strokeWidth={shape.strokeWidth ?? 2}
        />
      );
    case "line":
      return (
        <line
          key={idx}
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke="currentColor"
          strokeWidth={shape.strokeWidth ?? 2}
        />
      );
    case "circle":
      return (
        <circle
          key={idx}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={shape.filled ? "currentColor" : "none"}
          stroke={shape.filled ? "none" : "currentColor"}
          strokeWidth={shape.strokeWidth ?? 2}
        />
      );
  }
}

export function VentureMark({
  slug,
  size = 22,
  accentColor,
  decorative = false,
  className,
}: VentureMarkProps) {
  const mark = getMark(slug);
  const style = accentColor ? { color: accentColor } : undefined;
  return (
    <svg
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      width={size}
      height={size}
      style={style}
      className={className}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : mark.label}
      strokeLinejoin="miter"
      strokeLinecap="butt"
    >
      {mark.shapes.map(renderShape)}
    </svg>
  );
}
