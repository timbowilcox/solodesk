// FunctionTile — one of the 6 function cells on the Venture Bridge.
//
// Pure presentational. Phosphor regular weight icon (NOT Tabler — the
// Sprint 8 spec called for Tabler, but CLAUDE.md hard-prohibits both
// Lucide and Tabler in favour of Phosphor regular weight; substitution
// ratified by Tim 2026-05-07).
//
// State line is short text the parent passes in (e.g. "3 in review",
// "Last digest 2d ago"). The tile itself never queries — keeps the
// venture-isolation bright line architecturally enforceable.

import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";

export type FunctionTileProps = {
  /** Phosphor icon component. Always regular weight (the package default). */
  icon: Icon;
  /** Function name (e.g. "Strategy"). */
  label: string;
  /** Short state line (e.g. "3 in review"). Falls back to "Quiet" if null. */
  stateLine?: string | null;
  /** Where the tile links to. */
  href: string;
};

export function FunctionTile({
  icon: IconComponent,
  label,
  stateLine,
  href,
}: FunctionTileProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 border border-rule bg-paper-card p-4 outline-none transition-[border-color] duration-[120ms] hover:border-rule-strong focus-visible:border-accent"
      aria-label={`${label} — ${stateLine ?? "Quiet"}`}
    >
      <header className="flex items-center gap-2">
        <IconComponent
          size={18}
          weight="regular"
          aria-hidden="true"
          className="text-ink-mute"
        />
        <h3 className="text-base font-medium tracking-tight text-ink-strong">
          {label}
        </h3>
      </header>
      <p className="text-sm text-ink-mute">{stateLine ?? "Quiet"}</p>
    </Link>
  );
}
