// VentureTile — one tile on the Bridge.
//
// Pure presentational. Consumes Sprint 7 components (VentureMark,
// Sparkline, ConnectionChip, StateDot) so the visual identity stays the
// single source of truth. Click handler routes to /ventures/[slug].
//
// Bright line: this component does not query data. The parent passes a
// fully-shaped BridgeTile in. The tile cannot leak across ventures
// because there's no fetch path.

import Link from "next/link";

import { ConnectionChip } from "@/components/venture/ConnectionChip";
import { Sparkline } from "@/components/venture/Sparkline";
import { StateDot } from "@/components/venture/StateDot";
import { VentureMark } from "@/components/venture/VentureMark";
import type { BridgeTile } from "@/lib/db/bridge";
import {
  formatLastActivity,
  formatPendingCount,
  formatVitalSign,
  tileStateToDot,
} from "@/lib/venture/state-derivation";

export type VentureTileProps = {
  tile: BridgeTile;
};

export function VentureTile({ tile }: VentureTileProps) {
  const dotState = tileStateToDot(tile.state);
  const vital = formatVitalSign(tile.vitalSign, tile.state);
  const pending = formatPendingCount(tile.pendingCount);
  const lastActivity = formatLastActivity(tile.lastActivityAt);

  return (
    <Link
      href={`/ventures/${tile.slug}`}
      data-state={tile.state}
      data-venture-id={tile.ventureId}
      className="group flex flex-col gap-3 border border-rule bg-paper-card p-4 outline-none transition-[border-color,opacity] duration-[120ms] hover:border-rule-strong focus-visible:border-accent"
      aria-label={`${tile.name} venture, ${tile.state}, ${pending}, ${lastActivity}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <VentureMark
            slug={tile.markSlug}
            size={22}
            accentColor={tile.accentColor}
          />
          <h3 className="text-base font-medium tracking-tight text-ink-strong">
            {tile.name}
          </h3>
        </div>
        <StateDot state={dotState} accentColor={tile.accentColor} size={6} />
      </header>

      <p className="text-sm text-ink-mute">{vital}</p>

      <div className="flex items-end justify-between gap-3">
        <div className="text-ink-mute" style={{ color: tile.accentColor }}>
          <Sparkline
            data={tile.sparkline}
            width={70}
            height={18}
            ariaLabel={`Activity sparkline for ${tile.name}`}
          />
        </div>
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-mute">
          {pending}
        </span>
      </div>

      <footer className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1">
          {tile.connections.length === 0 ? (
            <ConnectionChip provider="none" dimmed />
          ) : (
            tile.connections.map((p) => (
              <ConnectionChip key={p} provider={p} />
            ))
          )}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-mute">
          {lastActivity}
        </span>
      </footer>
    </Link>
  );
}
