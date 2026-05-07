import Link from "next/link";
import { notFound } from "next/navigation";

import { Document } from "@/components/document/document";
import { findDigestByDate } from "@/lib/db/digests";
import { getDocumentWithSections } from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";

import { generateTodaysDigestAction } from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; date: string }>;
}) {
  const { slug, date } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  return { title: `${date} digest — ${venture.name} — SoloDesk` };
}

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatDateKey(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    weekday: "long",
  });
}

export default async function DigestDetailPage({
  params,
}: {
  params: Promise<{ slug: string; date: string }>;
}) {
  const { slug, date } = await params;
  if (!DATE_KEY_REGEX.test(date)) notFound();

  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const digest = await findDigestByDate({
    ventureId: venture.id,
    dateKey: date,
  });

  if (!digest) {
    return (
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-xs">
            <Link
              href={`/ventures/${slug}/digests`}
              className="text-accent underline-offset-2 hover:underline"
            >
              ← Digests
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            {formatDateKey(date)}
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            No digest exists for this date.
          </p>
        </header>
        <form action={generateTodaysDigestAction}>
          <input type="hidden" name="venture_slug" value={slug} />
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Generate today
          </button>
        </form>
      </div>
    );
  }

  const ctx = await getDocumentWithSections({
    documentId: digest.id,
    ventureId: venture.id,
  });
  if (!ctx) notFound();

  return (
    <div className="space-y-10">
      <nav className="flex items-center gap-3 text-xs">
        <Link
          href={`/ventures/${slug}/digests`}
          className="text-accent underline-offset-2 hover:underline"
        >
          ← Digests
        </Link>
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-ink-mute">{venture.name}</span>
        <span className="font-mono text-ink-mute">{date}</span>
      </nav>

      <Document
        document={ctx.document}
        sections={ctx.sections}
        editable={false}
      />

      <footer className="border-t border-rule pt-6">
        <dl className="grid grid-cols-[140px_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Loop
          </dt>
          <dd className="font-mono text-ink-mute">{ctx.document.loop_name}</dd>
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Generated
          </dt>
          <dd className="font-mono text-ink-mute">
            {new Date(ctx.document.created_at).toLocaleString("en-AU", {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </dd>
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Sections
          </dt>
          <dd className="font-mono text-ink-mute">{ctx.sections.length}</dd>
        </dl>
      </footer>
    </div>
  );
}
