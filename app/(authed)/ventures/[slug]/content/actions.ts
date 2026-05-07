"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runContentCritic } from "@/lib/agents/loops/content-critic";
import { runContentWriter } from "@/lib/agents/loops/content-writer";

const inputSchema = z.object({
  channel: z.enum(["email", "x", "linkedin", "blog"]),
  brief: z.string().trim().min(10).max(4000),
  audience: z.string().trim().max(200).optional(),
  cta: z.string().trim().max(200).optional(),
});

export async function startContentWriterAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const parsed = inputSchema.safeParse({
    channel: formData.get("channel"),
    brief: formData.get("brief"),
    audience: formData.get("audience") || undefined,
    cta: formData.get("cta") || undefined,
  });
  if (!parsed.success) {
    redirect(`/ventures/${slug}/content/new?error=invalid_input`);
  }

  const result = await runContentWriter({
    ventureSlug: slug,
    channel: parsed.data.channel,
    brief: parsed.data.brief,
    audienceHint: parsed.data.audience,
    ctaHint: parsed.data.cta,
  });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/content/new?error=run_failed&message=${encodeURIComponent(result.error)}`,
    );
  }

  void runContentCritic({
    documentId: result.documentId,
    ventureSlug: slug,
  }).catch((e) => {
    console.error(
      "[content-writer] critic failed (will leave the doc as draft)",
      e instanceof Error ? e.message : e,
    );
  });

  revalidatePath(`/ventures/${slug}/content`);
  revalidatePath(`/ventures/${slug}/content/${result.documentId}`);
  redirect(`/ventures/${slug}/content/${result.documentId}?fresh=1`);
}
