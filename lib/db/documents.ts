import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedRow } from "@/lib/memory/embed";
import type {
  DocumentStatus,
  DocumentType,
  Json,
  SectionKind,
  SectionStatus,
  Tables,
  TablesUpdate,
} from "@/lib/supabase/types";

export type DocumentRow = Tables<"documents">;
export type SectionRow = Tables<"sections">;
export type CommentRow = Tables<"comments">;

// --------------------------------------------------------------
// Section content shapes (per kind)
// --------------------------------------------------------------
// The `content` column on `sections` is jsonb; the UI dispatches on `kind`.
// These are the shapes we use when creating sections in code.

export type ProseContent = { text: string };
export type RecommendationContent = {
  text: string;
  confidence?: "low" | "medium" | "high";
};
export type AlternativesContent = { text: string }; // free-form for v1
export type KillCriteriaContent = { text: string };
export type EvidenceContent = {
  text: string;
  items?: Array<{ text: string; source?: string }>;
};
export type RiskContent = {
  text: string;
  severity?: "low" | "medium" | "high";
  mitigation?: string;
};
export type AgentNoteContent = {
  question: string;
  decision: string;
  alternatives?: string;
};

// --------------------------------------------------------------
// Queries
// --------------------------------------------------------------

export async function listDocumentsByVenture(opts: {
  ventureId: string;
  type?: DocumentType;
  status?: DocumentStatus | DocumentStatus[];
  limit?: number;
  offset?: number;
}): Promise<DocumentRow[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("documents")
    .select("*")
    .eq("venture_id", opts.ventureId)
    .order("created_at", { ascending: false });
  if (opts.type) query = query.eq("type", opts.type);
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      query = query.in("status", opts.status);
    } else {
      query = query.eq("status", opts.status);
    }
  }
  query = query.range(
    opts.offset ?? 0,
    (opts.offset ?? 0) + (opts.limit ?? 50) - 1,
  );
  const { data, error } = await query;
  if (error) {
    console.error("[documents] list failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function getDocumentWithSections(opts: {
  documentId: string;
  ventureId: string;
}): Promise<{ document: DocumentRow; sections: SectionRow[] } | null> {
  const supabase = createSupabaseAdminClient();
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", opts.documentId)
    .eq("venture_id", opts.ventureId)
    .maybeSingle();
  if (docError || !doc) return null;
  const { data: sections, error: secError } = await supabase
    .from("sections")
    .select("*")
    .eq("document_id", opts.documentId)
    .order("ord", { ascending: true });
  if (secError) {
    console.error("[documents] section list failed", secError.message);
    return { document: doc, sections: [] };
  }
  return { document: doc, sections: sections ?? [] };
}

export async function listCommentsForSections(
  sectionIds: string[],
): Promise<CommentRow[]> {
  if (sectionIds.length === 0) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .in("section_id", sectionIds)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[documents] comments list failed", error.message);
    return [];
  }
  return data ?? [];
}

// --------------------------------------------------------------
// Mutations
// --------------------------------------------------------------

export type MetricBlockMetric = {
  label: string;
  value: string;
  delta?: string;
  severity?: "positive" | "caution" | "negative" | "neutral";
};
export type MetricBlockContent = { metrics: MetricBlockMetric[] };

export type ContentBlockContent = {
  channel: "email" | "x" | "linkedin" | "blog";
  subject?: string;
  body: string;
  audience?: string;
  cta?: string;
};

export type IntelSignal = {
  source?: string;
  observation: string;
  severity: "low" | "medium" | "high";
  tag: "threat" | "opportunity" | "noise";
  suggested_action:
    | "continue_monitoring"
    | "surface_to_strategy"
    | "kill"
    | "escalate";
  reasoning?: string;
};

export type IntelSignalsTableContent = { signals: IntelSignal[] };

export type SupportReplyBlockContent = {
  subject?: string;
  body: string;
  send_when_approved: boolean;
};

export type SectionSeed =
  | { kind: "prose"; content: ProseContent }
  | { kind: "recommendation"; content: RecommendationContent }
  | { kind: "alternatives"; content: AlternativesContent }
  | { kind: "kill_criteria"; content: KillCriteriaContent }
  | { kind: "evidence"; content: EvidenceContent }
  | { kind: "risk"; content: RiskContent }
  | { kind: "agent_note"; content: AgentNoteContent }
  | { kind: "metric_block"; content: MetricBlockContent }
  | { kind: "content_block"; content: ContentBlockContent }
  | { kind: "intel_signals_table"; content: IntelSignalsTableContent }
  | { kind: "support_reply_block"; content: SupportReplyBlockContent };

export type CreateDocumentInput = {
  ventureId: string;
  type: DocumentType;
  title: string;
  loopName: string;
  sections: SectionSeed[];
  metadata?: Record<string, unknown>;
};

export type CreateDocumentResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

/**
 * Insert a Document with seeded Sections in one transaction-ish flow.
 * Falls back to deleting the document if section inserts fail (best effort —
 * Postgres CASCADE handles the cleanup if the document delete itself works).
 *
 * Fire-and-forget embeddings on each section. The cron is the safety net.
 */
export async function createDocument(
  input: CreateDocumentInput,
): Promise<CreateDocumentResult> {
  if (!input.title.trim()) return { ok: false, error: "title is required" };
  if (input.sections.length === 0) {
    return { ok: false, error: "at least one section is required" };
  }
  const supabase = createSupabaseAdminClient();
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      venture_id: input.ventureId,
      type: input.type,
      title: input.title.trim(),
      loop_name: input.loopName,
      metadata: (input.metadata ?? {}) as Json,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    return { ok: false, error: docError?.message ?? "document insert failed" };
  }
  const documentId = doc.id;

  const sectionsPayload = input.sections.map((s, idx) => ({
    document_id: documentId,
    kind: s.kind as SectionKind,
    ord: idx,
    content: s.content as Json,
  }));
  const { data: insertedSections, error: secError } = await supabase
    .from("sections")
    .insert(sectionsPayload)
    .select("id");
  if (secError || !insertedSections) {
    // Best-effort cleanup
    await supabase.from("documents").delete().eq("id", documentId);
    return { ok: false, error: secError?.message ?? "section insert failed" };
  }

  // Fire-and-forget embeddings
  for (const row of insertedSections) {
    void embedRow("sections", row.id).catch((e: unknown) => {
      console.error(
        "[documents.create] section embed failed (cron will retry)",
        e instanceof Error ? e.message : e,
      );
    });
  }

  return { ok: true, documentId };
}

export async function updateSectionContent(opts: {
  sectionId: string;
  content: Json;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("sections")
    .update({ content: opts.content })
    .eq("id", opts.sectionId);
  if (error) return { ok: false, error: error.message };
  // Embedding text changes via trigger; backlog cron will re-embed.
  return { ok: true };
}

export async function setSectionStatus(opts: {
  sectionId: string;
  status: SectionStatus;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("sections")
    .update({ status: opts.status })
    .eq("id", opts.sectionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setDocumentStatus(opts: {
  documentId: string;
  status: DocumentStatus;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const update: TablesUpdate<"documents"> = { status: opts.status };
  if (opts.status === "approved") {
    update.approved_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("documents")
    .update(update)
    .eq("id", opts.documentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Approve a Decision Document: flip all its sections to `approved`, the
 * document to `approved`, and write a row into the legacy `decisions` table
 * for backwards-compat with the Sprint 0 schema.
 *
 * Returns the new decisions.id on success so the caller can link to it.
 */
export async function approveDecisionDocument(opts: {
  documentId: string;
  ventureId: string;
}): Promise<{ ok: true; decisionId: string } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const ctx = await getDocumentWithSections({
    documentId: opts.documentId,
    ventureId: opts.ventureId,
  });
  if (!ctx) return { ok: false, error: "document not found" };
  if (ctx.document.type !== "decision") {
    return { ok: false, error: "not a Decision Document" };
  }

  // Bulk-approve sections
  await supabase
    .from("sections")
    .update({ status: "approved" })
    .eq("document_id", opts.documentId)
    .neq("status", "rejected");

  // Flip the document
  const docResult = await setDocumentStatus({
    documentId: opts.documentId,
    status: "approved",
  });
  if (!docResult.ok) return docResult;

  // Compose the legacy decisions row from the section content
  const sections = ctx.sections;
  const findKind = (kind: SectionKind) =>
    sections.find((s) => s.kind === kind);
  const recommendation = findKind("recommendation");
  const alternatives = findKind("alternatives");
  const killCriteria = findKind("kill_criteria");
  const recText =
    (recommendation?.content as { text?: string } | null)?.text ?? "";
  const altText =
    (alternatives?.content as { text?: string } | null)?.text ?? null;
  const killText =
    (killCriteria?.content as { text?: string } | null)?.text ?? null;

  const { data: decisionRow, error: decisionError } = await supabase
    .from("decisions")
    .insert({
      venture_id: opts.ventureId,
      title: ctx.document.title,
      recommendation: recText,
      alternatives: altText,
      kill_criteria: killText,
      status: "active",
      generator_agent: ctx.document.loop_name,
      document_id: opts.documentId,
    })
    .select("id")
    .single();
  if (decisionError || !decisionRow) {
    return {
      ok: false,
      error: decisionError?.message ?? "decisions insert failed",
    };
  }

  return { ok: true, decisionId: decisionRow.id as string };
}
