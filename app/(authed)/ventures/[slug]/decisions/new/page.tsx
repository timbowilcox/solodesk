import Link from "next/link";
import { notFound } from "next/navigation";

import { getVentureBySlug } from "@/lib/db/ventures";

import { createDecisionDocumentAction } from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `New decision — ${venture.name} — SoloDesk` };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Title and recommendation are required.",
  create_failed: "Saving failed. Check the logs.",
};

const inputClass =
  "block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none";

const textareaClass =
  "block w-full border border-rule-strong bg-paper-card px-3 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

export default async function NewDecisionPage({
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

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs">
          <Link
            href={`/ventures/${slug}/decisions`}
            className="text-accent underline-offset-2 hover:underline"
          >
            ← Decisions
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          New decision
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Decision document for {venture.name}. Saves as a draft you can
          review and approve.
        </p>
      </header>

      <form action={createDecisionDocumentAction} className="space-y-8">
        <input type="hidden" name="venture_slug" value={slug} />

        <label className="block space-y-1">
          <span className={labelClass}>Title</span>
          <input
            name="title"
            required
            maxLength={160}
            placeholder="One-line summary"
            className={inputClass}
          />
        </label>

        <label className="block space-y-1">
          <span className={labelClass}>Context (optional)</span>
          <textarea
            name="context"
            rows={3}
            placeholder="What this decision is about. Background and framing."
            className={textareaClass}
          />
        </label>

        <fieldset className="space-y-3">
          <legend className={labelClass}>Recommendation</legend>
          <textarea
            name="recommendation"
            required
            rows={4}
            placeholder="The claim. What you're recommending and why."
            className={textareaClass}
          />
          <label className="flex items-baseline gap-3">
            <span className={labelClass}>Confidence</span>
            <select
              name="confidence"
              defaultValue=""
              className="border-0 border-b border-rule-strong bg-transparent px-0 py-1 text-base text-ink outline-none focus:border-b-2 focus:border-accent"
            >
              <option value="">— unset —</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </fieldset>

        <label className="block space-y-1">
          <span className={labelClass}>Evidence (optional)</span>
          <textarea
            name="evidence"
            rows={3}
            placeholder="Supporting reasons, citations, prior decisions."
            className={textareaClass}
          />
        </label>

        <fieldset className="space-y-3">
          <legend className={labelClass}>Risk (optional)</legend>
          <textarea
            name="risk"
            rows={3}
            placeholder="What could go wrong."
            className={textareaClass}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>Severity</span>
              <select
                name="risk_severity"
                defaultValue=""
                className="border-0 border-b border-rule-strong bg-transparent px-0 py-1 text-base text-ink outline-none focus:border-b-2 focus:border-accent"
              >
                <option value="">— unset —</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Mitigation</span>
              <input
                name="risk_mitigation"
                maxLength={500}
                placeholder="How to reduce or avoid"
                className={inputClass}
              />
            </label>
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className={labelClass}>Alternatives (optional)</span>
          <textarea
            name="alternatives"
            rows={3}
            placeholder="What was considered. Why each was rejected."
            className={textareaClass}
          />
        </label>

        <label className="block space-y-1">
          <span className={labelClass}>Kill criteria (optional)</span>
          <textarea
            name="kill_criteria"
            rows={2}
            placeholder="Conditions under which to abandon this decision."
            className={textareaClass}
          />
        </label>

        <div className="flex items-center justify-between pt-4">
          {error ? (
            <p className="text-sm text-negative">
              {ERROR_MESSAGES[error] ?? "Something went wrong."}
            </p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}
