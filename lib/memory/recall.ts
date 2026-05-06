import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VOYAGE_DIMENSIONS, VOYAGE_MODEL } from "@/lib/memory/embed";
import { callVoyage, isVoyageError } from "@/lib/memory/voyage";

export type RecallSurface =
  | "decisions"
  | "artifacts"
  | "memories"
  | "venture_chunks";

export type MemoryHit = {
  table: RecallSurface;
  id: string;
  text: string;
  similarity: number;
  ts: string;
  metadata: Record<string, unknown>;
};

export type RecallContextOptions = {
  ventureId: string;
  query: string;
  k?: number;
  types?: RecallSurface[];
  minSimilarity?: number;
};

const DEFAULT_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.5;
const DEFAULT_TYPES: RecallSurface[] = [
  "decisions",
  "artifacts",
  "memories",
  "venture_chunks",
];

type RpcName =
  | "match_decisions"
  | "match_artifacts"
  | "match_memories"
  | "match_venture_chunks";

const RPC_BY_TABLE: Record<RecallSurface, RpcName> = {
  decisions: "match_decisions",
  artifacts: "match_artifacts",
  memories: "match_memories",
  venture_chunks: "match_venture_chunks",
};

async function embedQuery(query: string): Promise<number[]> {
  const result = await callVoyage({
    input: [query],
    model: VOYAGE_MODEL,
    inputType: "query", // asymmetric retrieval — important
  });
  if (isVoyageError(result)) throw new Error(result.error);
  const embedding = result.data[0]?.embedding;
  if (!embedding || embedding.length !== VOYAGE_DIMENSIONS) {
    throw new Error(
      `Voyage returned ${embedding?.length ?? 0} dims, expected ${VOYAGE_DIMENSIONS}`,
    );
  }
  return embedding;
}

/**
 * Semantic recall hard-scoped to one venture. Embeds the query, runs
 * cosine-similarity search per requested table via the migration's RPC
 * helpers (`match_<table>`), merges, sorts, returns top k.
 *
 * Hard rule: ventureId is required. Cross-venture recall is impossible
 * by construction — the SQL functions filter by venture_id at the
 * database layer.
 */
export async function recallContext(
  opts: RecallContextOptions,
): Promise<MemoryHit[]> {
  const k = opts.k ?? DEFAULT_K;
  const minSimilarity = opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const types = opts.types ?? DEFAULT_TYPES;

  if (!opts.ventureId) {
    throw new Error("recallContext requires ventureId");
  }
  if (!opts.query.trim()) return [];

  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();
  const queryEmbedding = await embedQuery(opts.query);

  const allHits: MemoryHit[] = [];
  for (const table of types) {
    const rpc = RPC_BY_TABLE[table];
    const { data, error } = await supabase.rpc(rpc, {
      p_venture_id: opts.ventureId,
      p_query: queryEmbedding,
      p_min_similarity: minSimilarity,
      p_limit: k,
    });
    if (error) {
      // Soft fail per surface so one bad table doesn't sink the whole call.
      console.error(`[recallContext] ${table} rpc failed`, error.message);
      continue;
    }
    if (!Array.isArray(data)) continue;
    for (const row of data) {
      const r = row as {
        id: string;
        ts: string;
        text: string;
        similarity: number;
        metadata: Record<string, unknown> | null;
      };
      allHits.push({
        table,
        id: r.id,
        text: r.text,
        similarity: r.similarity,
        ts: r.ts,
        metadata: r.metadata ?? {},
      });
    }
  }

  allHits.sort((a, b) => b.similarity - a.similarity);
  const topK = allHits.slice(0, k);

  // Observability — every recall logs to loop_runs
  await supabase.from("loop_runs").insert({
    loop_name: "memory:recall",
    venture_id: opts.ventureId,
    trigger: "recall",
    input: {
      query: opts.query.slice(0, 200),
      k,
      types,
      minSimilarity,
    },
    status: "succeeded",
    tokens_in: Math.ceil(opts.query.length / 4),
    tokens_out: 0,
    cost_cents: 0,
    duration_ms: Date.now() - startedAt,
    budget_tokens: null,
    budget_cents: null,
    model: VOYAGE_MODEL,
    error_message: null,
  });

  return topK;
}
