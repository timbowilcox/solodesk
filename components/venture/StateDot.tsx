// StateDot — pure presentational status pip.
//
// Three states (per design-system.md venture identity):
// - active : pulses 2.2s ease-in-out infinite
// - idle   : 35% opacity, no animation
// - quiet  : 20% opacity, no animation
//
// Active is the only animated component on the Bridge in resting state.
// Pure props in — no data fetch.

export type StateDotState = "active" | "idle" | "quiet";

export type StateDotProps = {
  state: StateDotState;
  /** Pixel size. Default 6 (Bridge tile / Watch entry). */
  size?: number;
  /** Optional accent color. Falls through to currentColor. */
  accentColor?: string;
  /** ARIA label override. Defaults to capitalized state. */
  ariaLabel?: string;
  className?: string;
};

const OPACITY_BY_STATE: Record<StateDotState, number> = {
  active: 1,
  idle: 0.35,
  quiet: 0.2,
};

export function StateDot({
  state,
  size = 6,
  accentColor,
  ariaLabel,
  className,
}: StateDotProps) {
  const opacity = OPACITY_BY_STATE[state];
  const label = ariaLabel ?? `${state} status`;
  const style = {
    width: `${size}px`,
    height: `${size}px`,
    opacity,
    ...(accentColor ? { backgroundColor: accentColor } : {}),
  };
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-state={state}
      className={`state-dot inline-block rounded-full ${state === "active" ? "state-dot-active" : ""} ${className ?? ""}`}
      style={style}
    />
  );
}
