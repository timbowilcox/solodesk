import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Tables, TablesInsert } from "@/lib/supabase/types";

export type VentureRow = Tables<"ventures">;

export async function listVentures(): Promise<VentureRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ventures")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[ventures] list failed", error);
    return [];
  }
  return data ?? [];
}

export async function getVentureBySlug(
  slug: string,
): Promise<VentureRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ventures")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[ventures] getBySlug failed", error);
    return null;
  }
  return data ?? null;
}

export async function createVenture(
  input: TablesInsert<"ventures">,
): Promise<{ slug: string } | { error: string }> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ventures")
    .insert(input)
    .select("slug")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { error: "Slug already exists" };
    console.error("[ventures] create failed", error);
    return { error: error.message };
  }
  if (!data) return { error: "no row returned" };
  return { slug: data.slug };
}
