import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { vaultGet } from "@/lib/connections/vault";
import type { Json } from "@/lib/supabase/types";

// The single accessor every Loop uses to fetch credentials. CLAUDE.md
// bright line: no other code path reads connections.vault_secret_id or
// vault.decrypted_secrets. The audit row lands BEFORE the credential
// returns to the caller — if the audit insert fails, the call fails.

export class NoActiveConnectionError extends Error {
  readonly ventureId: string;
  readonly provider: string;
  constructor(opts: { ventureId: string; provider: string }) {
    super(
      `no active connection for venture=${opts.ventureId} provider=${opts.provider}`,
    );
    this.name = "NoActiveConnectionError";
    this.ventureId = opts.ventureId;
    this.provider = opts.provider;
  }
}

export type GetConnectionInput = {
  ventureId: string;
  provider: string;
  loopRunId: string | null;
  requestSummary: string;
};

export type GetConnectionResult<T extends Record<string, unknown>> = {
  connectionId: string;
  auditId: string;
  credentials: T;
  scopeMetadata: Json;
};

export async function getConnection<T extends Record<string, unknown>>(
  input: GetConnectionInput,
): Promise<GetConnectionResult<T>> {
  if (!input.ventureId) throw new Error("getConnection requires ventureId");
  if (!input.provider) throw new Error("getConnection requires provider");
  if (!input.requestSummary || input.requestSummary.trim().length === 0) {
    throw new Error("getConnection requires requestSummary");
  }

  const supabase = createSupabaseAdminClient();

  // 1. Find the active connection — venture-scoped, hardcoded in the
  // WHERE clause. The DB filter is the bright line, not a TS check.
  const { data: row, error: lookupError } = await supabase
    .from("connections")
    .select("id, vault_secret_id, scope_metadata")
    .eq("venture_id", input.ventureId)
    .eq("provider", input.provider)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`getConnection lookup failed: ${lookupError.message}`);
  }

  if (!row) {
    // No connection_id to anchor an audit row to — log to events instead
    // (the existing append-only surface). Best effort; failure here is
    // logged but doesn't suppress the typed throw.
    void supabase
      .from("events")
      .insert({
        source: "system",
        type: "connection_denied",
        actor: null,
        payload: {
          venture_id: input.ventureId,
          provider: input.provider,
          request_summary: input.requestSummary,
          loop_run_id: input.loopRunId,
          reason: "no_active_connection",
        } as Json,
        hash: null,
      })
      .then(({ error }) => {
        if (error) {
          console.error(
            "[getConnection] denied-event log failed",
            error.message,
          );
        }
      });
    throw new NoActiveConnectionError({
      ventureId: input.ventureId,
      provider: input.provider,
    });
  }

  // 2. Audit FIRST. The contract is "audit before return" — if this
  // insert fails, the credential never leaves the function.
  const { data: auditRow, error: auditError } = await supabase
    .from("connection_audit")
    .insert({
      connection_id: row.id,
      action: "fetched",
      called_by_loop_id: input.loopRunId,
      request_summary: input.requestSummary,
    })
    .select("id")
    .single();
  if (auditError || !auditRow) {
    throw new Error(
      `getConnection audit insert failed: ${auditError?.message ?? "no row"}`,
    );
  }

  // 3. Decrypt and return.
  let credentials: T;
  try {
    credentials = await vaultGet<T>(row.vault_secret_id);
  } catch (e) {
    // The fetch is already audited; record a denied row with reason
    // so the audit trail reflects the actual outcome.
    await supabase.from("connection_audit").insert({
      connection_id: row.id,
      action: "denied",
      called_by_loop_id: input.loopRunId,
      request_summary: `vault_decrypt_failed: ${input.requestSummary}`,
    });
    throw e instanceof Error
      ? e
      : new Error("getConnection vault decrypt failed");
  }

  return {
    connectionId: row.id,
    auditId: auditRow.id,
    credentials,
    scopeMetadata: row.scope_metadata,
  };
}

/**
 * Caller-side helper to record the response status of an external HTTP
 * request the credential was used for. Optional — the audit guarantee is
 * the row created at fetch time. Best effort.
 */
export async function recordConnectionResponse(opts: {
  auditId: string;
  responseStatus: number;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("connection_audit")
    .update({ response_status: opts.responseStatus })
    .eq("id", opts.auditId);
  if (error) {
    console.error(
      "[recordConnectionResponse] failed (audit row already landed; ignoring)",
      error.message,
    );
  }
}
