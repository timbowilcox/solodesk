import { listRecentEvents } from "@/lib/db/events";
import { listVentures } from "@/lib/db/ventures";

import { EventsTable } from "@/components/events-table";

import { createEventAction } from "./actions";

export const metadata = {
  title: "Dashboard — SoloDesk",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Source and type are required.",
  invalid_json: "Payload must be valid JSON.",
  duplicate: "An identical event already exists.",
  insert_failed: "Saving the event failed. Check the logs.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const created = typeof params.created === "string" ? params.created : null;

  const [events, ventures] = await Promise.all([
    listRecentEvents({ limit: 50 }),
    listVentures(),
  ]);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Last 50 events across all ventures, plus manual event creation.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Create event
        </h2>
        <form
          action={createEventAction}
          className="grid gap-3 rounded-md border border-border bg-muted/20 p-4 md:grid-cols-2"
        >
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Source
            </span>
            <input
              name="source"
              required
              maxLength={64}
              defaultValue="manual"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Type
            </span>
            <input
              name="type"
              required
              maxLength={64}
              placeholder="e.g. note, decision, meeting"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Venture (optional)
            </span>
            <select
              name="venture"
              defaultValue=""
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            >
              <option value="">— none —</option>
              {ventures.map((v) => (
                <option key={v.id} value={v.slug}>
                  {v.name} ({v.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">
              Payload (JSON, optional)
            </span>
            <textarea
              name="payload"
              rows={3}
              placeholder='{"note": "..."}'
              className="block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <div className="flex items-center justify-between md:col-span-2">
            <p className="text-xs text-muted-foreground">
              {created && (
                <span className="text-foreground">
                  Event {created.slice(0, 8)} created.
                </span>
              )}
              {error && (
                <span className="text-destructive">
                  {ERROR_MESSAGES[error] ?? "Something went wrong."}
                </span>
              )}
            </p>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Create event
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent events
        </h2>
        <EventsTable events={events} />
      </section>
    </div>
  );
}
