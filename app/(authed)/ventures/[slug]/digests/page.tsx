import Link from "next/link";
import { notFound } from "next/navigation";

import { digestDateKey, listDigestsForVenture } from "@/lib/db/digests";
import { getVentureBySlug } from "@/lib/db/ventures";

import { generateTodaysDigestAction } from "./actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `Digests — ${venture.name} — SoloDesk` };
}

const ERROR_MESSAGES: Record<string, string> = {
  generate_failed: "Generating today's digest failed.",
};

function formatDateKey(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    weekday: "short",
  });
}

export default async function DigestsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const sParams = await searchParams;
  const error = typeof sParams.error === "string" ? sParams.error : null;

  const digests = await listDigestsForVenture({
    ventureId: venture.id,
    limit: 60,
  });
  const today = digestDateKey();
  const todaysDigest = digests.find(
    (d) => (d.metadata as { date_key?: string } | null)?.date_key === today,
  );

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
            Digests
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            Daily metrics digest for {venture.name}. Generated automatically at
            06:00 Sydney by Loop 8 (cron). Manual trigger below.
          </p>
        </div>
        {todaysDigest ? (
          <Link
            href={`/ventures/${slug}/digests/${today}`}
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            View today
          </Link>
        ) : (
          <form action={generateTodaysDigestAction}>
            <input type="hidden" name="venture_slug" value={slug} />
            <button
              type="submit"
              className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
            >
              Generate today
            </button>
          </form>
        )}
      </header>

      {error && (
        <p className="text-sm text-negative">
          {ERROR_MESSAGES[error] ?? "Something went wrong."}
        </p>
      )}

      {digests.length === 0 ? (
        <p className="py-4 text-sm text-ink-mute">
          No digests yet for {venture.name}.
        </p>
      ) : (
        <table className="w-full text-base">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Date
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Title
              </th>
              <th className="px-3 py-2 text-sm font-medium uppercase tracking-wide text-ink-mute">
                Generated
              </th>
            </tr>
          </thead>
          <tbody>
            {digests.map((d) => {
              const dateKey =
                (d.metadata as { date_key?: string } | null)?.date_key ?? "";
              const created = new Date(d.created_at);
              const createdLabel = created.toLocaleString("en-AU", {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              return (
                <tr
                  key={d.id}
                  className="border-b border-rule transition-colors duration-[80ms] hover:bg-paper-card"
                >
                  <td className="px-3 py-2 font-mono text-sm">
                    {dateKey || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/ventures/${slug}/digests/${dateKey || d.id}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {d.title}
                    </Link>
                    {dateKey === today && (
                      <span className="ml-2 inline-flex items-center bg-info-bg px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide text-info">
                        TODAY
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-mute">
                    {createdLabel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {digests.length > 0 && (
        <p className="pt-2 text-xs text-ink-mute">
          Date format reference — last visible:{" "}
          {formatDateKey(
            (digests[0]?.metadata as { date_key?: string } | null)
              ?.date_key ?? today,
          )}
        </p>
      )}
    </div>
  );
}
