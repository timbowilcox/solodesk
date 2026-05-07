import Link from "next/link";

import { EventsTable } from "@/components/events-table";
import { Markdown } from "@/components/markdown";
import { PhaseBadge } from "@/components/phase-badge";
import { requireVentureAccess } from "@/lib/auth/guard";
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
  const { venture } = await requireVentureAccess(slug);

  const events = await listRecentEvents({ ventureId: venture.id, limit: 50 });

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <p className="text-xs">
          <Link
            href="/ventures"
            className="text-accent underline-offset-2 hover:underline"
          >
            ← Ventures
          </Link>
        </p>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
              {venture.name}
            </h1>
            <PhaseBadge phase={venture.phase} />
            <span className="font-mono text-xs text-ink-mute">
              {venture.slug}
            </span>
          </div>
          <div className="h-px w-12 bg-accent opacity-50" />
        </div>
        {venture.north_star && (
          <p className="pt-2 text-sm text-ink-mute">
            North-star:{" "}
            <span className="font-medium text-ink">{venture.north_star}</span>
          </p>
        )}
        <nav className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm">
          <Link
            href={`/ventures/${venture.slug}/office-hours`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Office hours
          </Link>
          <Link
            href={`/ventures/${venture.slug}/digests`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Digests
          </Link>
          <Link
            href={`/ventures/${venture.slug}/decisions`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Decisions
          </Link>
          <Link
            href={`/ventures/${venture.slug}/content`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Content
          </Link>
          <Link
            href={`/ventures/${venture.slug}/intel`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Intel
          </Link>
          <Link
            href={`/ventures/${venture.slug}/support`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Support
          </Link>
          <Link
            href={`/ventures/${venture.slug}/memories`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Memories
          </Link>
          <Link
            href={`/ventures/${venture.slug}/settings/connections`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Connections
          </Link>
          <Link
            href={`/ventures/${venture.slug}/settings/members`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Members
          </Link>
        </nav>
      </header>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          COMPANY.md
        </h2>
        {venture.company_md ? (
          <Markdown content={venture.company_md} />
        ) : (
          <p className="py-4 text-sm text-ink-mute">
            No COMPANY.md yet for this venture.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
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
