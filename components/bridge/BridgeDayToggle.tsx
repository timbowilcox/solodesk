// BridgeDayToggle — uppercase mono pill linking between Bridge (/) and
// Day (/day). Used in the Bridge chrome and on /day so the operator can
// flip without navigating through the sidebar.

import Link from "next/link";

export type BridgeDayToggleProps = {
  current: "bridge" | "day";
};

export function BridgeDayToggle({ current }: BridgeDayToggleProps) {
  return (
    <nav
      aria-label="Bridge / Day toggle"
      className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider"
    >
      <Link
        href="/"
        aria-current={current === "bridge" ? "page" : undefined}
        className={
          current === "bridge"
            ? "border-b-2 border-accent px-1 py-1 text-ink-strong"
            : "border-b-2 border-transparent px-1 py-1 text-ink-mute hover:text-ink"
        }
      >
        Bridge
      </Link>
      <Link
        href="/day"
        aria-current={current === "day" ? "page" : undefined}
        className={
          current === "day"
            ? "border-b-2 border-accent px-1 py-1 text-ink-strong"
            : "border-b-2 border-transparent px-1 py-1 text-ink-mute hover:text-ink"
        }
      >
        Day
      </Link>
    </nav>
  );
}
