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

const inputClass =
  "block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

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
    <div className="space-y-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          Dashboard
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Last 50 events across all ventures, plus manual event creation.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          Create event
        </h2>
        <form action={createEventAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>Source</span>
              <input
                name="source"
                required
                maxLength={64}
                defaultValue="manual"
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Type</span>
              <input
                name="type"
                required
                maxLength={64}
                placeholder="e.g. note, decision, meeting"
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Venture (optional)</span>
              <select
                name="venture"
                defaultValue=""
                className={inputClass}
              >
                <option value="">— none —</option>
                {ventures.map((v) => (
                  <option key={v.id} value={v.slug}>
                    {v.name} ({v.slug})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Payload (JSON, optional)</span>
            <textarea
              name="payload"
              rows={3}
              placeholder='{"note": "..."}'
              className="block w-full border border-rule-strong bg-paper-card px-3 py-2 font-mono text-sm text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </label>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs">
              {created && (
                <span className="text-ink">
                  Event {created.slice(0, 8)} created.
                </span>
              )}
              {error && (
                <span className="text-negative">
                  {ERROR_MESSAGES[error] ?? "Something went wrong."}
                </span>
              )}
            </p>
            <button
              type="submit"
              className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
            >
              Create event
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          Recent events
        </h2>
        <EventsTable events={events} />
      </section>
    </div>
  );
}
