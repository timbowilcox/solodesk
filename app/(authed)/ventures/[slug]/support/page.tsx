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
  return { title: `Support — ${venture.name} — SoloDesk` };
}

const CLASSIFICATION_BADGE: Record<string, { label: string; cls: string }> = {
  bug: { label: "BUG", cls: "bg-negative-bg text-negative" },
  question: { label: "QUESTION", cls: "bg-info-bg text-info" },
  churn_risk: { label: "CHURN", cls: "bg-negative-bg text-negative" },
  feature_request: { label: "FEATURE", cls: "bg-positive-bg text-positive" },
  spam: { label: "SPAM", cls: "text-ink-faint" },
  unclear: { label: "UNCLEAR", cls: "bg-caution-bg text-caution" },
};

const URGENCY_BADGE: Record<string, { label: string; cls: string }> = {
  low: { label: "LOW", cls: "text-ink-mute" },
  medium: { label: "MED", cls: "bg-caution-bg text-caution" },
  high: { label: "HIGH", cls: "bg-negative-bg text-negative" },
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

export default async function SupportTriageQueuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const documents = await listDocumentsByVenture({
    ventureId: venture.id,
    type: "support_ticket",
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
            Support
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            Triage queue for {venture.name}. Classifier (haiku) + replier
            (opus). Send is always explicit-click — no auto-send. Webhook
            ingestion lands in a follow-up; for now paste tickets manually.
          </p>
        </div>
        <Link
          href={`/ventures/${slug}/support/new`}
          className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
        >
          Ingest ticket
        </Link>
      </header>

      {documents.length === 0 ? (
        <p className="py-4 text-sm text-ink-mute">
          No tickets yet for {venture.name}.
        </p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Subject
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Class
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Urgency
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                From
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Received
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const meta = (doc.metadata as
                | {
                    classification?: string;
                    urgency?: string;
                    from_address?: string;
                  }
                | null) ?? {};
              const cls = meta.classification ?? "unclear";
              const urgency = meta.urgency ?? "low";
              const cBadge =
                CLASSIFICATION_BADGE[cls] ?? CLASSIFICATION_BADGE.unclear!;
              const uBadge = URGENCY_BADGE[urgency] ?? URGENCY_BADGE.low!;
              return (
                <tr
                  key={doc.id}
                  className="border-b border-rule transition-colors duration-[80ms] hover:bg-paper-card"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/ventures/${slug}/support/${doc.id}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide ${cBadge.cls}`}
                    >
                      {cBadge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide ${uBadge.cls}`}
                    >
                      {uBadge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                    {meta.from_address ?? "—"}
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
