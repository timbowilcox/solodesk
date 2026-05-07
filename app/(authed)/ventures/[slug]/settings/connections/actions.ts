"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { findAllowedUser } from "@/lib/auth/allowlist";
import {
  createConnection,
  isKnownProvider,
  revokeConnection,
  KNOWN_PROVIDERS,
} from "@/lib/connections/manage";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const entry = await findAllowedUser(user.email);
  if (!entry || entry.role !== "admin") return null;
  return { id: entry.id };
}

const providerSchema = z.enum(
  KNOWN_PROVIDERS as readonly [string, ...string[]],
);

const createSchema = z.object({
  provider: providerSchema,
  display_name: z.string().trim().min(1).max(80),
  credentials_json: z.string().trim().min(2).max(10_000),
  scope_metadata_json: z.string().trim().max(10_000).optional(),
});

const revokeSchema = z.object({
  connection_id: z.string().uuid(),
  reason: z.string().trim().max(200).optional(),
});

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function createConnectionAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const admin = await requireAdmin();
  if (!admin) redirect(`/ventures/${slug}/settings/connections?error=forbidden`);

  const venture = await getVentureBySlug(slug);
  if (!venture) redirect("/ventures");

  const parsed = createSchema.safeParse({
    provider: formData.get("provider"),
    display_name: formData.get("display_name"),
    credentials_json: formData.get("credentials_json"),
    scope_metadata_json: formData.get("scope_metadata_json") || undefined,
  });
  if (!parsed.success) {
    redirect(
      `/ventures/${slug}/settings/connections?error=invalid_input`,
    );
  }
  const d = parsed.data;
  if (!isKnownProvider(d.provider)) {
    redirect(`/ventures/${slug}/settings/connections?error=invalid_provider`);
  }

  const credentials = parseJsonObject(d.credentials_json);
  if (!credentials) {
    redirect(`/ventures/${slug}/settings/connections?error=invalid_credentials_json`);
  }
  let scopeMetadata: Record<string, unknown> = {};
  if (d.scope_metadata_json) {
    const parsedScope = parseJsonObject(d.scope_metadata_json);
    if (!parsedScope) {
      redirect(`/ventures/${slug}/settings/connections?error=invalid_scope_json`);
    }
    scopeMetadata = parsedScope;
  }

  const result = await createConnection({
    ventureId: venture.id,
    provider: d.provider,
    displayName: d.display_name,
    credentials,
    scopeMetadata,
    createdBy: admin.id,
  });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/settings/connections?error=create_failed&message=${encodeURIComponent(result.error)}`,
    );
  }

  revalidatePath(`/ventures/${slug}/settings/connections`);
  redirect(
    `/ventures/${slug}/settings/connections?created=${result.connectionId.slice(0, 8)}`,
  );
}

export async function revokeConnectionAction(
  formData: FormData,
): Promise<void> {
  const slugRaw = formData.get("venture_slug");
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!slug) redirect("/ventures");

  const admin = await requireAdmin();
  if (!admin) redirect(`/ventures/${slug}/settings/connections?error=forbidden`);

  const parsed = revokeSchema.safeParse({
    connection_id: formData.get("connection_id"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    redirect(`/ventures/${slug}/settings/connections?error=invalid_input`);
  }

  const result = await revokeConnection({
    connectionId: parsed.data.connection_id,
    reason: parsed.data.reason ?? null,
  });
  if (!result.ok) {
    redirect(
      `/ventures/${slug}/settings/connections?error=revoke_failed&message=${encodeURIComponent(result.error)}`,
    );
  }
  revalidatePath(`/ventures/${slug}/settings/connections`);
  redirect(`/ventures/${slug}/settings/connections?revoked=1`);
}
