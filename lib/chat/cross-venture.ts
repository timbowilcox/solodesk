import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VOYAGE_DIMENSIONS, VOYAGE_MODEL } from "@/lib/memory/embed";
import { callVoyage, isVoyageError } from "@/lib/memory/voyage";
import { listVentures } from "@/lib/db/ventures";

export type CrossVentureHit = {
  ventureId: string;
  ventureName: string;
  ventureSlug: string;
  table: string;
  id: string;
  text: string;
  similarity: number;
  ts: string;
};

export type CrossVentureChatResult =
  | {
      ok: true;
      answer: string;
      hits: CrossVentureHit[];
      ventureSources: string[]; // slugs of ventures referenced
    }
  | { ok: false; error: string };

export type CrossVentureSearchResult =
  | { ok: true; hits: CrossVentureHit[] }
  | { ok: false; error: string };

const K_PER_VENTURE = 3;
const MIN_SIMILARITY = 0.45;
const MAX_TOTAL_HITS = 12;

export async function runCrossVentureChat(opts: {
  query: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<CrossVentureChatResult> {
  if (!opts.query.trim()) {
    return { ok: false, error: "query is required" };
  }

  // 1. Embed the query
  const voyageResult = await callVoyage({
    input: [opts.query],
    model: VOYAGE_MODEL,
    inputType: "query",
  });
  if (isVoyageError(voyageResult)) {
    return { ok: false, error: `embedding failed: ${voyageResult.error}` };
  }
  const queryEmbedding = voyageResult.data[0]?.embedding;
  if (!queryEmbedding || queryEmbedding.length !== VOYAGE_DIMENSIONS) {
    return { ok: false, error: "embedding dimension mismatch" };
  }

  // 2. Fetch all accessible ventures
  const ventures = await listVentures();
  if (ventures.length === 0) {
    return { ok: false, error: "no ventures found" };
  }

  // 3. Query pgvector across all ventures for decisions + venture_chunks
  const supabase = createSupabaseAdminClient();
  const allHits: CrossVentureHit[] = [];

  for (const venture of ventures) {
    for (const rpc of ["match_decisions", "match_venture_chunks"] as const) {
      const { data, error } = await supabase.rpc(rpc, {
        p_venture_id: venture.id,
        p_query: queryEmbedding,
        p_min_similarity: MIN_SIMILARITY,
        p_limit: K_PER_VENTURE,
      });
      if (error || !Array.isArray(data)) continue;
      for (const row of data) {
        const r = row as {
          id: string;
          ts: string;
          text: string;
          similarity: number;
        };
        allHits.push({
          ventureId: venture.id,
          ventureName: venture.name,
          ventureSlug: venture.slug,
          table: rpc === "match_decisions" ? "decisions" : "venture_chunks",
          id: r.id,
          text: r.text,
          similarity: r.similarity,
          ts: r.ts,
        });
      }
    }
  }

  // 4. Sort and take top hits
  allHits.sort((a, b) => b.similarity - a.similarity);
  const topHits = allHits.slice(0, MAX_TOTAL_HITS);

  if (topHits.length === 0) {
    return {
      ok: true,
      answer:
        "No relevant context found across your ventures for that query. Try a different phrasing or check if decisions have been indexed.",
      hits: [],
      ventureSources: [],
    };
  }

  // 5. Build context string
  const contextLines = topHits.map(
    (h, i) =>
      `[${i + 1}] ${h.ventureName} (${h.table}) — ${h.text.slice(0, 400)}`,
  );
  const contextBlock = contextLines.join("\n\n");

  // 6. Call Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "REPLACE_ME") {
    return { ok: false, error: "ANTHROPIC_API_KEY not configured" };
  }
  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are a cross-portfolio analyst for SoloDesk. The operator runs multiple ventures and is asking a strategic question across all of them.

You have been given semantic search results from decisions and company context across the venture portfolio. Use these to answer the question accurately.

Rules:
- Reference specific ventures by name when citing context
- Use citation numbers [1], [2], etc. when referencing the provided context
- Be specific and factual — don't invent information
- If the context doesn't contain enough to answer, say so directly
- Keep your answer under 400 words

Context:
${contextBlock}`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...(opts.conversationHistory ?? []),
    { role: "user", content: opts.query },
  ];

  let answer: string;
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
    answer =
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("") || "No response generated.";
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "anthropic call failed",
    };
  }

  const ventureSources = [...new Set(topHits.map((h) => h.ventureSlug))];

  return { ok: true, answer, hits: topHits, ventureSources };
}

/**
 * Search-only variant — embeds query, runs pgvector search, returns hits
 * without any LLM call. Used for the /v2/recall page.
 */
export async function crossVentureSearch(opts: {
  query: string;
}): Promise<CrossVentureSearchResult> {
  if (!opts.query.trim()) {
    return { ok: false, error: "query is required" };
  }

  const voyageResult = await callVoyage({
    input: [opts.query],
    model: VOYAGE_MODEL,
    inputType: "query",
  });
  if (isVoyageError(voyageResult)) {
    return { ok: false, error: `embedding failed: ${voyageResult.error}` };
  }
  const queryEmbedding = voyageResult.data[0]?.embedding;
  if (!queryEmbedding || queryEmbedding.length !== VOYAGE_DIMENSIONS) {
    return { ok: false, error: "embedding dimension mismatch" };
  }

  const ventures = await listVentures();
  const supabase = createSupabaseAdminClient();
  const allHits: CrossVentureHit[] = [];

  for (const venture of ventures) {
    for (const rpc of [
      "match_decisions",
      "match_memories",
      "match_venture_chunks",
    ] as const) {
      const { data, error } = await supabase.rpc(rpc, {
        p_venture_id: venture.id,
        p_query: queryEmbedding,
        p_min_similarity: MIN_SIMILARITY,
        p_limit: K_PER_VENTURE,
      });
      if (error || !Array.isArray(data)) continue;
      for (const row of data) {
        const r = row as {
          id: string;
          ts: string;
          text: string;
          similarity: number;
        };
        allHits.push({
          ventureId: venture.id,
          ventureName: venture.name,
          ventureSlug: venture.slug,
          table: rpc.replace("match_", ""),
          id: r.id,
          text: r.text,
          similarity: r.similarity,
          ts: r.ts,
        });
      }
    }
  }

  allHits.sort((a, b) => b.similarity - a.similarity);
  return { ok: true, hits: allHits.slice(0, MAX_TOTAL_HITS) };
}
