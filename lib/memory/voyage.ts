import "server-only";

// Tiny Voyage API wrapper. The official SDK has un-extensioned ESM imports
// that don't resolve cleanly under Next 16's Turbopack. The Voyage embeddings
// endpoint is one POST — not worth fighting the SDK for.
//
// Docs: https://docs.voyageai.com/reference/embeddings-api

const API_URL = "https://api.voyageai.com/v1/embeddings";

export type VoyageInputType = "document" | "query";

export type VoyageRequest = {
  input: string[];
  model: string;
  inputType: VoyageInputType;
};

export type VoyageEmbedding = {
  embedding: number[];
  index: number;
};

export type VoyageResponse = {
  data: VoyageEmbedding[];
  totalTokens: number;
  model: string;
};

export type VoyageError = { error: string };

export type VoyageResult = VoyageResponse | VoyageError;

export function isVoyageError(r: VoyageResult): r is VoyageError {
  return "error" in r;
}

export async function callVoyage(
  req: VoyageRequest,
  apiKeyOverride?: string,
): Promise<VoyageResult> {
  const apiKey = apiKeyOverride ?? process.env.VOYAGE_API_KEY;
  if (!apiKey || apiKey === "REPLACE_ME") {
    return { error: "VOYAGE_API_KEY is not configured" };
  }
  if (req.input.length === 0) {
    return { data: [], totalTokens: 0, model: req.model };
  }

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: req.input,
        model: req.model,
        input_type: req.inputType,
      }),
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "voyage fetch failed",
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      error: `Voyage HTTP ${response.status}: ${body.slice(0, 500)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "voyage response not JSON",
    };
  }
  const p = parsed as {
    data?: Array<{ embedding?: number[]; index?: number }>;
    usage?: { total_tokens?: number };
    model?: string;
  };
  if (!p.data) return { error: "voyage response missing data field" };

  const data: VoyageEmbedding[] = [];
  for (const item of p.data) {
    if (!item.embedding) return { error: "voyage row missing embedding" };
    data.push({ embedding: item.embedding, index: item.index ?? data.length });
  }
  return {
    data,
    totalTokens: p.usage?.total_tokens ?? 0,
    model: p.model ?? req.model,
  };
}
