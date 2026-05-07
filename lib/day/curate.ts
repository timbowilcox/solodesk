// curate.ts — pure derivation of The Day from raw DB rows.
//
// Single responsibility: take typed input arrays (documents, agent_note
// sections, anomalies, support_tickets) plus the dismissal set, and
// return a prioritized, capped list of items the operator must see.
//
// No DB calls. Tests live at tests/lib/day/curate.test.ts.
//
// Bright line: this function never reads venture_id from anywhere except
// the rows it's been handed. The CALLER is responsible for filtering
// rows to visible ventures. That seam is deliberate — the curator can
// never widen the set.
//
// Sprint 8 caveat: documents.status='reviewing' is read as the
// pending-review state. Schema doesn't have a literal 'pending_review'
// status; 'reviewing' is its synonym in the current enum.

import type { VentureMarkSlug } from "@/lib/supabase/types";

// ---- Input types (subset of full DB rows — only the fields curate uses) ----

export type DocumentInput = {
  id: string;
  venture_id: string;
  type: string;
  title: string;
  status: string;
  loop_name: string;
  created_at: string;
  updated_at: string;
};

export type AgentNoteSectionInput = {
  id: string;
  document_id: string;
  document_venture_id: string; // joined from documents
  document_title: string;
  status: string;
  created_at: string;
  question: string | null; // from content jsonb
};

export type AnomalyInput = {
  id: string;
  venture_id: string;
  metric_name: string;
  severity: "low" | "medium" | "high" | null;
  status: string;
  ts: string;
};

export type SupportTicketInput = {
  id: string;
  venture_id: string;
  subject: string | null;
  classification: string | null;
  status: string;
  ts: string;
};

export type DismissalInput = {
  item_type: DayItemKind;
  item_id: string;
};

export type VentureMetaInput = {
  venture_id: string;
  slug: string;
  name: string;
  accent_color: string;
  mark_slug: VentureMarkSlug;
};

// ---- Output type ----

export type DayItemKind =
  | "document"
  | "agent_note"
  | "anomaly"
  | "support_ticket";

export type DayItem = {
  kind: DayItemKind;
  id: string;
  ventureId: string;
  ventureName: string;
  ventureAccent: string;
  ventureMarkSlug: VentureMarkSlug;
  ventureSlug: string;
  title: string;
  source: string; // e.g. "Decision · 2 days old"
  href: string; // where the operator goes when they click the title
  priority: number; // lower = higher priority
  dismissed: boolean;
  ts: string; // canonical timestamp for sort tiebreaks
};

export type CurateInput = {
  documents: DocumentInput[];
  agentNoteSections: AgentNoteSectionInput[];
  anomalies: AnomalyInput[];
  supportTickets: SupportTicketInput[];
  dismissals: DismissalInput[];
  ventures: VentureMetaInput[];
  /** Cap on returned items. Defaults to 30. */
  limit?: number;
  /** Reference time for "stale" calculations. Defaults to new Date(). */
  now?: Date;
};

const PRIORITY = {
  document: 1,
  agent_note: 2,
  anomaly: 3,
  support_ticket: 4,
} as const;

const STALE_DECISION_DAYS = 3;
const ANOMALY_RECENCY_HOURS = 24;

/**
 * Derive The Day from raw DB rows. Pure function — same input, same output.
 */
export function curateDay(input: CurateInput): DayItem[] {
  const limit = input.limit ?? 30;
  const now = input.now ?? new Date();
  const ventureById = new Map(input.ventures.map((v) => [v.venture_id, v]));
  const dismissed = new Set(
    input.dismissals.map((d) => `${d.item_type}:${d.item_id}`),
  );

  const items: DayItem[] = [];

  // ---- Documents in pending review (status='reviewing') ----
  for (const d of input.documents) {
    const v = ventureById.get(d.venture_id);
    if (!v) continue;
    if (d.status === "reviewing") {
      items.push({
        kind: "document",
        id: d.id,
        ventureId: d.venture_id,
        ventureName: v.name,
        ventureAccent: v.accent_color,
        ventureMarkSlug: v.mark_slug,
        ventureSlug: v.slug,
        title: d.title,
        source: `${capitalise(d.type)} · in review`,
        href: hrefForDocument(v.slug, d.type, d.id),
        priority: PRIORITY.document,
        dismissed: dismissed.has(`document:${d.id}`),
        ts: d.updated_at,
      });
    } else if (
      d.status === "draft" &&
      d.type === "decision" &&
      ageInDays(d.created_at, now) >= STALE_DECISION_DAYS
    ) {
      const days = Math.floor(ageInDays(d.created_at, now));
      items.push({
        kind: "document",
        id: d.id,
        ventureId: d.venture_id,
        ventureName: v.name,
        ventureAccent: v.accent_color,
        ventureMarkSlug: v.mark_slug,
        ventureSlug: v.slug,
        title: d.title,
        source: `Decision · ${days} day${days === 1 ? "" : "s"} old`,
        href: hrefForDocument(v.slug, d.type, d.id),
        priority: PRIORITY.document,
        dismissed: dismissed.has(`document:${d.id}`),
        ts: d.created_at,
      });
    }
  }

  // ---- Open agent_note sections ----
  for (const s of input.agentNoteSections) {
    const v = ventureById.get(s.document_venture_id);
    if (!v) continue;
    if (s.status === "approved" || s.status === "dismissed") continue;
    items.push({
      kind: "agent_note",
      id: s.id,
      ventureId: s.document_venture_id,
      ventureName: v.name,
      ventureAccent: v.accent_color,
      ventureMarkSlug: v.mark_slug,
      ventureSlug: v.slug,
      title: s.question ?? `Critic note on ${s.document_title}`,
      source: `Agent note · ${s.document_title}`,
      href: `/ventures/${v.slug}/decisions/${s.document_id}#section-${s.id}`,
      priority: PRIORITY.agent_note,
      dismissed: dismissed.has(`agent_note:${s.id}`),
      ts: s.created_at,
    });
  }

  // ---- Recent open anomalies ----
  for (const a of input.anomalies) {
    const v = ventureById.get(a.venture_id);
    if (!v) continue;
    if (a.status !== "open" && a.status !== "investigating") continue;
    if (ageInHours(a.ts, now) > ANOMALY_RECENCY_HOURS) continue;
    items.push({
      kind: "anomaly",
      id: a.id,
      ventureId: a.venture_id,
      ventureName: v.name,
      ventureAccent: v.accent_color,
      ventureMarkSlug: v.mark_slug,
      ventureSlug: v.slug,
      title: `${capitalise(a.metric_name)} anomaly`,
      source: `Anomaly · ${a.severity ?? "low"}`,
      href: `/ventures/${v.slug}/digests`,
      priority: PRIORITY.anomaly,
      dismissed: dismissed.has(`anomaly:${a.id}`),
      ts: a.ts,
    });
  }

  // ---- New support tickets (inbound surface in v0) ----
  for (const t of input.supportTickets) {
    const v = ventureById.get(t.venture_id);
    if (!v) continue;
    if (t.status !== "new" && t.status !== "classified") continue;
    items.push({
      kind: "support_ticket",
      id: t.id,
      ventureId: t.venture_id,
      ventureName: v.name,
      ventureAccent: v.accent_color,
      ventureMarkSlug: v.mark_slug,
      ventureSlug: v.slug,
      title: t.subject ?? "(no subject)",
      source: `Support · ${t.classification ?? "unclassified"}`,
      href: `/ventures/${v.slug}/support/${t.id}`,
      priority: PRIORITY.support_ticket,
      dismissed: dismissed.has(`support_ticket:${t.id}`),
      ts: t.ts,
    });
  }

  // Sort: priority asc, then ts desc (newest first within priority bucket).
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.ts.localeCompare(a.ts);
  });

  return items.slice(0, limit);
}

// ---- helpers ----

function ageInDays(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (now.getTime() - then) / (1000 * 60 * 60 * 24);
}

function ageInHours(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (now.getTime() - then) / (1000 * 60 * 60);
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hrefForDocument(
  ventureSlug: string,
  docType: string,
  docId: string,
): string {
  switch (docType) {
    case "decision":
      return `/ventures/${ventureSlug}/decisions/${docId}`;
    case "content":
      return `/ventures/${ventureSlug}/content/${docId}`;
    case "intel_digest":
      return `/ventures/${ventureSlug}/intel/${docId}`;
    case "support_ticket":
      return `/ventures/${ventureSlug}/support/${docId}`;
    case "daily_digest":
      return `/ventures/${ventureSlug}/digests`;
    default:
      return `/ventures/${ventureSlug}`;
  }
}
