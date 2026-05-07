import "server-only";

import { generateDailyDigest } from "@/lib/db/digests";
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
}
