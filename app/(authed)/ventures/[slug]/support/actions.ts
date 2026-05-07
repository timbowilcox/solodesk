"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runSupportTriage } from "@/lib/agents/loops/support-triage";

const inputSchema = z.object({
  from: z.string().trim().email().max(200).optional().or(z.literal("")),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(10).max(20_000),
});

export async function ingestSupportTicketAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const parsed = inputSchema.safeParse({
    from: formData.get("from") || undefined,
    subject: formData.get("subject") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    redirect(`/ventures/${slug}/support/new?error=invalid_input`);
  }

  const result = await runSupportTriage({
    ventureSlug: slug,
    fromAddress: parsed.data.from || undefined,
    subject: parsed.data.subject,
    body: parsed.data.body,
  });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/support/new?error=run_failed&message=${encodeURIComponent(result.error)}`,
    );
  }

  revalidatePath(`/ventures/${slug}/support`);
  revalidatePath(`/ventures/${slug}/support/${result.documentId}`);
  redirect(`/ventures/${slug}/support/${result.documentId}?fresh=1`);
}
