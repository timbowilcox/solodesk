import "server-only";

import { generateDailyDigest } from "@/lib/db/digests";
import { generatePortfolioAudit } from "@/lib/db/portfolio-audit";
import { getVentureBySlug } from "@/lib/db/ventures";

import { registerSchedule } from "./registry";

// Register all schedules at module import. Imported by /api/cron/* routes
// so the registry is populated when the cron endpoint dispatches.
//
// New scheduled Loops add a registerSchedule() call here + a vercel.json
// cron entry pointing at /api/cron/<id>.

let registered = false;

export function ensureSchedulesRegistered(): void {
  if (registered) return;
  registered = true;

  registerSchedule({
    id: "loop-8-daily-digest",
    cron: "0 20 * * *", // 06:00 Australia/Sydney = 20:00 UTC
    description:
      "Daily metrics digest per active venture (Loop 8). Idempotent by date.",
    scope: "per-venture",
    budgetTokens: 10_000,
    budgetCents: 50,
    run: async (ctx) => {
      if (!ctx.ventureSlug) {
        return { ok: false, summary: "missing venture context" };
      }
      const venture = await getVentureBySlug(ctx.ventureSlug);
      if (!venture) {
        return { ok: false, summary: `venture ${ctx.ventureSlug} not found` };
      }
      const result = await generateDailyDigest({
        ventureId: venture.id,
        ventureName: venture.name,
        loopRunId: ctx.loopRunId,
      });
      if (!result.ok) {
        return { ok: false, summary: `generate failed: ${result.error}` };
      }
      return {
        ok: true,
        summary: result.alreadyExisted
          ? `digest already existed (${venture.slug})`
          : `digest created (${venture.slug})`,
        metadata: {
          document_id: result.documentId,
          venture_slug: venture.slug,
          already_existed: result.alreadyExisted,
        },
      };
    },
  });

  registerSchedule({
    id: "loop-11-portfolio-audit",
    cron: "0 21 * * 0", // 07:00 Sunday Australia/Sydney = 21:00 UTC Saturday
    description:
      "Cross-venture portfolio audit (Loop 11). Surfaces stale priorities, unused capabilities, missing connections, low activity. Differentiator vs running Claude Code per venture.",
    scope: "global",
    run: async (ctx) => {
      const result = await generatePortfolioAudit({
        loopRunId: ctx.loopRunId,
      });
      if (!result.ok) {
        return { ok: false, summary: `generate failed: ${result.error}` };
      }
      return {
        ok: true,
        summary: result.alreadyExisted
          ? `audit already existed (${result.findingCount} findings)`
          : `audit created with ${result.findingCount} findings`,
        metadata: {
          document_id: result.documentId,
          finding_count: result.findingCount,
          already_existed: result.alreadyExisted,
        },
      };
    },
  });
}
