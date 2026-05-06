"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createMemory } from "@/lib/db/memories";
import { getVentureBySlug } from "@/lib/db/ventures";

const memorySchema = z.object({
  text: z.string().trim().min(1).max(8_000),
  tags: z.string().optional(),
});

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 32)
    .slice(0, 12);
}

export async function createMemoryAction(formData: FormData): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const venture = await getVentureBySlug(slug);
  if (!venture) redirect("/ventures");

  const parsed = memorySchema.safeParse({
    text: formData.get("text"),
    tags: formData.get("tags"),
  });
  if (!parsed.success) {
    redirect(`/ventures/${slug}/memories?error=invalid_input`);
  }

  const result = await createMemory({
    ventureId: venture.id,
    text: parsed.data.text,
    tags: parseTags(parsed.data.tags),
  });
  if (!result.ok) {
    redirect(`/ventures/${slug}/memories?error=insert_failed`);
  }

  revalidatePath(`/ventures/${slug}/memories`);
  redirect(`/ventures/${slug}/memories?created=${result.id.slice(0, 8)}`);
}
