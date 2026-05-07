import Link from "next/link";
import { notFound } from "next/navigation";

import { getVentureBySlug } from "@/lib/db/ventures";

import { startIntelScoutAction } from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `New intel scan — ${venture.name} — SoloDesk` };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Observations are required (20-20,000 chars).",
  run_failed: "Intel scan failed.",
};

const textareaClass =
  "block w-full border border-rule-strong bg-paper-card px-3 py-2 font-mono text-sm text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

export default async function NewIntelScanPage({
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
  const message = typeof sParams.message === "string" ? sParams.message : null;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs">
          <Link
            href={`/ventures/${slug}/intel`}
            className="text-accent underline-offset-2 hover:underline"
          >
            ← Intel
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          New intel scan
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Paste raw observations from your sources — competitor moves, X
          posts, Reddit threads, team-chat summaries, screenshots-as-text. One
          item per paragraph or per line. The scout triages; the critic kills
          noise.
        </p>
      </header>

      <form action={startIntelScoutAction} className="space-y-6">
        <input type="hidden" name="venture_slug" value={slug} />
        <label className="block space-y-1">
          <span className={labelClass}>Observations</span>
          <textarea
            name="observations"
            required
            minLength={20}
            maxLength={20_000}
            rows={20}
            placeholder={
              "Competitor X launched feature Y on 2026-05-04 — link\n\nSeen on HN: thread about Z (link)\n\nFrom team chat 2026-05-05: customer A asked about B"
            }
            className={textareaClass}
          />
        </label>
        <div className="flex items-center justify-between pt-2">
          {error ? (
            <p className="text-sm text-negative">
              {ERROR_MESSAGES[error] ?? "Something went wrong."}
              {message ? ` — ${message}` : ""}
            </p>
          ) : (
            <p className="text-xs text-ink-mute">
              Budget: 45,000 tokens · $1.20 across both passes (scout + critic).
            </p>
          )}
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Run scout
          </button>
        </div>
      </form>
    </div>
  );
}
