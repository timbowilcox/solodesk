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
  return { title: `${ctx.document.title} — Support — SoloDesk` };
}

const CLASSIFICATION_BADGE: Record<string, { label: string; cls: string }> = {
  bug: { label: "BUG", cls: "bg-negative-bg text-negative" },
  question: { label: "QUESTION", cls: "bg-info-bg text-info" },
  churn_risk: { label: "CHURN", cls: "bg-negative-bg text-negative" },
  feature_request: { label: "FEATURE", cls: "bg-positive-bg text-positive" },
  spam: { label: "SPAM", cls: "text-ink-faint" },
  unclear: { label: "UNCLEAR", cls: "bg-caution-bg text-caution" },
};

const URGENCY_BADGE: Record<string, { label: string; cls: string }> = {
  low: { label: "LOW", cls: "text-ink-mute" },
  medium: { label: "MED", cls: "bg-caution-bg text-caution" },
  high: { label: "HIGH", cls: "bg-negative-bg text-negative" },
};

export default async function SupportTicketDetailPage({
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

  const meta = (ctx.document.metadata as
    | {
        classification?: string;
        urgency?: string;
        from_address?: string;
        subject?: string;
        needs_reply?: boolean;
      }
    | null) ?? {};
  const cls = meta.classification ?? "unclear";
  const urgency = meta.urgency ?? "low";
  const cBadge = CLASSIFICATION_BADGE[cls] ?? CLASSIFICATION_BADGE.unclear!;
  const uBadge = URGENCY_BADGE[urgency] ?? URGENCY_BADGE.low!;

  return (
    <div className="space-y-10">
      <nav className="flex items-center flex-wrap gap-3 text-xs">
        <Link
          href={`/ventures/${slug}/support`}
          className="text-accent underline-offset-2 hover:underline"
        >
          ← Support
        </Link>
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-ink-mute">{venture.name}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide ${cBadge.cls}`}
        >
          {cBadge.label}
        </span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide ${uBadge.cls}`}
        >
          {uBadge.label}
        </span>
      </nav>

      {fresh && (
        <p className="text-sm text-ink-mute">
          Ticket triaged. {meta.needs_reply
            ? "The replier ran and produced a draft reply below."
            : "Classifier marked this as not needing a reply."}
        </p>
      )}

      <Document
        document={ctx.document}
        sections={ctx.sections}
        comments={comments}
        editable={false}
      />

      <footer className="space-y-3 border-t border-rule pt-6 text-xs text-ink-mute">
        <p>
          Send is a separate explicit action — no auto-send. Sending the reply
          via Resend through the venture&rsquo;s connection (Sprint 1.3) lands
          in a follow-up. For now, copy the draft and send from your normal
          mail client.
        </p>
      </footer>
    </div>
  );
}
