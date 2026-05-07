// WatchEntry — single row in The Watch.
//
// Pure presentational. Narrative string comes from lib/watch/narrate.ts
// (pure function), so this component is just a renderer. Used inside
// the client Watch component but doesn't need its own "use client"
// because it has no hooks.

import { narrateEvent } from "@/lib/watch/narrate";
import type { EventRow } from "@/lib/watch/realtime";

import type { VentureMeta } from "./Watch";

export type WatchEntryProps = {
  event: EventRow;
  meta: VentureMeta | null;
};

export function WatchEntry({ event, meta }: WatchEntryProps) {
  const ventureName = meta?.name ?? "Portfolio";
  const accentColor = meta?.accentColor ?? "#595959";
  const narrative = narrateEvent(
    {
      type: event.type,
      source: event.source,
      payload:
        event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : null,
    },
    { ventureName },
  );

  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
        <span className="text-sm font-medium tracking-tight text-ink-strong">
          {ventureName}
        </span>
        <time
          className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink-faint"
          dateTime={event.ts}
        >
          {formatTimestamp(event.ts)}
        </time>
      </div>
      <p className="text-[13px] text-ink-mute">{narrative}</p>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
