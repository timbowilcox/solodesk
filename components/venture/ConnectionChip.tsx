// ConnectionChip — pure presentational pill for a connection provider.
//
// Per design-system.md venture identity: small mono uppercase pill,
// first 3 chars of provider name, 0.5px border, neutral palette.
// Empty connections array shows "none" chip dimmed (rendered by the
// parent — this component only renders one chip).

export type ConnectionChipProps = {
  /** Provider slug, e.g. "stripe" -> "STR". Use "none" for the empty placeholder. */
  provider: string;
  /** When true, chip renders dimmed (used for the "none" placeholder). */
  dimmed?: boolean;
  className?: string;
};

export function ConnectionChip({
  provider,
  dimmed = false,
  className,
}: ConnectionChipProps) {
  const label = provider.slice(0, 3).toUpperCase();
  return (
    <span
      data-provider={provider}
      className={`inline-block border border-rule-strong px-1 py-px font-mono text-[10px] uppercase tracking-wider leading-none ${dimmed ? "text-ink-faint border-rule" : "text-ink-mute"} ${className ?? ""}`}
      style={{ borderWidth: "0.5px" }}
      title={provider}
    >
      {label}
    </span>
  );
}
