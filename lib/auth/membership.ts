import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findAllowedUser } from "@/lib/auth/allowlist";
import type { Tables, VentureMemberRole } from "@/lib/supabase/types";

export type VentureMemberRow = Tables<"venture_members">;

export type UserContext = {
  userId: string;
  email: string;
  role: "admin" | "member";
  isAdmin: boolean;
};

export async function getUserContextByEmail(
  email: string,
): Promise<UserContext | null> {
  const entry = await findAllowedUser(email);
  if (!entry) return null;
  return {
    userId: entry.id,
    email: entry.email,
    role: entry.role,
    isAdmin: entry.role === "admin",
  };
}

/**
 * Returns the ventures the user can see. For admins, returns "all" (encoded
 * as `null`) — callers can short-circuit the venture filter. For members,
 * returns an explicit list of venture_ids and slugs from venture_members.
 */
export async function listVisibleVentures(opts: {
  userId: string;
  isAdmin: boolean;
}): Promise<{
  isAdmin: boolean;
  ventureIds: string[] | null;
}> {
  if (opts.isAdmin) return { isAdmin: true, ventureIds: null };
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("venture_members")
    .select("venture_id")
    .eq("user_id", opts.userId);
  if (error) {
    console.error("[membership] listVisibleVentures failed", error.message);
    return { isAdmin: false, ventureIds: [] };
  }
  return {
    isAdmin: false,
    ventureIds: (data ?? []).map((r) => r.venture_id),
  };
}

/**
 * Hard rule: this is the single canonical "can this user see this venture"
 * check. Admin → yes. Member → only if a venture_members row exists.
 * Cross-venture leakage prevention hinges on this returning false correctly.
 */
export async function canAccessVenture(opts: {
  userId: string;
  isAdmin: boolean;
  ventureId: string;
}): Promise<boolean> {
  if (opts.isAdmin) return true;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("venture_members")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("venture_id", opts.ventureId)
    .maybeSingle();
  if (error) {
    console.error("[membership] canAccessVenture failed", error.message);
    return false;
  }
  return !!data;
}

export type MemberWithUser = {
  id: string;
  venture_id: string;
  user_id: string;
  role: VentureMemberRole;
  created_at: string;
  email: string;
  user_role: "admin" | "member";
};

export async function listMembersForVenture(
  ventureId: string,
): Promise<MemberWithUser[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("venture_members")
    .select("id, venture_id, user_id, role, created_at")
    .eq("venture_id", ventureId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[membership] listMembersForVenture failed", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  // Pull user records in one round-trip
  const userIds = data.map((r) => r.user_id);
  const { data: users, error: uErr } = await supabase
    .from("allowed_users")
    .select("id, email, role")
    .in("id", userIds);
  if (uErr || !users) {
    console.error("[membership] users join failed", uErr?.message);
    return [];
  }
  const byId = new Map(users.map((u) => [u.id, u] as const));

  const out: MemberWithUser[] = [];
  for (const row of data) {
    const u = byId.get(row.user_id);
    if (!u) continue;
    out.push({
      id: row.id,
      venture_id: row.venture_id,
      user_id: row.user_id,
      role: row.role,
      created_at: row.created_at,
      email: u.email,
      user_role: u.role,
    });
  }
  return out;
}

export type AddMemberInput = {
  ventureId: string;
  email: string;
  role: VentureMemberRole;
  createdBy: string;
};

export type AddMemberResult =
  | { ok: true; memberId: string }
  | { ok: false; error: string };

/**
 * Add a teammate to a venture. The teammate's email must already be in
 * allowed_users (their account must exist). This is a deliberate
 * design — team inbound doesn't create accounts; it only assigns
 * already-allowed users to ventures.
 */
export async function addMember(
  input: AddMemberInput,
): Promise<AddMemberResult> {
  const supabase = createSupabaseAdminClient();
  const entry = await findAllowedUser(input.email);
  if (!entry) {
    return {
      ok: false,
      error: "user not in allowed_users — invite them first via SQL",
    };
  }
  const { data, error } = await supabase
    .from("venture_members")
    .insert({
      venture_id: input.ventureId,
      user_id: entry.id,
      role: input.role,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "already a member of this venture" };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "no row returned" };
  return { ok: true, memberId: data.id };
}

export async function removeMember(opts: {
  memberId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("venture_members")
    .delete()
    .eq("id", opts.memberId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
