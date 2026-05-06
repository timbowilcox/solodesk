import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedRow } from "@/lib/memory/embed";

export type MemoryRow = {
  id: string;
  venture_id: string | null;
  ts: string;
  source: string;
  text: string;
  tags: string[];
  embedded_at: string | null;
  metadata: Record<string, unknown>;
};

export async function listMemoriesForVenture(opts: {
  ventureId: string;
  limit?: number;
  offset?: number;
}): Promise<MemoryRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("memories")
    .select("id, venture_id, ts, source, text, tags, embedded_at, metadata")
    .eq("venture_id", opts.ventureId)
    .order("ts", { ascending: false })
    .range(
      opts.offset ?? 0,
      (opts.offset ?? 0) + (opts.limit ?? 50) - 1,
    );

  if (error) {
    console.error("[memories.list] failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    venture_id: row.venture_id,
    ts: row.ts,
    source: row.source,
    text: row.text,
    tags: row.tags ?? [],
    embedded_at: row.embedded_at,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  }));
}

export type CreateMemoryInput = {
  ventureId: string;
  text: string;
  tags?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
};

export type CreateMemoryResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Insert a memory and fire-and-forget embedding. Failure to embed inline
 * doesn't block the user write — the 5-minute backlog cron will pick it up.
 */
export async function createMemory(
  input: CreateMemoryInput,
): Promise<CreateMemoryResult> {
  const text = input.text.trim();
  if (text.length === 0) return { ok: false, error: "text is required" };
  if (text.length > 8_000) return { ok: false, error: "text is too long" };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("memories")
    .insert({
      venture_id: input.ventureId,
      source: input.source ?? "manual",
      text,
      tags: input.tags ?? [],
      metadata: (input.metadata ?? {}) as never,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }

  // Fire-and-forget. Cron is the safety net.
  void embedRow("memories", data.id).catch((e: unknown) => {
    console.error(
      "[memories.create] embed failed (cron will retry)",
      e instanceof Error ? e.message : e,
    );
  });

  return { ok: true, id: data.id };
}
