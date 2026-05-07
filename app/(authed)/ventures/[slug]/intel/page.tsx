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
  return { title: `Intel — ${venture.name} — SoloDesk` };
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default async function IntelListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const documents = await listDocumentsByVenture({
    ventureId: venture.id,
    type: "intel_digest",
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
            Intel
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            Weekly intel digests for {venture.name}. Paste observations from
            sources; the scout triages into a signals table; the critic kills
            the noise.
          </p>
        </div>
        <Link
          href={`/ventures/${slug}/intel/new`}
          className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
        >
          New scan
        </Link>
      </header>

      {documents.length === 0 ? (
        <p className="py-4 text-sm text-ink-mute">
          No intel digests yet for {venture.name}.
        </p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Title
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Signals
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const sigCount =
                (doc.metadata as { signal_count?: number } | null)
                  ?.signal_count ?? 0;
              return (
                <tr
                  key={doc.id}
                  className="border-b border-rule transition-colors duration-[80ms] hover:bg-paper-card"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/ventures/${slug}/intel/${doc.id}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tabular text-base">{sigCount}</td>
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
