import "server-only";

import { generatePortfolioAudit } from "@/lib/db/portfolio-audit";
import { executeToolCall, writeEvalRun, fireInsightModal } from "@/lib/autonomy/gateway";
import { getSkillDef } from "@/lib/autonomy/skills-registry";

import { registerSchedule } from "./registry";

// Register all schedules at module import. Imported by /api/cron/* routes
// so the registry is populated when the cron endpoint dispatches.
//
// New scheduled Loops add a registerSchedule() call here + a vercel.json
// cron entry pointing at /api/cron/<id>.
//
// loop-8-daily-digest was a per-venture daily summary cron. Sprint 11
// (commit a14c583) replaced it with reactive Loop 8 (webhook + threshold
// + manual triggers). The cron route was removed in the phase-fix sprint.
// The manual trigger surface at /ventures/[slug]/digests still uses
// generateDailyDigest() from lib/db/digests.ts directly.

let registered = false;

export function ensureSchedulesRegistered(): void {
  if (registered) return;
  registered = true;

  registerSchedule({
    id: "loop-11-portfolio-audit",
    cron: "0 21 * * 0", // 07:00 Sunday Australia/Sydney = 21:00 UTC Saturday
    description:
      "Cross-venture portfolio audit (Loop 11). Surfaces stale priorities, unused capabilities, missing connections, low activity. Differentiator vs running Claude Code per venture.",
    scope: "global",
    run: async (ctx) => {
      // Autonomy gateway check — no ventureId for global scope.
      const skillDef = getSkillDef("portfolio-auditor");
      const gateResult = await executeToolCall({
        skill: skillDef,
        tool: "run_portfolio_audit",
        params: { loopRunId: ctx.loopRunId },
      });
      if (!gateResult.ok) {
        return { ok: false, summary: `gateway error: ${gateResult.error}` };
      }
      if (!gateResult.executed) {
        return { ok: false, summary: `gated: ${gateResult.reason}` };
      }
      const actionId = gateResult.actionId;

      const result = await generatePortfolioAudit({
        loopRunId: ctx.loopRunId,
      });

      if (!result.ok) {
        await writeEvalRun({
          actionId,
          skillId: "portfolio-auditor",
          outcome: "rejected",
          notes: `generate failed: ${result.error}`,
        }).catch(() => {/* non-fatal */});
        return { ok: false, summary: `generate failed: ${result.error}` };
      }

      // Record successful eval run for ratchet.
      await writeEvalRun({
        actionId,
        skillId: "portfolio-auditor",
        outcome: "approved",
        notes: `findings=${result.findingCount}`,
      }).catch(() => {/* non-fatal */});

      // Surface an Insight modal when high-severity findings exist.
      if (!result.alreadyExisted && result.highSeverityCount > 0) {
        await fireInsightModal({
          scopeId: "portfolio-auditor",
          scopeType: "skill",
          actionId,
        }).catch(() => {/* non-fatal — modal failure doesn't block audit */});
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
