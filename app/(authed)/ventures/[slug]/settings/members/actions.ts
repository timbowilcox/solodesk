"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminContext } from "@/lib/auth/guard";
import {
  addMember,
  removeMember,
  type VentureMemberRow,
} from "@/lib/auth/membership";
import { getVentureBySlug } from "@/lib/db/ventures";

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["operator", "editor", "viewer"]),
});

export async function addMemberAction(formData: FormData): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const admin = await requireAdminContext();
  const venture = await getVentureBySlug(slug);
  if (!venture) redirect("/ventures");

  const parsed = addSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    redirect(`/ventures/${slug}/settings/members?error=invalid_input`);
  }

  const result = await addMember({
    ventureId: venture.id,
    email: parsed.data.email,
    role: parsed.data.role,
    createdBy: admin.userId,
  });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/settings/members?error=add_failed&message=${encodeURIComponent(result.error)}`,
    );
  }

  revalidatePath(`/ventures/${slug}/settings/members`);
  redirect(`/ventures/${slug}/settings/members?added=1`);
}

const removeSchema = z.object({
  member_id: z.string().uuid(),
}) satisfies z.ZodType<{ member_id: VentureMemberRow["id"] }>;

export async function removeMemberAction(formData: FormData): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  await requireAdminContext();

  const parsed = removeSchema.safeParse({
    member_id: formData.get("member_id"),
  });
  if (!parsed.success) {
    redirect(`/ventures/${slug}/settings/members?error=invalid_input`);
  }

  const result = await removeMember({ memberId: parsed.data.member_id });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/settings/members?error=remove_failed&message=${encodeURIComponent(result.error)}`,
    );
  }

  revalidatePath(`/ventures/${slug}/settings/members`);
  redirect(`/ventures/${slug}/settings/members?removed=1`);
}
