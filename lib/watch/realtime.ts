// realtime.ts — Supabase realtime subscription helper for The Watch.
//
// Bright line: subscriptions only run in the browser (Watch is a client
// component). Server-side render path does not import this file.
//
// Pattern:
//   const off = subscribeToVentureEvents({ ventureIds, onInsert });
//   ...
//   off(); // tear down on unmount
//
// Membership filtering: the caller passes the visible venture_id list.
// Inserts for ventures not in that list are dropped client-side. (When
// RLS lands at productisation, the realtime channel filter will become
// the primary boundary.)

import type { RealtimeChannel } from "@supabase/supabase-js";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Tables } from "@/lib/supabase/types";

export type EventRow = Tables<"events">;

export type SubscribeOptions = {
  /** Visible venture IDs. If null, subscriber sees nothing. */
  ventureIds: string[] | null;
  /** Callback fired for every new INSERT into events for a visible venture. */
  onInsert: (row: EventRow) => void;
};

/**
 * Subscribe to INSERTs on `events` for the given venture set. Returns
 * a cleanup function that unsubscribes the channel.
 *
 * If ventureIds is null or empty, no channel is opened — the cleanup
 * function is a no-op.
 */
export function subscribeToVentureEvents(opts: SubscribeOptions): () => void {
  if (!opts.ventureIds || opts.ventureIds.length === 0) {
    return () => {};
  }
  const supabase = createSupabaseBrowserClient();
  const allowed = new Set(opts.ventureIds);
  const channelName = `watch-${cryptoRandomId()}`;

  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on(
      // postgres_changes payload type is a generic; the runtime row is the
      // public.events row shape.
      "postgres_changes" as never,
      {
        event: "INSERT",
        schema: "public",
        table: "events",
      },
      (payload: { new: EventRow }) => {
        const row = payload.new;
        // Drop events without venture_id, or events from ventures the user
        // can't see. The membership filter is the bright line.
        if (!row.venture_id) return;
        if (!allowed.has(row.venture_id)) return;
        opts.onInsert(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
