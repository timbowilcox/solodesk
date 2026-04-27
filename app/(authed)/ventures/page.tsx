import Link from "next/link";

import { PhaseBadge } from "@/components/phase-badge";
import { listVentures } from "@/lib/db/ventures";

export const metadata = {
  title: "Ventures — SoloDesk",
};

export default async function VenturesPage() {
  const ventures = await listVentures();

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Ventures</h1>
          <p className="text-sm text-muted-foreground">
            Every active or dormant venture. One row per slug.
          </p>
        </div>
        <Link
          href="/ventures/new"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          New venture
        </Link>
      </header>

      {ventures.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No ventures yet.{" "}
            <Link href="/ventures/new" className="underline">
              Create the first one.
            </Link>
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-md border border-border">
          {ventures.map((v, idx) => (
            <li
              key={v.id}
              className={idx > 0 ? "border-t border-border" : undefined}
            >
              <Link
                href={`/ventures/${v.slug}`}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 transition hover:bg-muted/30"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">{v.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {v.slug}
                    {v.north_star ? ` · ${v.north_star}` : ""}
                  </p>
                </div>
                <PhaseBadge phase={v.phase} />
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
