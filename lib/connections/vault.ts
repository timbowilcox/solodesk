import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Vault wrapper. Routes through the public.vault_put/get/rotate/delete
// security-definer functions defined in migration 0005. Direct queries
// against vault.secrets / vault.decrypted_secrets from app code are an
// anti-pattern — go through here.
//
// Payloads are JSON-serialised before storage. The Vault stores text;
// callers work with structured objects via vaultPut(obj) / vaultGet<T>(id).

export async function vaultPut<T extends Record<string, unknown>>(
  payload: T,
  name?: string,
): Promise<string> {
  const json = JSON.stringify(payload);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("vault_put", {
    p_payload: json,
    p_name: name ?? null,
  });
  if (error || !data) {
    throw new Error(`vaultPut failed: ${error?.message ?? "no id returned"}`);
  }
  return data as string;
}

export async function vaultGet<T extends Record<string, unknown>>(
  secretId: string,
): Promise<T> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("vault_get", { p_id: secretId });
  if (error || data == null) {
    throw new Error(`vaultGet failed: ${error?.message ?? "secret missing"}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data as string);
  } catch {
    throw new Error("vaultGet: stored payload is not JSON");
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("vaultGet: stored payload is not an object");
  }
  return parsed as T;
}

export async function vaultRotate<T extends Record<string, unknown>>(
  secretId: string,
  newPayload: T,
): Promise<void> {
  const json = JSON.stringify(newPayload);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("vault_rotate", {
    p_id: secretId,
    p_payload: json,
  });
  if (error) throw new Error(`vaultRotate failed: ${error.message}`);
}

export async function vaultDelete(secretId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("vault_delete", { p_id: secretId });
  if (error) throw new Error(`vaultDelete failed: ${error.message}`);
}
