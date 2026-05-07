import Link from "next/link";
import { notFound } from "next/navigation";

import { Document } from "@/components/document/document";
import {
  getDocumentWithSections,
  listCommentsForSections,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) return { title: "Not found — SoloDesk" };
  const ctx = await getDocumentWithSections({
    documentId: id,
    ventureId: venture.id,
  });
  if (!ctx) return { title: "Not found — SoloDesk" };
  return { title: `${ctx.document.title} — Content — SoloDesk` };
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "DRAFT", cls: "bg-caution-bg text-caution" },
  reviewing: { label: "REVIEW", cls: "bg-info-bg text-info" },
  approved: { label: "APPROVED", cls: "bg-positive-bg text-positive" },
  published: { label: "PUBLISHED", cls: "bg-positive-bg text-positive" },
  archived: { label: "ARCHIVED", cls: "text-ink-faint" },
};

export default async function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();

  const ctx = await getDocumentWithSections({
    documentId: id,
    ventureId: venture.id,
  });
  if (!ctx) notFound();

  const comments = await listCommentsForSections(ctx.sections.map((s) => s.id));
  const sParams = await searchParams;
  const fresh = sParams.fresh === "1";

  const badge = STATUS_BADGE[ctx.document.status] ?? {
    label: ctx.document.status.toUpperCase(),
    cls: "text-ink-mute",
  };

  return (
    <div className="space-y-10">
      <nav className="flex items-center gap-3 text-xs">
        <Link
          href={`/ventures/${slug}/content`}
          className="text-accent underline-offset-2 hover:underline"
        >
          ← Content
        </Link>
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-ink-mute">{venture.name}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide ${badge.cls}`}
        >
          {badge.label}
        </span>
      </nav>

      {fresh && (
        <p className="text-sm text-ink-mute">
          Draft saved. The content-critic is reviewing in the background —
          comments may appear on the draft Section when its pass completes.
        </p>
      )}

      <Document
        document={ctx.document}
        sections={ctx.sections}
        comments={comments}
        editable={false}
      />

      <footer className="space-y-4 border-t border-rule pt-6">
        <p className="text-xs text-ink-mute">
          Send is a separate explicit action — no auto-send. Email channels
          will hit Resend through the venture&rsquo;s connection (Sprint 1.3);
          social channels copy to clipboard. Send action lands in a follow-up.
        </p>
      </footer>
    </div>
  );
}
