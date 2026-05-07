import "server-only";

// Loop 8 anomaly deduplication helpers.
//
// Multiple triggers (webhook burst, manual + threshold racing, etc.) can
// land in the same anomaly bucket. Loop 8 looks up a fingerprint before
// invoking the runner; if a recent fingerprint exists, the trigger is
// dropped and no Document is created.
//
// Bright line: fingerprints are venture-scoped via the unique
// (venture_id, fingerprint) constraint. Cross-venture fingerprints can
// never collide.
//
// Pure helpers (computeFingerprint) live alongside DB calls
// (shouldDedup, recordFingerprint) for ergonomics. Pure ones are easily
// unit-tested; DB ones run in the runner.

import { createHash } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AnomalyFingerprintSource,
  Json,
} from "@/lib/supabase/types";

const DEDUP_WINDOW_HOURS = 1;

export type FingerprintInput = {
  ventureId: string;
  metricKind: string; // e.g. 'mrr', 'invoice_paid', 'subscription_deleted'
  /** ISO date used to bucket. Defaults to today's date in UTC. */
  bucketDate?: string;
};

/**
 * Compute the SHA-256 hex fingerprint for an anomaly. Pure: same input
 * always returns the same fingerprint.
 */
export function computeFingerprint(input: FingerprintInput): string {
  const date =
    input.bucketDate ?? new Date().toISOString().slice(0, 10);
  const seed = `${input.ventureId}:${input.metricKind}:${date}`;
  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Check whether an anomaly with this fingerprint has already been
 * recorded for the venture within the dedup window. Returns true if
 * Loop 8 should suppress the trigger.
 */
export async function shouldDedup(opts: {
  ventureId: string;
  fingerprint: string;
  withinHours?: number;
}): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(
    Date.now() - (opts.withinHours ?? DEDUP_WINDOW_HOURS) * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabase
    .from("anomaly_fingerprints")
    .select("id")
    .eq("venture_id", opts.ventureId)
    .eq("fingerprint", opts.fingerprint)
    .gte("created_at", cutoff)
    .maybeSingle();
  if (error) {
    console.error("[loop8.dedup] shouldDedup query failed", error.message);
    return false; // fail open: better to produce a duplicate than miss
  }
  return !!data;
}

/**
 * Record a fingerprint after Loop 8 has produced (or attempted to
 * produce) a Document. Use the unique constraint to ignore races: the
 * second concurrent insert raises 23505 and we treat that as success.
 */
export async function recordFingerprint(opts: {
  ventureId: string;
  fingerprint: string;
  documentId: string | null;
  source: AnomalyFingerprintSource;
  payload: Json;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("anomaly_fingerprints").insert({
    venture_id: opts.ventureId,
    fingerprint: opts.fingerprint,
    document_id: opts.documentId,
    source: opts.source,
    payload: opts.payload,
  });
  if (error && error.code !== "23505") {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
