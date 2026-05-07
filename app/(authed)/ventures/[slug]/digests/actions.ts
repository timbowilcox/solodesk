"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { digestDateKey, generateDailyDigest } from "@/lib/db/digests";
import { getVentureBySlug } from "@/lib/db/ventures";

export async function generateTodaysDigestAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const venture = await getVentureBySlug(slug);
  if (!venture) redirect("/ventures");

  const dateKey = digestDateKey();
  const result = await generateDailyDigest({
    ventureId: venture.id,
    ventureName: venture.name,
    dateKey,
  });
  if (!result.ok) {
    redirect(`/ventures/${slug}/digests?error=generate_failed`);
  }

  revalidatePath(`/ventures/${slug}/digests`);
  revalidatePath(`/ventures/${slug}/digests/${dateKey}`);
  redirect(`/ventures/${slug}/digests/${dateKey}`);
}
