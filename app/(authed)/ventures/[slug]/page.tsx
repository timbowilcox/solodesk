import Link from "next/link";
import { notFound } from "next/navigation";

import { EventsTable } from "@/components/events-table";
import { Markdown } from "@/components/markdown";
import { PhaseBadge } from "@/components/phase-badge";
import { listRecentEvents } from "@/lib/db/events";
import { getVentureBySlug } from "@/lib/db/ventures";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return {
    title: `${venture.name} — SoloDesk`,
  };
}

export default async function VenturePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const events = await listRecentEvents({ ventureId: venture.id, limit: 50 });

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-xs text-muted-foreground">
          <Link href="/ventures" className="underline-offset-2 hover:underline">
            ← Ventures
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {venture.name}
          </h1>
          <PhaseBadge phase={venture.phase} />
          <span className="font-mono text-xs text-muted-foreground">
            {venture.slug}
          </span>
        </div>
        {venture.north_star && (
          <p className="text-sm text-muted-foreground">
            North-star: <span className="font-medium">{venture.north_star}</span>
          </p>
        )}
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          COMPANY.md
        </h2>
        {venture.company_md ? (
          <div className="rounded-md border border-border bg-background p-6">
            <Markdown content={venture.company_md} />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No COMPANY.md yet for this venture.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent events
        </h2>
        <EventsTable
          events={events}
          emptyMessage={`No events for ${venture.name} yet.`}
        />
      </section>
    </div>
  );
}
