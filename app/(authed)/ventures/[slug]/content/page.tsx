import Link from "next/link";
import { notFound } from "next/navigation";

import { listDocumentsByVenture } from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `Content — ${venture.name} — SoloDesk` };
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "DRAFT", cls: "bg-caution-bg text-caution" },
  reviewing: { label: "REVIEW", cls: "bg-info-bg text-info" },
  approved: { label: "APPROVED", cls: "bg-positive-bg text-positive" },
  published: { label: "PUBLISHED", cls: "bg-positive-bg text-positive" },
  archived: { label: "ARCHIVED", cls: "text-ink-faint" },
};

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-AU", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function ContentListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const documents = await listDocumentsByVenture({
    ventureId: venture.id,
    type: "content",
    limit: 100,
  });

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-6">
        <div className="space-y-2">
          <p className="text-xs">
            <Link
              href={`/ventures/${slug}`}
              className="text-accent underline-offset-2 hover:underline"
            >
              ← {venture.name}
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            Content
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            Drafts for {venture.name}. Brief in, draft out, critic comments
            anchored to paragraphs. Send is a separate explicit action — no
            auto-send.
          </p>
        </div>
        <Link
          href={`/ventures/${slug}/content/new`}
          className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
        >
          New brief
        </Link>
      </header>

      {documents.length === 0 ? (
        <p className="py-4 text-sm text-ink-mute">
          No drafts yet for {venture.name}.
        </p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Title
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Channel
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Status
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const channel =
                (doc.metadata as { channel?: string } | null)?.channel ?? "—";
              const badge = STATUS_BADGE[doc.status] ?? {
                label: doc.status.toUpperCase(),
                cls: "text-ink-mute",
              };
              return (
                <tr
                  key={doc.id}
                  className="border-b border-rule transition-colors duration-[80ms] hover:bg-paper-card"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/ventures/${slug}/content/${doc.id}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                    {channel}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                    {formatTs(doc.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
