import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const LAST_LOGIN_DEBOUNCE_MS = 60 * 60 * 1000;
const lastLoginUpdates = new Map<string, number>();

export type AllowlistEntry = {
  id: string;
  email: string;
  role: "admin" | "member";
  active: boolean;
};

export async function findAllowedUser(
  email: string,
): Promise<AllowlistEntry | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("allowed_users")
    .select("id, email, role, active")
    .eq("email", normalized)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("[allowlist] lookup failed", error);
    return null;
  }
  return data ?? null;
}

export async function isAllowedUser(email: string): Promise<boolean> {
  const entry = await findAllowedUser(email);
  return entry !== null;
}

export async function touchLastLogin(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const now = Date.now();
  const previous = lastLoginUpdates.get(normalized);
  if (previous && now - previous < LAST_LOGIN_DEBOUNCE_MS) return;
  lastLoginUpdates.set(normalized, now);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("allowed_users")
    .update({ last_login: new Date(now).toISOString() })
    .eq("email", normalized);
  if (error) {
    console.error("[allowlist] last_login update failed", error);
  }
}
