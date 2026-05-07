import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  curateDay,
  type DayItem,
  type DayItemKind,
  type DismissalInput,
} from "@/lib/day/curate";
import { listVisibleVentures } from "@/lib/auth/membership";
import type { UserContext } from "@/lib/auth/membership";

/**
 * Server-side fetcher for The Day. Pulls the source rows scoped to the
 * user's visible ventures, the user's dismissals, and the venture metadata,
 * then hands them to the pure curateDay() function.
 *
 * Bright line: every source-row query filters by the visible-venture set
 * derived from membership. Cross-venture rows never enter the curator.
 */
export async function loadDayItems(
  user: UserContext,
  opts?: { now?: Date; limit?: number },
): Promise<DayItem[]> {
  const supabase = createSupabaseAdminClient();
  const visible = await listVisibleVentures({
    userId: user.userId,
    isAdmin: user.isAdmin,
  });

  // Resolve which venture IDs to scope queries to. Admin = all visible
  // ventures (queried separately to populate metadata).
  let ventureIds: string[];
  const { data: ventureRows } = await supabase
    .from("ventures")
    .select("id, slug, name, accent_color, mark_slug");
  const allVentures = ventureRows ?? [];
  if (visible.isAdmin) {
    ventureIds = allVentures.map((v) => v.id);
  } else {
    const allowed = new Set(visible.ventureIds ?? []);
    ventureIds = allVentures
      .filter((v) => allowed.has(v.id))
      .map((v) => v.id);
  }

  if (ventureIds.length === 0) {
    return [];
  }

  const ventures = allVentures
    .filter((v) => ventureIds.includes(v.id))
    .map((v) => ({
      venture_id: v.id,
      slug: v.slug,
      name: v.name,
      accent_color: v.accent_color,
      mark_slug: v.mark_slug,
    }));

  // Documents: pending review OR stale draft decisions (≥3 days).
  const threeDaysAgoIso = new Date(
    (opts?.now ?? new Date()).getTime() - 3 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [
    pendingDocsRes,
    staleDecisionsRes,
    agentNotesRes,
    anomaliesRes,
    supportRes,
    dismissalsRes,
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id, venture_id, type, title, status, loop_name, created_at, updated_at")
      .in("venture_id", ventureIds)
      .eq("status", "reviewing")
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("documents")
      .select("id, venture_id, type, title, status, loop_name, created_at, updated_at")
      .in("venture_id", ventureIds)
      .eq("status", "draft")
      .eq("type", "decision")
      .lt("created_at", threeDaysAgoIso)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("sections")
      .select(
        "id, document_id, status, content, created_at, document:documents(venture_id, title)",
      )
      .eq("kind", "agent_note")
      .in("status", ["draft", "reviewing", "revising"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("anomalies")
      .select("id, venture_id, metric_name, severity, status, ts")
      .in("venture_id", ventureIds)
      .in("status", ["open", "investigating"])
      .order("ts", { ascending: false })
      .limit(50),
    supabase
      .from("support_tickets")
      .select("id, venture_id, subject, classification, status, ts")
      .in("venture_id", ventureIds)
      .in("status", ["new", "classified"])
      .order("ts", { ascending: false })
      .limit(50),
    supabase
      .from("day_item_dismissals")
      .select("item_type, item_id, dismissed_at")
      .eq("user_id", user.userId),
  ]);

  // Filter agent-note sections to documents in visible ventures (the join
  // returned the venture_id; reject anything mismatched as a defence-in-depth).
  const allowedVentureIds = new Set(ventureIds);
  const agentNotes = (agentNotesRes.data ?? [])
    .map((row) => {
      const docs = (row as { document?: { venture_id?: string; title?: string } | null })
        .document;
      const ventureId = docs?.venture_id ?? null;
      const title = docs?.title ?? "Document";
      const content = (row as { content?: Record<string, unknown> | null }).content;
      const question =
        content && typeof content === "object" && typeof (content as Record<string, unknown>).question === "string"
          ? ((content as Record<string, unknown>).question as string)
          : null;
      return {
        id: row.id as string,
        document_id: row.document_id as string,
        document_venture_id: ventureId ?? "",
        document_title: title,
        status: row.status as string,
        created_at: row.created_at as string,
        question,
      };
    })
    .filter((n) => allowedVentureIds.has(n.document_venture_id));

  // Filter dismissals into the typed input shape, ignoring expired ones.
  // Expiry: dismissed_at is older than today's 06:00 local time. The simplest
  // way to express that is: if the operator's local-day rollover (06:00) is
  // between dismissed_at and now, the dismissal has expired.
  const localCutoff = mostRecentSixAm(opts?.now ?? new Date());
  const dismissals: DismissalInput[] = (dismissalsRes.data ?? [])
    .filter((d) => new Date(d.dismissed_at as string).getTime() >= localCutoff.getTime())
    .map((d) => ({
      item_type: d.item_type as DayItemKind,
      item_id: d.item_id as string,
    }));

  // Coerce nullable venture_id away — documents in The Day are venture-scoped
  // by definition (we filtered on `in ventureIds` above). Coercion is safe.
  const docRows = [
    ...(pendingDocsRes.data ?? []),
    ...(staleDecisionsRes.data ?? []),
  ]
    .filter((r) => r.venture_id !== null)
    .map((r) => ({
      id: r.id,
      venture_id: r.venture_id as string,
      type: r.type as string,
      title: r.title,
      status: r.status as string,
      loop_name: r.loop_name,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

  // anomalies + support_tickets tables have LooseRow types — narrow at the boundary.
  const anomalyRows = (anomaliesRes.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      venture_id: String(row.venture_id),
      metric_name: String(row.metric_name ?? ""),
      severity: (row.severity as "low" | "medium" | "high" | null) ?? null,
      status: String(row.status ?? ""),
      ts: String(row.ts ?? ""),
    };
  });
  const supportRows = (supportRes.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      venture_id: String(row.venture_id),
      subject: row.subject == null ? null : String(row.subject),
      classification:
        row.classification == null ? null : String(row.classification),
      status: String(row.status ?? ""),
      ts: String(row.ts ?? ""),
    };
  });

  return curateDay({
    documents: docRows,
    agentNoteSections: agentNotes,
    anomalies: anomalyRows,
    supportTickets: supportRows,
    dismissals,
    ventures,
    limit: opts?.limit,
    now: opts?.now,
  });
}

/**
 * Most recent 06:00 local time at-or-before `now`. Used to expire
 * dismissals at the day boundary the operator experiences.
 */
function mostRecentSixAm(now: Date): Date {
  const sixToday = new Date(now);
  sixToday.setHours(6, 0, 0, 0);
  if (sixToday.getTime() <= now.getTime()) return sixToday;
  // Before 06:00 local — the rollover happened yesterday at 06:00.
  const sixYesterday = new Date(sixToday);
  sixYesterday.setDate(sixYesterday.getDate() - 1);
  return sixYesterday;
}
