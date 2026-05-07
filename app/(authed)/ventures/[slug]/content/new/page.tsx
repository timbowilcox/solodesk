import Link from "next/link";
import { notFound } from "next/navigation";

import { getVentureBySlug } from "@/lib/db/ventures";

import { startContentWriterAction } from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `New content brief — ${venture.name} — SoloDesk` };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Channel and brief are required (brief 10-4000 chars).",
  run_failed: "Content draft generation failed.",
};

const inputClass =
  "block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none";

const textareaClass =
  "block w-full border border-rule-strong bg-paper-card px-3 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

export default async function NewContentBriefPage({
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
            href={`/ventures/${slug}/content`}
            className="text-accent underline-offset-2 hover:underline"
          >
            ← Content
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          New brief
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Brief in, draft out. The content-writer agent reads {venture.name}
          &rsquo;s COMPANY.md voice rules; the content-critic reviews against
          rubric + anti-patterns.
        </p>
      </header>

      <form action={startContentWriterAction} className="space-y-6">
        <input type="hidden" name="venture_slug" value={slug} />

        <div className="grid gap-6 md:grid-cols-2">
          <label className="space-y-1">
            <span className={labelClass}>Channel</span>
            <select name="channel" required defaultValue="email" className={inputClass}>
              <option value="email">email</option>
              <option value="x">x</option>
              <option value="linkedin">linkedin</option>
              <option value="blog">blog</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Audience hint (optional)</span>
            <input
              name="audience"
              maxLength={200}
              placeholder="Existing customers; founders running 2+ ventures"
              className={inputClass}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>CTA hint (optional)</span>
          <input
            name="cta"
            maxLength={200}
            placeholder="Reply if interested; book a call; click through to docs"
            className={inputClass}
          />
        </label>

        <label className="block space-y-1">
          <span className={labelClass}>Brief</span>
          <textarea
            name="brief"
            required
            minLength={10}
            maxLength={4000}
            rows={10}
            placeholder={
              "What you want to say, why now, what the audience should take away. The agent will adopt the voice from COMPANY.md."
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
              Budget: 30,000 tokens · $0.60 across both passes (writer +
              critic).
            </p>
          )}
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Draft it
          </button>
        </div>
      </form>
    </div>
  );
}
