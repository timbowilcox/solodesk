import Link from "next/link";
import { notFound } from "next/navigation";

import { getVentureBySlug } from "@/lib/db/ventures";

import { ingestSupportTicketAction } from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `Ingest support ticket — ${venture.name} — SoloDesk` };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Body is required (10-20,000 chars). From must be valid email if set.",
  run_failed: "Triage failed.",
};

const inputClass =
  "block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-b-2 focus:border-accent focus:outline-none";

const textareaClass =
  "block w-full border border-rule-strong bg-paper-card px-3 py-2 text-base text-ink outline-none transition-[border-color] duration-[80ms] placeholder:text-ink-faint focus:border-accent focus:outline-none";

const labelClass =
  "block text-xs font-medium uppercase tracking-wide text-ink-mute";

export default async function IngestTicketPage({
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
            href={`/ventures/${slug}/support`}
            className="text-accent underline-offset-2 hover:underline"
          >
            ← Support
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
          Ingest ticket
        </h1>
        <div className="h-px w-12 bg-accent opacity-50" />
        <p className="pt-2 text-sm text-ink-mute">
          Paste an inbound support email. The classifier runs first (haiku);
          if a reply is needed, the replier drafts one (opus). Ticket lands
          as a Support Document for review.
        </p>
      </header>

      <form action={ingestSupportTicketAction} className="space-y-6">
        <input type="hidden" name="venture_slug" value={slug} />

        <div className="grid gap-6 md:grid-cols-2">
          <label className="space-y-1">
            <span className={labelClass}>From (optional)</span>
            <input
              name="from"
              type="email"
              maxLength={200}
              placeholder="customer@example.com"
              className={inputClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Subject (optional)</span>
            <input
              name="subject"
              maxLength={200}
              placeholder="Re: payment failed"
              className={inputClass}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className={labelClass}>Body</span>
          <textarea
            name="body"
            required
            minLength={10}
            maxLength={20_000}
            rows={14}
            placeholder="Paste the customer's full message here."
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
              Budget: ~22,000 tokens · ~$0.45 across both passes (triage on
              haiku + reply on opus when needed).
            </p>
          )}
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Triage ticket
          </button>
        </div>
      </form>
    </div>
  );
}
