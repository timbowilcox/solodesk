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
  return { title: `Decisions — ${venture.name} — SoloDesk` };
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "DRAFT", cls: "bg-caution-bg text-caution" },
  reviewing: { label: "REVIEW", cls: "bg-info-bg text-info" },
  approved: { label: "APPROVED", cls: "bg-positive-bg text-positive" },
  rejected: { label: "REJECTED", cls: "bg-negative-bg text-negative" },
  archived: { label: "ARCHIVED", cls: "text-ink-faint" },
};

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function DecisionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const documents = await listDocumentsByVenture({
    ventureId: venture.id,
    type: "decision",
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
            Decisions
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            Decision documents for {venture.name}. Hand-authored in v0; agents
            arrive in Sprint 3.
          </p>
        </div>
        <Link
          href={`/ventures/${slug}/decisions/new`}
          className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
        >
          New decision
        </Link>
      </header>

      {documents.length === 0 ? (
        <p className="py-4 text-sm text-ink-mute">
          No decisions yet for {venture.name}.
        </p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Title
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
                      href={`/ventures/${slug}/decisions/${doc.id}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {doc.title}
                    </Link>
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
