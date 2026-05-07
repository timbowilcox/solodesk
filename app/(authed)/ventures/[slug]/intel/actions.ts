"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runIntelCritic } from "@/lib/agents/loops/intel-critic";
import { runIntelScout } from "@/lib/agents/loops/intel-scout";

const inputSchema = z.object({
  observations: z.string().trim().min(20).max(20_000),
});

export async function startIntelScoutAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const parsed = inputSchema.safeParse({
    observations: formData.get("observations"),
  });
  if (!parsed.success) {
    redirect(`/ventures/${slug}/intel/new?error=invalid_input`);
  }

  const result = await runIntelScout({
    ventureSlug: slug,
    observations: parsed.data.observations,
  });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/intel/new?error=run_failed&message=${encodeURIComponent(result.error)}`,
    );
  }

  void runIntelCritic({
    documentId: result.documentId,
    ventureSlug: slug,
  }).catch((e) => {
    console.error(
      "[intel-scout] critic failed",
      e instanceof Error ? e.message : e,
    );
  });

  revalidatePath(`/ventures/${slug}/intel`);
  revalidatePath(`/ventures/${slug}/intel/${result.documentId}`);
  redirect(`/ventures/${slug}/intel/${result.documentId}?fresh=1`);
}
