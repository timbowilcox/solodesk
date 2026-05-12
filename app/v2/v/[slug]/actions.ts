"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runOfficeHours } from "@/lib/agents/loops/office-hours";
import { runAdversarialStrategy } from "@/lib/agents/loops/adversarial-strategy";

const inputSchema = z.object({
  question: z.string().trim().min(10).max(4000),
});

export async function startV2OfficeHoursAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/v2");

  const parsed = inputSchema.safeParse({
    question: formData.get("question"),
  });
  if (!parsed.success) {
    redirect(`/v2/v/${slug}?error=invalid_input`);
  }

  const result = await runOfficeHours({
    ventureSlug: slug,
    question: parsed.data.question,
  });
  if (!result.ok) {
    redirect(
      `/v2/v/${slug}?error=run_failed&message=${encodeURIComponent(result.error)}`,
    );
  }

  void runAdversarialStrategy({
    documentId: result.documentId,
    ventureSlug: slug,
  }).catch((e) => {
    console.error(
      "[v2/office-hours] critic failed",
      e instanceof Error ? e.message : e,
    );
  });

  revalidatePath(`/v2/v/${slug}`);
  revalidatePath(`/v2/v/${slug}/d/${result.documentId}`);
  redirect(`/v2/v/${slug}/d/${result.documentId}?fresh=1`);
}
