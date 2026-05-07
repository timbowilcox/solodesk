import Link from "next/link";
import { notFound } from "next/navigation";

import { Document } from "@/components/document/document";
import {
  getPortfolioDocumentWithSections,
  listCommentsForSections,
} from "@/lib/db/documents";
import { findPortfolioAuditByDate } from "@/lib/db/portfolio-audit";

import { generatePortfolioAuditAction } from "../actions";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return { title: `Portfolio audit — ${date} — SoloDesk` };
}

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

export default async function PortfolioAuditDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_KEY_REGEX.test(date)) notFound();

  const ref = await findPortfolioAuditByDate(date);
  if (!ref) {
    return (
      <div className="space-y-8">
        <header className="space-y-2">
          <p className="text-xs">
            <Link
              href={`/portfolio`}
              className="text-accent underline-offset-2 hover:underline"
            >
              ← Portfolio
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
            {formatDateKey(date)}
          </h1>
          <div className="h-px w-12 bg-accent opacity-50" />
          <p className="pt-2 text-sm text-ink-mute">
            No portfolio audit exists for this date.
          </p>
        </header>
        <form action={generatePortfolioAuditAction}>
          <button
            type="submit"
            className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
          >
            Run audit now
          </button>
        </form>
      </div>
    );
  }

  const ctx = await getPortfolioDocumentWithSections({ documentId: ref.id });
  if (!ctx) notFound();

  const comments = await listCommentsForSections(ctx.sections.map((s) => s.id));

  return (
    <div className="space-y-10">
      <nav className="flex items-center gap-3 text-xs">
        <Link
          href={`/portfolio`}
          className="text-accent underline-offset-2 hover:underline"
        >
          ← Portfolio
        </Link>
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-ink-mute">{date}</span>
      </nav>

      <Document
        document={ctx.document}
        sections={ctx.sections}
        comments={comments}
        editable={false}
      />
    </div>
  );
}
