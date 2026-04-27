import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SignupResult =
  | { id: string; isNew: true }
  | { id: string; isNew: false }
  | { error: string };

export async function upsertWaitlistSignup(
  email: string,
): Promise<SignupResult> {
  const normalized = email.trim().toLowerCase();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("waitlist_signups")
    .insert({ email: normalized, source: "landing" })
    .select("id")
    .maybeSingle();
  if (!error && data) {
    return { id: data.id, isNew: true };
  }
  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await supabase
      .from("waitlist_signups")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (lookupError || !existing) {
      return { error: lookupError?.message ?? "Could not load existing row" };
    }
    return { id: existing.id, isNew: false };
  }
  return { error: error?.message ?? "Insert returned no row" };
}

export async function markWaitlistConfirmed(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("waitlist_signups")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[waitlist] markConfirmed failed", error);
  }
}
