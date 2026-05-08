"use client";

// WatchEntry — single row in The Watch.
//
// Narrative string comes from lib/watch/narrate.ts (pure function); the
// row is a thin renderer.
//
// Hydration note: the timestamp is rendered with getHours()/getMinutes(),
// which depend on the runtime's local timezone. On Vercel the server runs
// in UTC; the operator's browser is local. If we computed the time inline
// during SSR, the server HTML and client first-render would diverge,
// triggering React error #418 ("Hydration failed because the server
// rendered HTML didn't match the client"). In production a hydration
// failure degrades the surrounding subtree — Sprint 10's StreamingDocument
// has been observed to drop its conditional Pause/Cancel buttons because
// of exactly this. So we render a stable "--:--" placeholder server-side
// and on the first client render, then promote to the local-formatted
// time inside useEffect after mount. Do not "simplify" by computing the
// time during initial render.

import { useEffect, useState } from "react";

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

  // Deferred setState matches the LiveClock pattern (components/bridge/
  // LiveClock.tsx): the linter flags synchronous setState inside useEffect
  // because cascading renders are usually a smell, but here it's the whole
  // point — we deliberately want the second render (post-mount) to swap
  // the placeholder for the local-formatted time.
  const [localTime, setLocalTime] = useState<string>("--:--");
  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      setLocalTime(formatLocalTime(event.ts));
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [event.ts]);

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
          className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink-faint tabular-nums"
          dateTime={event.ts}
        >
          {localTime}
        </time>
      </div>
      <p className="text-[13px] text-ink-mute">{narrative}</p>
    </div>
  );
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
