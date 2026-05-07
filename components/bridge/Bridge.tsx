// Bridge — the operator's home canvas.
//
// 2-3 column responsive grid of venture tiles via auto-fit minmax(280px).
// Right rail = The Watch placeholder (Sprint 9 wires it). Top chrome =
// SoloDesk wordmark + Bridge / Day toggle (Day disabled until Sprint 9) +
// live clock.
//
// Pure presentational. Tiles arrive fully populated by the parent
// (server component in app/(authed)/page.tsx). No fetch here.

import { TimeOfDayProvider } from "@/components/bridge/TimeOfDayProvider";
import { VentureTile } from "@/components/bridge/VentureTile";
import { Watch, type VentureMeta } from "@/components/watch/Watch";
import type { BridgeTile } from "@/lib/db/bridge";
import type { EventRow } from "@/lib/watch/realtime";

import { BridgeDayToggle } from "./BridgeDayToggle";
import { LiveClock } from "./LiveClock";

export type BridgeProps = {
  tiles: BridgeTile[];
  /** Operator email for the small identifier in the chrome. */
  operatorEmail: string;
  /** Initial Watch snapshot (server-rendered first paint). */
  initialEvents: EventRow[];
};

export function Bridge({ tiles, operatorEmail, initialEvents }: BridgeProps) {
  const ventureIds = tiles.map((t) => t.ventureId);
  const ventureMeta: Record<string, VentureMeta> = {};
  for (const t of tiles) {
    ventureMeta[t.ventureId] = {
      ventureId: t.ventureId,
      name: t.name,
      accentColor: t.accentColor,
    };
  }

  return (
    <TimeOfDayProvider>
      <div
        data-bridge-root
        className="flex min-h-[calc(100vh-6rem)] flex-col gap-8 border border-rule bg-paper p-6"
        style={{
          // --chrome-tone is set by TimeOfDayProvider; the border picks it up.
          borderColor: "var(--bridge-frame, var(--color-rule))",
        }}
      >
        <header className="flex items-center justify-between border-b border-rule pb-4">
          <div className="flex items-center gap-6">
            <h1 className="text-base font-semibold tracking-tight text-ink-strong">
              SoloDesk
            </h1>
            <BridgeDayToggle current="bridge" />
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-ink-mute">
            <LiveClock />
            <span>{operatorEmail}</span>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_18rem]">
          <section aria-label="Venture tiles">
            {tiles.length === 0 ? (
              <EmptyState />
            ) : (
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(280px, 1fr))",
                }}
              >
                {tiles.map((tile) => (
                  <VentureTile key={tile.ventureId} tile={tile} />
                ))}
              </div>
            )}
          </section>

          <Watch
            initialEvents={initialEvents}
            ventureIds={ventureIds}
            ventureMeta={ventureMeta}
          />
        </div>
      </div>
    </TimeOfDayProvider>
  );
}

function EmptyState() {
  return (
    <div className="border border-rule bg-paper-card p-12">
      <h2 className="text-base font-medium tracking-tight text-ink-strong">
        No ventures yet.
      </h2>
      <p className="pt-3 text-sm text-ink-mute">
        You aren&apos;t a member of any ventures. Ask the operator to add you.
      </p>
    </div>
  );
}
