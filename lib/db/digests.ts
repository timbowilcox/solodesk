import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createDocument, type SectionSeed } from "@/lib/db/documents";
import type { Tables } from "@/lib/supabase/types";

export type DigestRow = Tables<"documents">;

const SYDNEY_TZ = "Australia/Sydney";

/**
 * Format a date as YYYY-MM-DD in the venture's operating timezone.
 * Sprint 0 hardcodes Australia/Sydney. Per-venture tz lives on
 * ventures.timezone in a future migration.
 */
export function digestDateKey(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function startOfDayUtc(dateKey: string): Date {
  // Treat the digest day as "starts at 00:00 Sydney". The digest then
  // covers the prior 24h window in venture-local time.
  // For aggregation we take the UTC range covering the day-key.
  return new Date(`${dateKey}T00:00:00.000+10:00`);
}

function endOfDayUtc(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999+10:00`);
}

// --------------------------------------------------------------
// Aggregations — Phase 1 uses what's in the existing schema.
// External-provider metrics (MRR, deploy frequency, PR velocity)
// arrive in Phase 2 once Sprint 1.3 connections are populated and
// metric_snapshots is filled by webhook handlers.
// --------------------------------------------------------------

export type DigestMetrics = {
  events_24h: number;
  events_by_source: Record<string, number>;
  decisions_today: number;
  decisions_active: number;
  memories_today: number;
  recent_decision_title: string | null;
  drafts_awaiting_review: Array<{ id: string; title: string; created_at: string }>;
};

export async function computeDigestMetrics(opts: {
  ventureId: string;
  dateKey: string;
}): Promise<DigestMetrics> {
  const supabase = createSupabaseAdminClient();
  const dayStart = startOfDayUtc(opts.dateKey).toISOString();
  const dayEnd = endOfDayUtc(opts.dateKey).toISOString();

  const [eventsRes, decisionsTodayRes, decisionsActiveRes, memoriesRes, recentDocRes, draftsRes] =
    await Promise.all([
      supabase
        .from("events")
        .select("source", { count: "exact" })
        .eq("venture_id", opts.ventureId)
        .gte("ts", dayStart)
        .lte("ts", dayEnd),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("venture_id", opts.ventureId)
        .eq("type", "decision")
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd),
      supabase
        .from("decisions")
        .select("id", { count: "exact", head: true })
        .eq("venture_id", opts.ventureId)
        .eq("status", "active"),
      supabase
        .from("memories")
        .select("id", { count: "exact", head: true })
        .eq("venture_id", opts.ventureId)
        .gte("ts", dayStart)
        .lte("ts", dayEnd),
      supabase
        .from("documents")
        .select("title")
        .eq("venture_id", opts.ventureId)
        .eq("type", "decision")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id, title, created_at")
        .eq("venture_id", opts.ventureId)
        .eq("type", "decision")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  const events_by_source: Record<string, number> = {};
  for (const ev of eventsRes.data ?? []) {
    const src = (ev as { source: string }).source;
    events_by_source[src] = (events_by_source[src] ?? 0) + 1;
  }

  const recent = recentDocRes.data as { title?: string } | null;

  return {
    events_24h: eventsRes.count ?? 0,
    events_by_source,
    decisions_today: decisionsTodayRes.count ?? 0,
    decisions_active: decisionsActiveRes.count ?? 0,
    memories_today: memoriesRes.count ?? 0,
    recent_decision_title: recent?.title ?? null,
    drafts_awaiting_review: (draftsRes.data ?? []).map((r) => ({
      id: (r as { id: string }).id,
      title: (r as { title: string }).title,
      created_at: (r as { created_at: string }).created_at,
    })),
  };
}

// --------------------------------------------------------------
// Section composition — turn the metrics into Document Sections
// --------------------------------------------------------------

function buildHeadline(metrics: DigestMetrics, ventureName: string): string {
  const parts: string[] = [];
  if (metrics.events_24h === 0 && metrics.decisions_today === 0 && metrics.memories_today === 0) {
    return `Quiet day on ${ventureName}.`;
  }
  if (metrics.decisions_today > 0) {
    parts.push(
      `${metrics.decisions_today} new decision${metrics.decisions_today === 1 ? "" : "s"}`,
    );
  }
  if (metrics.events_24h > 0) {
    parts.push(`${metrics.events_24h} event${metrics.events_24h === 1 ? "" : "s"}`);
  }
  if (metrics.memories_today > 0) {
    parts.push(
      `${metrics.memories_today} memor${metrics.memories_today === 1 ? "y" : "ies"} captured`,
    );
  }
  return `${ventureName}: ${parts.join(", ")}.`;
}

function buildEventsProse(metrics: DigestMetrics): string | null {
  const sources = Object.entries(metrics.events_by_source);
  if (sources.length === 0) return null;
  sources.sort((a, b) => b[1] - a[1]);
  return sources.map(([src, n]) => `${src}: ${n}`).join(" · ");
}

function buildDecisionsBlock(metrics: DigestMetrics): string {
  if (metrics.drafts_awaiting_review.length === 0) {
    return "No drafts awaiting review.";
  }
  return metrics.drafts_awaiting_review
    .map((d, idx) => `${idx + 1}. ${d.title}`)
    .join("\n");
}

// --------------------------------------------------------------
// Generate / fetch
// --------------------------------------------------------------

export type GenerateDailyDigestInput = {
  ventureId: string;
  ventureName: string;
  dateKey?: string; // defaults to today in Sydney tz
  loopRunId?: string;
};

export type GenerateDailyDigestResult =
  | { ok: true; documentId: string; alreadyExisted: boolean }
  | { ok: false; error: string };

export async function generateDailyDigest(
  input: GenerateDailyDigestInput,
): Promise<GenerateDailyDigestResult> {
  const dateKey = input.dateKey ?? digestDateKey();
  const supabase = createSupabaseAdminClient();

  // Idempotency — one digest per (venture, date). Look for an existing
  // Document with metadata.date_key matching.
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("venture_id", input.ventureId)
    .eq("type", "daily_digest")
    .contains("metadata", { date_key: dateKey })
    .maybeSingle();
  if (existing) {
    return { ok: true, documentId: existing.id, alreadyExisted: true };
  }

  const metrics = await computeDigestMetrics({
    ventureId: input.ventureId,
    dateKey,
  });

  const sections: SectionSeed[] = [];

  // 1. Headline
  sections.push({
    kind: "prose",
    content: { text: buildHeadline(metrics, input.ventureName) },
  });

  // 2. Metric block — KPI grid rendered by components/document/sections/metric-block
  sections.push({
    kind: "metric_block",
    content: {
      metrics: [
        { label: "Events (24h)", value: String(metrics.events_24h) },
        { label: "Decisions today", value: String(metrics.decisions_today) },
        { label: "Active decisions", value: String(metrics.decisions_active) },
        { label: "Memories today", value: String(metrics.memories_today) },
      ],
    },
  });

  // 3. Events breakdown prose (if any)
  const eventsProse = buildEventsProse(metrics);
  if (eventsProse) {
    sections.push({
      kind: "prose",
      content: { text: `Event sources today — ${eventsProse}` },
    });
  }

  // 4. Drafts awaiting review
  sections.push({
    kind: "prose",
    content: { text: buildDecisionsBlock(metrics) },
  });

  // Note: We deliberately use createDocument with `prose` kinds for v1.
  // The metric_block kind exists in the section catalogue but the seeder
  // for metric_block is part of the Phase 2 digest agent (anomaly-explainer).
  // Pure-prose v1 is plenty useful while still landing as a Document.

  const result = await createDocument({
    ventureId: input.ventureId,
    type: "daily_digest",
    title: `${input.ventureName} — ${dateKey}`,
    loopName: "loop-8-daily-digest",
    sections,
    metadata: {
      date_key: dateKey,
      loop_run_id: input.loopRunId ?? null,
      metrics: metrics as unknown as Record<string, unknown>,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, documentId: result.documentId, alreadyExisted: false };
}

export async function listDigestsForVenture(opts: {
  ventureId: string;
  limit?: number;
}): Promise<DigestRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("venture_id", opts.ventureId)
    .eq("type", "daily_digest")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 60);
  if (error) {
    console.error("[digests] list failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function findDigestByDate(opts: {
  ventureId: string;
  dateKey: string;
}): Promise<DigestRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("venture_id", opts.ventureId)
    .eq("type", "daily_digest")
    .contains("metadata", { date_key: opts.dateKey })
    .maybeSingle();
  if (error) {
    console.error("[digests] findByDate failed", error.message);
    return null;
  }
  return data ?? null;
}
