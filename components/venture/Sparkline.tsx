// Sparkline — pure presentational mini line chart.
//
// 8 data points expected; tolerates fewer. Single stroke colored by
// venture accent. Used on Bridge tiles in v1.
//
// Edge cases (per Sprint 7 rubric):
// - flat data (all identical values)        -> centered horizontal line
// - single point                            -> centered dot
// - all-zero                                -> centered horizontal line
// - negative values                         -> min-max normalized to viewbox
// - empty array                             -> renders nothing (no svg)
//
// No data fetching. Pure props in -> svg out.

export type SparklineProps = {
  /** Numeric data points. Up to ~16 supported; designed for 8. */
  data: number[];
  /** Hex accent color. Defaults to currentColor (parent's color). */
  accentColor?: string;
  /** Pixel width. Defaults to 70 (Bridge tile size). */
  width?: number;
  /** Pixel height. Defaults to 18 (Bridge tile size). */
  height?: number;
  /** Stroke width in svg units. Defaults to 1.4. */
  strokeWidth?: number;
  className?: string;
  /** Optional aria label. Defaults to a count summary. */
  ariaLabel?: string;
};

const VIEW_W = 70;
const VIEW_H = 18;
const PAD_X = 1; // visual breathing room — keep 1px from edges
const PAD_Y = 2;

export function Sparkline({
  data,
  accentColor,
  width = VIEW_W,
  height = VIEW_H,
  strokeWidth = 1.4,
  className,
  ariaLabel,
}: SparklineProps) {
  if (!data || data.length === 0) return null;

  const style = accentColor ? { color: accentColor } : undefined;
  const label = ariaLabel ?? `Sparkline of ${data.length} values`;

  // Single point — render a dot at center.
  if (data.length === 1) {
    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width={width}
        height={height}
        style={style}
        className={className}
        role="img"
        aria-label={label}
      >
        <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={1.6} fill="currentColor" />
      </svg>
    );
  }

  // Compute min/max. If they're equal (flat data, all zeros, etc.)
  // render a centered horizontal line — the "no change" reading.
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;

  const innerW = VIEW_W - 2 * PAD_X;
  const innerH = VIEW_H - 2 * PAD_Y;
  const stepX = data.length === 1 ? 0 : innerW / (data.length - 1);

  let pathD: string;
  if (range === 0) {
    // Centered horizontal line.
    const cy = VIEW_H / 2;
    pathD = `M ${PAD_X} ${cy} L ${VIEW_W - PAD_X} ${cy}`;
  } else {
    // Normal min-max normalization. Higher value -> lower y (svg origin
    // top-left). Negative values normalize naturally because we use the
    // observed min as the baseline.
    pathD = data
      .map((v, i) => {
        const x = PAD_X + i * stepX;
        const norm = (v - min) / range; // 0..1
        const y = VIEW_H - PAD_Y - norm * innerH;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={width}
      height={height}
      style={style}
      className={className}
      role="img"
      aria-label={label}
    >
      <path
        d={pathD}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
