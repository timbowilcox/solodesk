import Link from "next/link";
import { notFound } from "next/navigation";

import { getVentureBySlug } from "@/lib/db/ventures";

import { startOfficeHoursAction } from "./actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `Office hours — ${venture.name} — SoloDesk` };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Question is required (10-4000 characters).",
  run_failed: "Office-hours session failed.",
};

const textareaClass =
  "block w-full border border-rule-strong bg-paper-card px-3 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

export default async function OfficeHoursPage({
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
            href={`/ventures/${slug}`}
            className="text-accent underline-offset-2 hover:underline"
          >
            ← {venture.name}
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          Office hours
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Bring a strategic question for {venture.name}. The session puts it
          through a six-question reframe and produces a draft Decision
          Document. An adversarial critic reviews the draft in a second pass.
        </p>
      </header>

      <form action={startOfficeHoursAction} className="space-y-6">
        <input type="hidden" name="venture_slug" value={slug} />
        <label className="block space-y-1">
          <span className={labelClass}>Question</span>
          <textarea
            name="question"
            required
            minLength={10}
            maxLength={4000}
            rows={8}
            placeholder={
              "Should we ship the new pricing tier this quarter, or wait for the integration partnerships to close first?"
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
              Budget: 50,000 tokens · $1.00 across both passes (generator +
              critic).
            </p>
          )}
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Start session
          </button>
        </div>
      </form>
    </div>
  );
}
