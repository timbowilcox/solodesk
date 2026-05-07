// Day — server-rendered curated list of items needing operator attention.
//
// Pure presentational. Items come pre-sorted from lib/day/curate.ts.
// Dismissed items are rendered with strikethrough + faded; clicking
// toggles via a server action.

import type { DayItem } from "@/lib/day/curate";

import { DayItemRow } from "./DayItem";

export type DayProps = {
  items: DayItem[];
};

export function Day({ items }: DayProps) {
  if (items.length === 0) {
    return (
      <div className="border border-rule bg-paper-card p-12">
        <h2 className="text-base font-medium tracking-tight text-ink-strong">
          All clear. The day is closed.
        </h2>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <DayItemRow key={`${item.kind}:${item.id}`} item={item} />
      ))}
    </div>
  );
}
