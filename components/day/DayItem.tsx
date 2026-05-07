// DayItem — single row in The Day.
//
// VentureStripe (3px accent bar) on left edge, native checkbox for the
// dismiss toggle, small VentureMark + venture name in the source line,
// title, and source descriptor. Clicking the checkbox submits a server
// action that toggles a row in day_item_dismissals.

import Link from "next/link";

import { VentureMark } from "@/components/venture/VentureMark";
import { VentureStripe } from "@/components/venture/VentureStripe";
import type { DayItem } from "@/lib/day/curate";

import { toggleDayDismissalAction } from "@/app/(authed)/day/actions";

export type DayItemRowProps = {
  item: DayItem;
};

export function DayItemRow({ item }: DayItemRowProps) {
  return (
    <div
      data-day-item
      data-kind={item.kind}
      data-dismissed={item.dismissed ? "true" : "false"}
      className="flex items-stretch border border-rule bg-paper-card"
    >
      <VentureStripe accentColor={item.ventureAccent} fillParent />
      <div className="flex flex-1 items-center gap-3 px-4 py-3">
        <form action={toggleDayDismissalAction}>
          <input type="hidden" name="kind" value={item.kind} />
          <input type="hidden" name="id" value={item.id} />
          <input
            type="hidden"
            name="dismissed"
            value={item.dismissed ? "true" : "false"}
          />
          <button
            type="submit"
            aria-label={
              item.dismissed
                ? `Restore ${item.title}`
                : `Mark ${item.title} as done for today`
            }
            aria-pressed={item.dismissed}
            className="flex h-4 w-4 items-center justify-center border border-rule-strong bg-paper-card text-ink-mute transition-colors duration-[80ms] hover:border-accent"
          >
            {item.dismissed ? (
              <span aria-hidden className="text-[11px] leading-none">×</span>
            ) : null}
          </button>
        </form>

        <div
          className={`flex flex-1 flex-col gap-1 ${
            item.dismissed ? "opacity-50 [&_a]:line-through" : ""
          }`}
        >
          <Link
            href={item.href}
            className="text-[13.5px] font-medium tracking-tight text-ink-strong hover:underline"
          >
            {item.title}
          </Link>
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-mute">
            <VentureMark
              slug={item.ventureMarkSlug}
              size={14}
              accentColor={item.ventureAccent}
              decorative
            />
            <span>{item.ventureName}</span>
            <span aria-hidden>·</span>
            <span>{item.source}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
