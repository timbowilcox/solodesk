import Link from "next/link";
import { notFound } from "next/navigation";

import { listMemoriesForVenture } from "@/lib/db/memories";
import { getVentureBySlug } from "@/lib/db/ventures";

import { createMemoryAction } from "./actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `Memories — ${venture.name} — SoloDesk` };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Memory text is required.",
  insert_failed: "Saving failed. Check the logs.",
};

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default async function VentureMemoriesPage({
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
  const created = typeof sParams.created === "string" ? sParams.created : null;

  const memories = await listMemoriesForVenture({
    ventureId: venture.id,
    limit: 100,
  });

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <p className="text-xs">
          <Link
            href={`/ventures/${slug}`}
            className="text-accent underline-offset-2 hover:underline"
          >
            ← {venture.name}
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          Memories
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Free-form notes that future agent runs can recall semantically.
          Append-only in v0.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          Add memory
        </h2>
        <form action={createMemoryAction} className="space-y-4">
          <input type="hidden" name="venture_slug" value={slug} />
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-ink-mute">
              Note
            </span>
            <textarea
              name="text"
              required
              maxLength={8_000}
              rows={4}
              placeholder="Customer X said pricing felt steep. Anomaly explained by Friday deploy."
              className="block w-full border border-rule-strong bg-paper-card px-3 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-ink-mute">
              Tags (comma-separated, optional)
            </span>
            <input
              name="tags"
              maxLength={200}
              placeholder="pricing, customer-feedback"
              className="block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none"
            />
          </label>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs">
              {created && (
                <span className="text-ink">Memory {created} saved.</span>
              )}
              {error && (
                <span className="text-negative">
                  {ERROR_MESSAGES[error] ?? "Something went wrong."}
                </span>
              )}
            </p>
            <button
              type="submit"
              className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
            >
              Add memory
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          Recent memories ({memories.length})
        </h2>
        {memories.length === 0 ? (
          <p className="py-4 text-sm text-ink-mute">
            No memories yet for {venture.name}.
          </p>
        ) : (
          <ul className="space-y-6">
            {memories.map((m) => (
              <li key={m.id} className="space-y-2 border-b border-rule pb-6">
                <div className="flex flex-wrap items-baseline gap-3 text-xs text-ink-mute">
                  <span className="font-mono">{formatTs(m.ts)}</span>
                  <span className="font-mono">· {m.source}</span>
                  <span
                    className={
                      m.embedded_at
                        ? "font-mono text-positive"
                        : "font-mono text-caution"
                    }
                    title={
                      m.embedded_at
                        ? `embedded at ${m.embedded_at}`
                        : "pending — backlog cron will embed within 5 min"
                    }
                  >
                    · {m.embedded_at ? "embedded" : "pending"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-base text-ink">
                  {m.text}
                </p>
                {m.tags.length > 0 && (
                  <p className="font-mono text-xs text-ink-mute">
                    {m.tags.map((t) => `#${t}`).join(" ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
