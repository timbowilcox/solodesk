"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  approveDecisionDocument,
  createDocument,
  updateSectionContent,
  setSectionStatus,
  type SectionSeed,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const decisionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  context: z.string().trim().max(8_000).optional(),
  recommendation: z.string().trim().min(1).max(8_000),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  alternatives: z.string().trim().max(8_000).optional(),
  kill_criteria: z.string().trim().max(8_000).optional(),
  evidence: z.string().trim().max(8_000).optional(),
  risk: z.string().trim().max(8_000).optional(),
  risk_severity: z.enum(["low", "medium", "high"]).optional(),
  risk_mitigation: z.string().trim().max(8_000).optional(),
});

export async function createDecisionDocumentAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const venture = await getVentureBySlug(slug);
  if (!venture) redirect("/ventures");

  const raw = {
    title: formData.get("title"),
    context: formData.get("context") || undefined,
    recommendation: formData.get("recommendation"),
    confidence: formData.get("confidence") || undefined,
    alternatives: formData.get("alternatives") || undefined,
    kill_criteria: formData.get("kill_criteria") || undefined,
    evidence: formData.get("evidence") || undefined,
    risk: formData.get("risk") || undefined,
    risk_severity: formData.get("risk_severity") || undefined,
    risk_mitigation: formData.get("risk_mitigation") || undefined,
  };
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/ventures/${slug}/decisions/new?error=invalid_input`);
  }
  const d = parsed.data;

  const sections: SectionSeed[] = [];
  if (d.context) {
    sections.push({ kind: "prose", content: { text: d.context } });
  }
  sections.push({
    kind: "recommendation",
    content: {
      text: d.recommendation,
      ...(d.confidence ? { confidence: d.confidence } : {}),
    },
  });
  if (d.evidence) {
    sections.push({ kind: "evidence", content: { text: d.evidence } });
  }
  if (d.risk || d.risk_mitigation) {
    sections.push({
      kind: "risk",
      content: {
        text: d.risk ?? "",
        ...(d.risk_severity ? { severity: d.risk_severity } : {}),
        ...(d.risk_mitigation ? { mitigation: d.risk_mitigation } : {}),
      },
    });
  }
  if (d.alternatives) {
    sections.push({
      kind: "alternatives",
      content: { text: d.alternatives },
    });
  }
  if (d.kill_criteria) {
    sections.push({
      kind: "kill_criteria",
      content: { text: d.kill_criteria },
    });
  }

  const result = await createDocument({
    ventureId: venture.id,
    type: "decision",
    title: d.title,
    loopName: "manual",
    sections,
  });
  if (!result.ok) {
    redirect(`/ventures/${slug}/decisions/new?error=create_failed`);
  }

  revalidatePath(`/ventures/${slug}/decisions`);
  revalidatePath(`/ventures/${slug}/decisions/${result.documentId}`);
  redirect(`/ventures/${slug}/decisions/${result.documentId}`);
}

export async function approveDecisionDocumentAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const docIdRaw = formData.get("document_id");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  const documentId = typeof docIdRaw === "string" ? docIdRaw : "";
  if (!slug || !documentId) redirect("/ventures");

  const venture = await getVentureBySlug(slug);
  if (!venture) redirect("/ventures");

  const result = await approveDecisionDocument({
    documentId,
    ventureId: venture.id,
  });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/decisions/${documentId}?error=approve_failed`,
    );
  }

  revalidatePath(`/ventures/${slug}/decisions`);
  revalidatePath(`/ventures/${slug}/decisions/${documentId}`);
  redirect(`/ventures/${slug}/decisions/${documentId}?approved=1`);
}

const resolveSchema = z.object({
  venture_slug: z.string().trim().min(1),
  document_id: z.string().uuid(),
  section_id: z.string().uuid(),
  action_type: z.enum(["confirm", "revise", "defer"]),
  decision_text: z.string().trim().max(4_000).optional(),
});

/**
 * Resolve an agent_note Section: Confirm, Revise, or Defer.
 *
 * Confirm — writes content.decision = content.assumption (operator agrees with
 *   the agent's call). Flips section status to 'approved'.
 * Revise  — writes content.decision = operator's own text. Flips to 'approved'.
 * Defer   — flips section status to 'deferred', increments content.defer_count.
 *   Document stays in reviewing/draft; the section will re-surface at next briefing.
 */
export async function resolveAgentNoteAction(formData: FormData): Promise<void> {
  const parsed = resolveSchema.safeParse({
    venture_slug: formData.get("venture_slug"),
    document_id: formData.get("document_id"),
    section_id: formData.get("section_id"),
    action_type: formData.get("action_type"),
    decision_text: formData.get("decision_text") || undefined,
  });
  if (!parsed.success) return;
  const { venture_slug, document_id, section_id, action_type, decision_text } =
    parsed.data;

  const venture = await getVentureBySlug(venture_slug);
  if (!venture) return;

  const supabase = createSupabaseAdminClient();

  // Fetch the section to read current content
  const { data: sectionRow, error: secError } = await supabase
    .from("sections")
    .select("content, status")
    .eq("id", section_id)
    .eq("document_id", document_id)
    .maybeSingle();
  if (secError || !sectionRow) return;

  const content = (sectionRow.content ?? {}) as Record<string, unknown>;

  if (action_type === "confirm") {
    const assumption =
      typeof content.assumption === "string" ? content.assumption : "";
    await updateSectionContent({
      sectionId: section_id,
      content: { ...content, decision: assumption } as Json,
    });
    await setSectionStatus({ sectionId: section_id, status: "approved" });
  } else if (action_type === "revise" && decision_text) {
    await updateSectionContent({
      sectionId: section_id,
      content: { ...content, decision: decision_text } as Json,
    });
    await setSectionStatus({ sectionId: section_id, status: "approved" });
  } else if (action_type === "defer") {
    const deferCount =
      typeof content.defer_count === "number" ? content.defer_count + 1 : 1;
    await updateSectionContent({
      sectionId: section_id,
      content: { ...content, defer_count: deferCount } as Json,
    });
    await setSectionStatus({ sectionId: section_id, status: "deferred" });
  }

  revalidatePath(`/ventures/${venture_slug}/decisions/${document_id}`);
}
