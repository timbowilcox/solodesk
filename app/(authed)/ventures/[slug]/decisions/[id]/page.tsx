import Link from "next/link";
import { notFound } from "next/navigation";

import { Document } from "@/components/document/document";
import {
  getDocumentWithSections,
  isApprovableDocumentStatus,
  listCommentsForSections,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";

import { approveDecisionDocumentAction } from "../actions";

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
  return { title: `${ctx.document.title} — Decisions — SoloDesk` };
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "DRAFT", cls: "bg-caution-bg text-caution" },
  reviewing: { label: "REVIEW", cls: "bg-info-bg text-info" },
  approved: { label: "APPROVED", cls: "bg-positive-bg text-positive" },
  rejected: { label: "REJECTED", cls: "bg-negative-bg text-negative" },
  archived: { label: "ARCHIVED", cls: "text-ink-faint" },
};

function formatTs(ts: string | null): string {
  if (!ts) return "—";
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

export default async function DecisionDetailPage({
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
  const justApproved = sParams.approved === "1";
  const fresh = sParams.fresh === "1";
  const error = typeof sParams.error === "string" ? sParams.error : null;

  const badge = STATUS_BADGE[ctx.document.status] ?? {
    label: ctx.document.status.toUpperCase(),
    cls: "text-ink-mute",
  };
  // Loop-generated Decision Documents land in 'reviewing' (runner.ts:255);
  // operator-authored ones land in 'draft'. Both must surface the approve
  // form. The agent_note enforcement guard inside approveDecisionDocument
  // is independent of document.status — it reads section state — so lifting
  // this UI gate does not weaken the bright line.
  const isApprovable = isApprovableDocumentStatus(ctx.document.status);

  return (
    <div className="space-y-10">
      <nav className="flex items-center gap-3 text-xs">
        <Link
          href={`/ventures/${slug}/decisions`}
          className="text-accent underline-offset-2 hover:underline"
        >
          ← Decisions
        </Link>
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-ink-mute">{venture.name}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide ${badge.cls}`}
        >
          {badge.label}
        </span>
      </nav>

      {justApproved && (
        <p className="text-sm text-positive">
          Approved. A row has been written to the decisions table.
        </p>
      )}
      {error === "approve_failed" && (
        <p className="text-sm text-negative">
          Approval failed. Check the logs and try again.
        </p>
      )}

      {fresh && (
        <p className="text-sm text-ink-mute">
          Draft saved. The adversarial critic is reviewing in the background —
          comments may appear on Sections when its pass completes (15-30s).
        </p>
      )}

      <Document
        document={ctx.document}
        sections={ctx.sections}
        comments={comments}
        editable={false}
      />

      <footer className="space-y-4 border-t border-rule pt-6">
        <dl className="grid grid-cols-[140px_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Created
          </dt>
          <dd className="font-mono text-ink-mute">
            {formatTs(ctx.document.created_at)}
          </dd>
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Updated
          </dt>
          <dd className="font-mono text-ink-mute">
            {formatTs(ctx.document.updated_at)}
          </dd>
          {ctx.document.approved_at && (
            <>
              <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
                Approved
              </dt>
              <dd className="font-mono text-ink-mute">
                {formatTs(ctx.document.approved_at)}
              </dd>
            </>
          )}
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Loop
          </dt>
          <dd className="font-mono text-ink-mute">{ctx.document.loop_name}</dd>
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-mute">
            Sections
          </dt>
          <dd className="font-mono text-ink-mute">{ctx.sections.length}</dd>
        </dl>

        {isApprovable && (
          <form
            action={approveDecisionDocumentAction}
            className="flex items-center justify-end gap-3"
          >
            <input type="hidden" name="venture_slug" value={slug} />
            <input type="hidden" name="document_id" value={ctx.document.id} />
            <button
              type="submit"
              className="bg-ink-strong px-4 py-2 text-base font-medium text-paper-card transition-opacity duration-[80ms] hover:opacity-85 active:opacity-70"
            >
              Approve decision
            </button>
          </form>
        )}
      </footer>
    </div>
  );
}
