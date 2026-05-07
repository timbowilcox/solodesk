import { redirect } from "next/navigation";

import { ConversationThread } from "@/components/loop1/ConversationThread";
import { Watch, type VentureMeta } from "@/components/watch/Watch";
import { requireVentureAccess } from "@/lib/auth/guard";
import { listEventsForVentures } from "@/lib/db/events";
import {
  getOrCreateActiveThread,
  listMessages,
} from "@/lib/db/threads";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `Strategy — ${slug} — SoloDesk` };
}

export default async function StrategyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, venture } = await requireVentureAccess(slug);

  const thread = await getOrCreateActiveThread({
    ventureId: venture.id,
    userId: user.userId,
    loopName: "01-strategy",
  });
  if (!thread) {
    redirect(`/ventures/${slug}`);
  }

  const [messages, watchEvents] = await Promise.all([
    listMessages(thread.id),
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
      <div className="space-y-8">
        <header className="space-y-2 border-b border-rule pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            Strategy — {venture.name}
          </h1>
          <p className="text-sm text-ink-mute">
            Loop 1 · adversarial Decision Document partner.
          </p>
        </header>

        <ConversationThread
          slug={slug}
          ventureId={venture.id}
          ventureName={venture.name}
          ventureAccent={venture.accent_color}
          threadId={thread.id}
          messages={messages.map((m) => ({
            id: m.id,
            role: m.role,
            body: m.body,
            documentId: m.document_id,
            createdAt: m.created_at,
          }))}
        />
      </div>

      <Watch
        initialEvents={watchEvents}
        ventureIds={[venture.id]}
        ventureMeta={ventureMeta}
      />
    </div>
  );
}
