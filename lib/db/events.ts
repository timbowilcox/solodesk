import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables, TablesInsert } from "@/lib/supabase/types";

export type EventRow = Tables<"events">;

export type EventWithVenture = EventRow & {
  venture: { slug: string; name: string } | null;
};

export async function listRecentEvents(options: {
  ventureId?: string;
  limit?: number;
  offset?: number;
}): Promise<EventWithVenture[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("events")
    .select("*, venture:ventures(slug, name)")
    .order("ts", { ascending: false })
    .range(offset, offset + limit - 1);
  if (options.ventureId) {
    query = query.eq("venture_id", options.ventureId);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[events] listRecentEvents failed", error);
    return [];
  }
  return (data ?? []) as unknown as EventWithVenture[];
}

export async function insertEvent(
  row: TablesInsert<"events">,
): Promise<{ id: string } | { duplicate: true } | { error: string }> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("events")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { duplicate: true };
    console.error("[events] insert failed", error);
    return { error: error.message };
  }
  if (!data) return { error: "no row returned" };
  return { id: data.id };
}

export type ManualEventInput = {
  source: string;
  type: string;
  ventureSlug: string | null;
  actor: string | null;
  payload: Json;
};

export async function insertManualEvent(input: ManualEventInput) {
  const supabase = createSupabaseAdminClient();
  let ventureId: string | null = null;
  if (input.ventureSlug) {
    const { data } = await supabase
      .from("ventures")
      .select("id")
      .eq("slug", input.ventureSlug)
      .maybeSingle();
    ventureId = data?.id ?? null;
  }
  return insertEvent({
    source: input.source,
    type: input.type,
    venture_id: ventureId,
    actor: input.actor,
    payload: input.payload,
  });
}
