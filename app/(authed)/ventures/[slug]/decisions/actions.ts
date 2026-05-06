"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  approveDecisionDocument,
  createDocument,
  type SectionSeed,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";

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
