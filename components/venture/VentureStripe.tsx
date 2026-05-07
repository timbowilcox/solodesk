// VentureStripe — pure presentational vertical accent bar.
//
// Per design-system.md venture identity: 3px wide vertical bar in the
// venture's accent color. Used on the left edge of Day items.
// Pure props in.

export type VentureStripeProps = {
  /** Hex accent color from ventures.accent_color. */
  accentColor: string;
  /** Pixel width. Default 3 (Day item). */
  width?: number;
  /** When true, fills parent height (default). When false, uses minHeight. */
  fillParent?: boolean;
  /** Optional minimum height in pixels when fillParent is false. */
  minHeight?: number;
  className?: string;
};

export function VentureStripe({
  accentColor,
  width = 3,
  fillParent = true,
  minHeight = 24,
  className,
}: VentureStripeProps) {
  const style: React.CSSProperties = {
    width: `${width}px`,
    backgroundColor: accentColor,
    ...(fillParent ? { alignSelf: "stretch" } : { minHeight: `${minHeight}px` }),
  };
  return (
    <span
      role="presentation"
      aria-hidden
      className={`block shrink-0 ${className ?? ""}`}
      style={style}
    />
  );
}
