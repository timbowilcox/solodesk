"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createVenture } from "@/lib/db/ventures";
import { indexCompanyMd } from "@/lib/memory/company-md";

const inputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
      message:
        "slug must be lowercase letters, digits, and hyphens (no leading/trailing hyphen)",
    }),
  name: z.string().trim().min(1).max(80),
  phase: z.enum(["discovery", "build", "launch", "scale", "dormant"]),
  north_star: z.string().trim().max(120).optional(),
  company_md: z.string().max(40000).optional(),
});

function encodeError(reason: string, message?: string): string {
  const params = new URLSearchParams({ error: reason });
  if (message) params.set("message", message);
  return params.toString();
}

export async function createVentureAction(formData: FormData): Promise<void> {
  const parsed = inputSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    phase: formData.get("phase"),
    north_star: formData.get("north_star") || undefined,
    company_md: formData.get("company_md") || undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    redirect(
      `/ventures/new?${encodeError("invalid_input", first?.message ?? undefined)}`,
    );
  }

  const result = await createVenture({
    slug: parsed.data.slug,
    name: parsed.data.name,
    phase: parsed.data.phase,
    north_star: parsed.data.north_star ?? null,
    company_md: parsed.data.company_md ?? null,
  });

  if ("error" in result) {
    redirect(`/ventures/new?${encodeError("create_failed", result.error)}`);
  }

  // Fire-and-forget: chunk + embed COMPANY.md if provided. Cron retries
  // anything that fails inline.
  if (parsed.data.company_md) {
    void indexCompanyMd({
      ventureId: result.id,
      companyMd: parsed.data.company_md,
    }).catch((e: unknown) => {
      console.error(
        "[createVentureAction] indexCompanyMd failed (backlog cron will retry)",
        e instanceof Error ? e.message : e,
      );
    });
  }

  revalidatePath("/ventures");
  revalidatePath(`/ventures/${result.slug}`);
  redirect(`/ventures/${result.slug}`);
}
