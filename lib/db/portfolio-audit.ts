import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listVentures } from "@/lib/db/ventures";
import { createDocument, type SectionSeed } from "@/lib/db/documents";

const SYDNEY_TZ = "Australia/Sydney";

export function auditDateKey(d = new Date()): string {
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

// Loop 11 — portfolio audit. Cross-venture meta-loop. Per ROADMAP:
//   Surfaces stale priorities (Document not updated in N days),
//   unused capabilities (Loop never invoked on venture X),
//   missing connections (Loop 8 enabled but no Stripe connection),
//   divergence (Loop 8 scoring distribution drifting).
//
// This runner is data-only — no LLM. Findings are computed from
// queries across the portfolio. Output lands as a portfolio-scope
// Document (venture_id is null). The recall layer never returns
// these in venture-scoped recall calls.
//
// Cross-venture context isolation preserved:
// - We read presence + counts + ages, never venture COMPANY.md
//   into a shared prompt.
// - getConnectionInventory() (lib/connections/manage.ts) returns
//   metadata only, never decrypts credentials.
// - Each venture's findings are independent; nothing flows from
//   one venture's text into another's.

const STALE_DAYS = 14;

export type FindingKind =
  | "stale_priority"
  | "unused_capability"
  | "missing_connection"
  | "low_activity"
  | "noted";

export type Finding = {
  kind: FindingKind;
  venture_slug: string;
  venture_name: string;
  body: string;
  severity: "low" | "medium" | "high";
};

export async function computePortfolioFindings(): Promise<Finding[]> {
  const supabase = createSupabaseAdminClient();
  const ventures = await listVentures();
  const active = ventures.filter((v) => v.phase !== "dormant");
  if (active.length === 0) return [];

  const findings: Finding[] = [];
  const staleCutoff = new Date(
    Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  for (const v of active) {
    // Stale priorities — active decisions not updated in 14 days
    const { count: staleCount } = await supabase
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .eq("venture_id", v.id)
      .eq("status", "active")
      .lt("updated_at", staleCutoff);
    if ((staleCount ?? 0) > 0) {
      findings.push({
        kind: "stale_priority",
        venture_slug: v.slug,
        venture_name: v.name,
        body: `${staleCount} active decision${staleCount === 1 ? "" : "s"} not updated in ${STALE_DAYS}+ days. Retrospective overdue.`,
        severity: (staleCount ?? 0) > 3 ? "high" : "medium",
      });
    }

    // Low activity — fewer than 3 events in last 14 days
    const { count: eventCount } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("venture_id", v.id)
      .gte("ts", staleCutoff);
    if ((eventCount ?? 0) < 3 && v.phase !== "discovery") {
      findings.push({
        kind: "low_activity",
        venture_slug: v.slug,
        venture_name: v.name,
        body: `${eventCount ?? 0} events in last ${STALE_DAYS} days (phase=${v.phase}). Either truly quiet or webhooks aren't firing.`,
        severity: "low",
      });
    }

    // Unused capabilities — loops_enabled with no recent invocations
    const enabledLoops = Array.isArray(v.loops_enabled)
      ? (v.loops_enabled as string[])
      : [];
    for (const loop of enabledLoops) {
      const { count: runs } = await supabase
        .from("loop_runs")
        .select("id", { count: "exact", head: true })
        .eq("venture_id", v.id)
        .eq("loop_name", loop)
        .gte("ts", staleCutoff);
      if ((runs ?? 0) === 0) {
        findings.push({
          kind: "unused_capability",
          venture_slug: v.slug,
          venture_name: v.name,
          body: `Loop "${loop}" enabled but not invoked in last ${STALE_DAYS} days.`,
          severity: "low",
        });
      }
    }

    // Missing connections — daily-digest scheduled but no relevant connections
    const isDigestScheduled = enabledLoops.includes("loop-8-daily-digest");
    if (isDigestScheduled) {
      const { count: connCount } = await supabase
        .from("connections")
        .select("id", { count: "exact", head: true })
        .eq("venture_id", v.id)
        .is("revoked_at", null);
      if ((connCount ?? 0) === 0) {
        findings.push({
          kind: "missing_connection",
          venture_slug: v.slug,
          venture_name: v.name,
          body: `Loop 8 enabled but no active connections. Daily digest will only show internal events until Stripe / Resend / Vercel / GitHub are wired in /settings/connections.`,
          severity: "medium",
        });
      }
    }
  }

  return findings;
}

export type GeneratePortfolioAuditResult =
  | { ok: true; documentId: string; alreadyExisted: boolean; findingCount: number; highSeverityCount: number }
  | { ok: false; error: string };

export async function generatePortfolioAudit(opts: {
  dateKey?: string;
  loopRunId?: string;
}): Promise<GeneratePortfolioAuditResult> {
  const dateKey = opts.dateKey ?? auditDateKey();
  const supabase = createSupabaseAdminClient();

  // Idempotency by date
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .is("venture_id", null)
    .eq("type", "portfolio_audit")
    .contains("metadata", { date_key: dateKey })
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      documentId: existing.id,
      alreadyExisted: true,
      findingCount: 0,
      highSeverityCount: 0,
    };
  }

  const findings = await computePortfolioFindings();

  const sections: SectionSeed[] = [];

  // Headline
  if (findings.length === 0) {
    sections.push({
      kind: "prose",
      content: { text: "No findings across the portfolio for this audit window." },
    });
  } else {
    const high = findings.filter((f) => f.severity === "high").length;
    const medium = findings.filter((f) => f.severity === "medium").length;
    const low = findings.filter((f) => f.severity === "low").length;
    sections.push({
      kind: "prose",
      content: {
        text: `Portfolio audit — ${findings.length} finding${findings.length === 1 ? "" : "s"} (${high} high · ${medium} medium · ${low} low) across active ventures.`,
      },
    });
  }

  // One prose section per finding (kind tag in the body for easy scanning)
  for (const f of findings) {
    const tag = f.kind.replace(/_/g, " ").toUpperCase();
    sections.push({
      kind: "prose",
      content: {
        text: `[${tag} · ${f.severity.toUpperCase()}] ${f.venture_name} (${f.venture_slug})\n\n${f.body}`,
      },
    });
  }

  const created = await createDocument({
    ventureId: null as unknown as string, // schema allows null after 0006
    type: "portfolio_audit",
    title: `Portfolio audit — ${dateKey}`,
    loopName: "loop-11-portfolio-audit",
    sections,
    metadata: {
      date_key: dateKey,
      loop_run_id: opts.loopRunId ?? null,
      finding_count: findings.length,
      severity_breakdown: {
        high: findings.filter((f) => f.severity === "high").length,
        medium: findings.filter((f) => f.severity === "medium").length,
        low: findings.filter((f) => f.severity === "low").length,
      },
    },
  });
  if (!created.ok) return { ok: false, error: created.error };

  return {
    ok: true,
    documentId: created.documentId,
    alreadyExisted: false,
    findingCount: findings.length,
    highSeverityCount: findings.filter((f) => f.severity === "high").length,
  };
}

export async function listPortfolioAudits(opts?: {
  limit?: number;
}): Promise<
  Array<{
    id: string;
    title: string;
    date_key: string | null;
    finding_count: number;
    created_at: string;
  }>
> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, metadata, created_at")
    .is("venture_id", null)
    .eq("type", "portfolio_audit")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 60);
  if (error) {
    console.error("[portfolio_audits] list failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const meta = row.metadata as
      | { date_key?: string; finding_count?: number }
      | null;
    return {
      id: row.id,
      title: row.title,
      date_key: meta?.date_key ?? null,
      finding_count: meta?.finding_count ?? 0,
      created_at: row.created_at,
    };
  });
}

export async function findPortfolioAuditByDate(
  dateKey: string,
): Promise<{ id: string } | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("documents")
    .select("id")
    .is("venture_id", null)
    .eq("type", "portfolio_audit")
    .contains("metadata", { date_key: dateKey })
    .maybeSingle();
  return data ? { id: data.id } : null;
}
