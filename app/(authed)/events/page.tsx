import Link from "next/link";

import { EventsTable } from "@/components/events-table";
import { listRecentEvents } from "@/lib/db/events";

export const metadata = {
  title: "Events — SoloDesk",
};

const PAGE_SIZE = 50;

function clampPage(raw: string | string[] | undefined): number {
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, 1000);
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = clampPage(params.page);
  const offset = (page - 1) * PAGE_SIZE;

  const events = await listRecentEvents({
    limit: PAGE_SIZE + 1,
    offset,
  });

  const hasNext = events.length > PAGE_SIZE;
  const visible = hasNext ? events.slice(0, PAGE_SIZE) : events;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">
          Full event log across all ventures and sources.
        </p>
      </header>

      <EventsTable events={visible} />

      <nav className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {page}
          {hasNext ? ` · ${visible.length} of ≥${visible.length + 1}` : ""}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/events?page=${page - 1}`}
              className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted/40"
            >
              ← Previous
            </Link>
          )}
          {hasNext && (
            <Link
              href={`/events?page=${page + 1}`}
              className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted/40"
            >
              Next →
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
