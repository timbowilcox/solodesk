import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { callVoyage, isVoyageError } from "@/lib/memory/voyage";

// Voyage model lock — `voyage-3` at 1024 dimensions. Documented in CLAUDE.md
// and migration 0002. Changing dimensions later means a full reembed across
// every row, so this constant is load-bearing.
export const VOYAGE_MODEL = "voyage-3" as const;
export const VOYAGE_DIMENSIONS = 1024 as const;
export const VOYAGE_MAX_BATCH = 128;

const APPROX_INPUT_PRICE_PER_M_TOKENS_CENTS = 6; // voyage-3 input ~$0.06 / 1M tokens

export type EmbeddableTable =
  | "decisions"
  | "artifacts"
  | "memories"
  | "venture_chunks"
  | "sections";

export type SendResult =
  | { ok: true; vectors: number[][]; tokensUsed: number }
  | { ok: false; error: string };

/**
 * Embed a single text. Returns the 1024-dim vector. Throws on failure.
 * Prefer embedBatch for >1 input — single calls are wasteful at our volume.
 */
export async function embedText(text: string): Promise<number[]> {
  const result = await embedBatch([text]);
  if (!result.ok) throw new Error(result.error);
  const vector = result.vectors[0];
  if (!vector || vector.length !== VOYAGE_DIMENSIONS) {
    throw new Error(
      `Voyage returned ${vector?.length ?? 0} dims, expected ${VOYAGE_DIMENSIONS}`,
    );
  }
  return vector;
}

/**
 * Batch-embed up to VOYAGE_MAX_BATCH inputs in one Voyage call.
 * Returns vectors in the same order as inputs.
 */
export async function embedBatch(texts: string[]): Promise<SendResult> {
  if (texts.length === 0) {
    return { ok: true, vectors: [], tokensUsed: 0 };
  }
  if (texts.length > VOYAGE_MAX_BATCH) {
    return {
      ok: false,
      error: `batch size ${texts.length} exceeds ${VOYAGE_MAX_BATCH}`,
    };
  }

  const result = await callVoyage({
    input: texts,
    model: VOYAGE_MODEL,
    inputType: "document",
  });
  if (isVoyageError(result)) return { ok: false, error: result.error };
  if (result.data.length !== texts.length) {
    return {
      ok: false,
      error: `Voyage returned ${result.data.length} embeddings for ${texts.length} inputs`,
    };
  }
  const vectors: number[][] = [];
  for (const item of result.data) {
    if (item.embedding.length !== VOYAGE_DIMENSIONS) {
      return {
        ok: false,
        error: `Voyage returned wrong dimensions (${item.embedding.length})`,
      };
    }
    vectors.push(item.embedding);
  }
  return { ok: true, vectors, tokensUsed: result.totalTokens };
}

function pickEmbeddingTextColumn(table: EmbeddableTable): string {
  // decisions/artifacts/sections have a generated `embedding_text` column
  // populated by triggers. memories use their own `text`; venture_chunks
  // use `text` too.
  if (table === "decisions" || table === "artifacts" || table === "sections") {
    return "embedding_text";
  }
  return "text";
}

/**
 * Embed one row by id. Reads the source text, calls Voyage, writes back the
 * vector + embedded_at. Idempotent — safe to retry; checks `embedding is null`
 * before doing work and uses a conditional update to avoid clobbering.
 */
export async function embedRow(
  table: EmbeddableTable,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const textCol = pickEmbeddingTextColumn(table);

  const { data: row, error: fetchError } = await supabase
    .from(table)
    .select(`id, embedding, ${textCol}`)
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!row) return { ok: false, error: `${table} ${id} not found` };

  const r = row as unknown as Record<string, unknown>;
  if (r["embedding"] != null) return { ok: true }; // already embedded

  const text = r[textCol];
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: `${table} ${id} has no embeddable text` };
  }

  const result = await embedBatch([text]);
  if (!result.ok) return { ok: false, error: result.error };

  const vector = result.vectors[0];
  if (!vector) return { ok: false, error: "Voyage returned no vector" };

  const { error: updateError } = await supabase
    .from(table)
    .update({ embedding: vector, embedded_at: new Date().toISOString() })
    .eq("id", id)
    .is("embedding", null);

  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}

/**
 * Process the embedding_backlog view in oldest-first order, batched.
 * Logs cost to loop_runs as `loop_name='memory:embed'`. Returns counts.
 */
export async function processBacklog(
  limit = 50,
): Promise<{ processed: number; failed: number }> {
  const supabase = createSupabaseAdminClient();
  const startedAt = Date.now();

  const { data: backlog, error: backlogError } = await supabase
    .from("embedding_backlog")
    .select("table_name, id, text, ts")
    .order("ts", { ascending: true })
    .limit(limit);

  if (backlogError || !backlog || backlog.length === 0) {
    return { processed: 0, failed: 0 };
  }

  // Group by table so updates target the right destination
  type Item = { table: EmbeddableTable; id: string; text: string };
  const items: Item[] = [];
  for (const row of backlog) {
    if (typeof row.text !== "string" || row.text.trim().length === 0) continue;
    items.push({ table: row.table_name, id: row.id, text: row.text });
  }
  if (items.length === 0) return { processed: 0, failed: 0 };

  // Voyage batch size limit
  const chunks: Item[][] = [];
  for (let i = 0; i < items.length; i += VOYAGE_MAX_BATCH) {
    chunks.push(items.slice(i, i + VOYAGE_MAX_BATCH));
  }

  let processed = 0;
  let failed = 0;
  let totalTokens = 0;
  let firstError: string | null = null;

  for (const chunk of chunks) {
    const result = await embedBatch(chunk.map((i) => i.text));
    if (!result.ok) {
      failed += chunk.length;
      firstError ??= result.error;
      // Log the failure as events for backlog visibility
      for (const item of chunk) {
        await supabase.from("events").insert({
          source: "system",
          type: "embedding_failed",
          actor: null,
          payload: { table: item.table, id: item.id, error: result.error },
          hash: null,
        });
      }
      continue;
    }
    totalTokens += result.tokensUsed;
    for (let i = 0; i < chunk.length; i++) {
      const item = chunk[i];
      const vector = result.vectors[i];
      if (!item || !vector) {
        failed += 1;
        continue;
      }
      const { error: updateError } = await supabase
        .from(item.table)
        .update({ embedding: vector, embedded_at: new Date().toISOString() })
        .eq("id", item.id)
        .is("embedding", null);
      if (updateError) {
        failed += 1;
        firstError ??= updateError.message;
      } else {
        processed += 1;
      }
    }
  }

  // Cost log
  const cents = Math.ceil(
    (totalTokens * APPROX_INPUT_PRICE_PER_M_TOKENS_CENTS) / 1_000_000,
  );
  await supabase.from("loop_runs").insert({
    loop_name: "memory:embed",
    venture_id: null,
    trigger: "backlog",
    input: { batch_size: items.length, chunks: chunks.length },
    status: failed === items.length ? "failed" : "succeeded",
    tokens_in: totalTokens,
    tokens_out: 0,
    cost_cents: cents,
    duration_ms: Date.now() - startedAt,
    budget_tokens: null,
    budget_cents: null,
    model: VOYAGE_MODEL,
    error_message: firstError,
  });

  return { processed, failed };
}
