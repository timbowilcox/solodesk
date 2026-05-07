"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runOfficeHours } from "@/lib/agents/loops/office-hours";
import { runAdversarialStrategy } from "@/lib/agents/loops/adversarial-strategy";

const inputSchema = z.object({
  question: z.string().trim().min(10).max(4000),
});

export async function startOfficeHoursAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const parsed = inputSchema.safeParse({
    question: formData.get("question"),
  });
  if (!parsed.success) {
    redirect(`/ventures/${slug}/office-hours?error=invalid_input`);
  }

  const result = await runOfficeHours({
    ventureSlug: slug,
    question: parsed.data.question,
  });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/office-hours?error=run_failed&message=${encodeURIComponent(result.error)}`,
    );
  }

  // Fire the critic in the background — operator can read the document
  // immediately while the critic runs. The detail page will show comments
  // once they land. Don't await — redirects must happen quickly.
  void runAdversarialStrategy({
    documentId: result.documentId,
    ventureSlug: slug,
  }).catch((e) => {
    console.error(
      "[office-hours] critic failed (will leave the doc as draft)",
      e instanceof Error ? e.message : e,
    );
  });

  revalidatePath(`/ventures/${slug}/decisions`);
  revalidatePath(`/ventures/${slug}/decisions/${result.documentId}`);
  redirect(`/ventures/${slug}/decisions/${result.documentId}?fresh=1`);
}
