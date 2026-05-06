import Link from "next/link";

import type { EventWithVenture } from "@/lib/db/events";

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function payloadPreview(payload: unknown): string {
  if (payload === null || payload === undefined) return "—";
  if (typeof payload === "string") return payload.slice(0, 80);
  try {
    const json = JSON.stringify(payload);
    if (json.length <= 80) return json;
    return `${json.slice(0, 77)}…`;
  } catch {
    return "—";
  }
}

export function EventsTable({
  events,
  emptyMessage = "No events yet.",
}: {
  events: EventWithVenture[];
  emptyMessage?: string;
}) {
  if (events.length === 0) {
    return <p className="py-4 text-sm text-ink-mute">{emptyMessage}</p>;
  }
  return (
    <table className="w-full text-base">
      <thead>
        <tr className="border-b border-rule text-left">
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Time
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Source
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Type
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Venture
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Actor
          </th>
          <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
            Payload
          </th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => (
          <tr
            key={event.id}
            className="border-b border-rule transition-colors duration-[80ms] hover:bg-paper-card"
          >
            <td className="px-3 py-2 font-mono text-xs text-ink-mute">
              {formatTs(event.ts)}
            </td>
            <td className="px-3 py-2 font-mono text-xs">{event.source}</td>
            <td className="px-3 py-2">{event.type}</td>
            <td className="px-3 py-2 font-mono text-xs">
              {event.venture ? (
                <Link
                  href={`/ventures/${event.venture.slug}`}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  {event.venture.slug}
                </Link>
              ) : (
                <span className="text-ink-faint">—</span>
              )}
            </td>
            <td className="px-3 py-2 text-xs text-ink-mute">
              {event.actor ?? "—"}
            </td>
            <td className="px-3 py-2 font-mono text-xs text-ink-mute">
              {payloadPreview(event.payload)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
