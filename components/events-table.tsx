import Link from "next/link";

import { cn } from "@/lib/utils";
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
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left font-mono text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Timestamp</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Venture</th>
            <th className="px-3 py-2 font-medium">Actor</th>
            <th className="px-3 py-2 font-medium">Payload</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, idx) => (
            <tr
              key={event.id}
              className={cn(
                idx > 0 && "border-t border-border",
                "hover:bg-muted/30",
              )}
            >
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {formatTs(event.ts)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{event.source}</td>
              <td className="px-3 py-2">{event.type}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {event.venture ? (
                  <Link
                    href={`/ventures/${event.venture.slug}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {event.venture.slug}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {event.actor ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {payloadPreview(event.payload)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
