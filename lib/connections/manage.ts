import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { vaultPut, vaultRotate } from "@/lib/connections/vault";
import type { Json, Tables } from "@/lib/supabase/types";

export type ConnectionRow = Tables<"connections">;

// --------------------------------------------------------------
// Provider slug whitelist. Adding new providers is a code change,
// not a runtime decision. Keeps the venture settings dropdown
// stable and prevents typo'd slugs scattered through audit rows.
// --------------------------------------------------------------

export const KNOWN_PROVIDERS = [
  "stripe",
  "resend",
  "vercel",
  "github",
  "plausible",
  "mixpanel",
  "netsuite",
  "twilio",
  "webflow",
] as const;

export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

export function isKnownProvider(p: string): p is KnownProvider {
  return (KNOWN_PROVIDERS as readonly string[]).includes(p);
}

// --------------------------------------------------------------
// Mutations — server actions call these through the settings UI
// --------------------------------------------------------------

export type CreateConnectionInput<T extends Record<string, unknown>> = {
  ventureId: string;
  provider: KnownProvider;
  displayName: string;
  credentials: T;
  scopeMetadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type CreateConnectionResult =
  | { ok: true; connectionId: string }
  | { ok: false; error: string };

export async function createConnection<T extends Record<string, unknown>>(
  input: CreateConnectionInput<T>,
): Promise<CreateConnectionResult> {
  if (!isKnownProvider(input.provider)) {
    return { ok: false, error: `unknown provider: ${input.provider}` };
  }
  if (input.displayName.trim().length === 0) {
    return { ok: false, error: "display_name is required" };
  }

  let secretId: string;
  try {
    secretId = await vaultPut(
      input.credentials,
      `solodesk:${input.provider}:${input.displayName}`,
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "vault put failed",
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("connections")
    .insert({
      venture_id: input.ventureId,
      provider: input.provider,
      display_name: input.displayName.trim(),
      vault_secret_id: secretId,
      scope_metadata: (input.scopeMetadata ?? {}) as Json,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "connection insert failed",
    };
  }

  await supabase.from("connection_audit").insert({
    connection_id: data.id,
    action: "created",
    request_summary: `created ${input.provider} connection "${input.displayName.trim()}"`,
  });

  return { ok: true, connectionId: data.id };
}

export type RotateConnectionInput<T extends Record<string, unknown>> = {
  connectionId: string;
  newCredentials: T;
};

export async function rotateConnection<T extends Record<string, unknown>>(
  input: RotateConnectionInput<T>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const { data: row, error: lookupError } = await supabase
    .from("connections")
    .select("id, vault_secret_id, revoked_at")
    .eq("id", input.connectionId)
    .maybeSingle();
  if (lookupError || !row) {
    return {
      ok: false,
      error: lookupError?.message ?? "connection not found",
    };
  }
  if (row.revoked_at) {
    return { ok: false, error: "connection is revoked" };
  }

  try {
    await vaultRotate(row.vault_secret_id, input.newCredentials);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "vault rotate failed",
    };
  }

  await supabase.from("connection_audit").insert({
    connection_id: row.id,
    action: "rotated",
    request_summary: "credential rotated",
  });

  return { ok: true };
}

export async function revokeConnection(opts: {
  connectionId: string;
  reason?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const { data: row, error: updateError } = await supabase
    .from("connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", opts.connectionId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, error: updateError.message };
  if (!row) {
    return { ok: false, error: "connection not found or already revoked" };
  }

  await supabase.from("connection_audit").insert({
    connection_id: opts.connectionId,
    action: "revoked",
    request_summary: opts.reason ?? "revoked via settings UI",
  });
  return { ok: true };
}

// --------------------------------------------------------------
// Queries (UI / inventory only — never returns vault payloads)
// --------------------------------------------------------------

export async function listConnectionsForVenture(opts: {
  ventureId: string;
  includeRevoked?: boolean;
}): Promise<ConnectionRow[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("connections")
    .select("*")
    .eq("venture_id", opts.ventureId)
    .order("created_at", { ascending: false });
  if (!opts.includeRevoked) {
    query = query.is("revoked_at", null);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[connections] list failed", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Loop 11 / portfolio-audit accessor. Returns presence + scope_metadata
 * across the entire portfolio without touching credentials. Loop 11 is
 * the deliberate exception to "no cross-venture context"; this accessor
 * is the safe path for it.
 */
export async function getConnectionInventory(): Promise<
  Array<{
    venture_id: string;
    provider: string;
    display_name: string;
    scope_metadata: Json;
    revoked_at: string | null;
  }>
> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("connections")
    .select("venture_id, provider, display_name, scope_metadata, revoked_at")
    .order("venture_id", { ascending: true });
  if (error) {
    console.error("[connections] inventory failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    venture_id: row.venture_id,
    provider: row.provider,
    display_name: row.display_name,
    scope_metadata: row.scope_metadata,
    revoked_at: row.revoked_at,
  }));
}

export async function listAuditForConnection(opts: {
  connectionId: string;
  limit?: number;
}): Promise<Tables<"connection_audit">[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("connection_audit")
    .select("*")
    .eq("connection_id", opts.connectionId)
    .order("called_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (error) {
    console.error("[connections] audit list failed", error.message);
    return [];
  }
  return data ?? [];
}
