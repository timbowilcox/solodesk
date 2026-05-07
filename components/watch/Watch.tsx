"use client";

// Watch — right-rail ambient feed.
//
// Receives an initial snapshot of recent events from the parent server
// component so first paint has content. Then opens a Supabase realtime
// channel and prepends new INSERTs as they arrive. Throttles to one
// render per ~150ms when bursts arrive (>5 events in 1s rule).
//
// Membership scoping: parent passes `ventureIds` (visible ventures) and
// a `ventureMeta` lookup keyed by venture_id (name + accent_color). The
// realtime helper drops events whose venture_id isn't in the allowed
// set. No path here that can leak across ventures.
//
// Internal Loop activity surfaces here as observation, not communication —
// per CLAUDE.md bright line. The Watch never sends; it watches.

import { useEffect, useMemo, useRef, useState } from "react";

import {
  subscribeToVentureEvents,
  type EventRow,
} from "@/lib/watch/realtime";

import { WatchEntry } from "./WatchEntry";

export type VentureMeta = {
  ventureId: string;
  name: string;
  accentColor: string;
};

export type WatchProps = {
  initialEvents: EventRow[];
  /** Visible venture IDs. Realtime is filtered to this set. */
  ventureIds: string[];
  /** Lookup of venture metadata for narration + dot rendering. */
  ventureMeta: Record<string, VentureMeta>;
  /** Optional max entries to keep in DOM. Defaults to 25. */
  maxEntries?: number;
};

const DEFAULT_MAX = 25;
const THROTTLE_MS = 150;

export function Watch({
  initialEvents,
  ventureIds,
  ventureMeta,
  maxEntries = DEFAULT_MAX,
}: WatchProps) {
  const [events, setEvents] = useState<EventRow[]>(() =>
    initialEvents.slice(0, maxEntries),
  );
  // Pending events that arrived during the throttle window.
  const pendingRef = useRef<EventRow[]>([]);
  const flushHandleRef = useRef<number | null>(null);

  useEffect(() => {
    function flush() {
      flushHandleRef.current = null;
      if (pendingRef.current.length === 0) return;
      const incoming = pendingRef.current;
      pendingRef.current = [];
      setEvents((prev) => {
        // Newest first, dedupe by id, cap at maxEntries.
        const seen = new Set<string>();
        const merged: EventRow[] = [];
        for (const row of [...incoming, ...prev]) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          merged.push(row);
          if (merged.length >= maxEntries) break;
        }
        return merged;
      });
    }

    function scheduleFlush() {
      if (flushHandleRef.current !== null) return;
      flushHandleRef.current = window.setTimeout(flush, THROTTLE_MS);
    }

    const off = subscribeToVentureEvents({
      ventureIds,
      onInsert: (row) => {
        pendingRef.current.push(row);
        scheduleFlush();
      },
    });

    return () => {
      off();
      if (flushHandleRef.current !== null) {
        window.clearTimeout(flushHandleRef.current);
        flushHandleRef.current = null;
      }
      pendingRef.current = [];
    };
    // ventureIds membership is a stable list per render of the parent;
    // we re-subscribe if it changes.
  }, [ventureIds, maxEntries]);

  // Cap snapshot size if parent passes more than maxEntries.
  const visible = useMemo(() => events.slice(0, maxEntries), [events, maxEntries]);

  return (
    <aside
      aria-label="The Watch"
      className="flex h-full flex-col border border-rule bg-paper-card"
    >
      <header className="border-b border-rule p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          The Watch
        </h2>
      </header>
      {visible.length === 0 ? (
        <div className="flex-1 p-4">
          <p className="text-sm text-ink-faint">All quiet.</p>
        </div>
      ) : (
        <ul
          aria-label="Recent activity"
          className="flex-1 divide-y divide-rule overflow-y-auto"
        >
          {visible.map((event, idx) => {
            const meta = event.venture_id
              ? ventureMeta[event.venture_id]
              : undefined;
            // Latest entry (idx 0) gets the fade-in animation. Older entries
            // already faded in on previous paints.
            const isFresh = idx === 0;
            return (
              <li
                key={event.id}
                className={isFresh ? "watch-entry-fresh" : undefined}
              >
                <WatchEntry event={event} meta={meta ?? null} />
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
