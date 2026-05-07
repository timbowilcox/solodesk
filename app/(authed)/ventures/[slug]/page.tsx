import { EventsTable } from "@/components/events-table";
import { Markdown } from "@/components/markdown";
import { Watch, type VentureMeta } from "@/components/watch/Watch";
import { VentureBridge } from "@/components/venture/VentureBridge";
import { requireVentureAccess } from "@/lib/auth/guard";
import { listEventsForVentures, listRecentEvents } from "@/lib/db/events";
import { getVentureBySlug } from "@/lib/db/ventures";
import { getVentureFunctionState } from "@/lib/db/venture-bridge";

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

  const [functionState, events, watchEvents] = await Promise.all([
    getVentureFunctionState(venture.id),
    listRecentEvents({ ventureId: venture.id, limit: 25 }),
    listEventsForVentures({ ventureIds: [venture.id], limit: 25 }),
  ]);

  const ventureMeta: Record<string, VentureMeta> = {
    [venture.id]: {
      ventureId: venture.id,
      name: venture.name,
      accentColor: venture.accent_color,
    },
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-12">
        <VentureBridge venture={venture} functionState={functionState} />

        {venture.company_md && (
          <section className="space-y-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
              COMPANY.md
            </h2>
            <Markdown content={venture.company_md} />
          </section>
        )}

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

      <Watch
        initialEvents={watchEvents}
        ventureIds={[venture.id]}
        ventureMeta={ventureMeta}
      />
    </div>
  );
}
