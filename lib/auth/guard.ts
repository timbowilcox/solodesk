import "server-only";

import { notFound, redirect } from "next/navigation";

import {
  canAccessVenture,
  getUserContextByEmail,
  listVisibleVentures,
  type UserContext,
} from "@/lib/auth/membership";
import { getVentureBySlug, type VentureRow } from "@/lib/db/ventures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Single canonical entry point for "current user is allowed here" checks
 * inside server components. Returns the user context or redirects.
 *
 * Uses createSupabaseServerClient (cookie-aware) — the proxy already
 * gates on auth.users + allowed_users; this helper layers on the
 * membership check.
 */
export async function requireUserContext(): Promise<UserContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const ctx = await getUserContextByEmail(user.email);
  if (!ctx) redirect("/login?error=not_invited");
  return ctx;
}

/**
 * Page-level guard for per-venture routes. Verifies the user can see this
 * venture (admin OR explicit venture_members entry) and returns both the
 * user context and the venture row. notFound() on miss to avoid leaking
 * "this venture exists but you can't see it".
 */
export async function requireVentureAccess(slug: string): Promise<{
  user: UserContext;
  venture: VentureRow;
}> {
  const user = await requireUserContext();
  const venture = await getVentureBySlug(slug);
  if (!venture) notFound();
  const allowed = await canAccessVenture({
    userId: user.userId,
    isAdmin: user.isAdmin,
    ventureId: venture.id,
  });
  if (!allowed) notFound();
  return { user, venture };
}

/**
 * Admin-only guard. Used for /portfolio, member management, etc.
 */
export async function requireAdminContext(): Promise<UserContext> {
  const user = await requireUserContext();
  if (!user.isAdmin) notFound();
  return user;
}

/**
 * Filter a list of ventures down to the visible set for the current user.
 * Used by /ventures and /events.
 */
export async function filterVisibleVentures<T extends { id: string }>(
  ventures: T[],
  user: UserContext,
): Promise<T[]> {
  const visible = await listVisibleVentures({
    userId: user.userId,
    isAdmin: user.isAdmin,
  });
  if (visible.isAdmin) return ventures;
  const allowed = new Set(visible.ventureIds ?? []);
  return ventures.filter((v) => allowed.has(v.id));
}
