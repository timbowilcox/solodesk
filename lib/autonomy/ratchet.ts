import "server-only";

// lib/autonomy/ratchet.ts
//
// Trust ratchet eligibility engine.
// Reads eval_runs for a skill, checks against promotion thresholds,
// and fires a Promotion modal event when threshold is reached.
//
// Thresholds (hardcoded per B.4-D1 — configurable in Phase C):
//   Advise → Operate: 20 successful approvals, <2 rejections in last 20
//   Operate → Steward: 50 successful approvals, <3 rejections in last 50

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveAutonomyLevel } from "./gateway";
import { getSkillDef } from "./skills-registry";
import type { AutonomyLevel } from "./types";

type RatchetThreshold = {
  fromLevel: AutonomyLevel;
  toLevel: AutonomyLevel;
  requiredApprovals: number;
  maxRejections: number;
};

const RATCHET_THRESHOLDS: RatchetThreshold[] = [
  {
    fromLevel: "advise",
    toLevel: "operate",
    requiredApprovals: 20,
    maxRejections: 2,
  },
  {
    fromLevel: "operate",
    toLevel: "steward",
    requiredApprovals: 50,
    maxRejections: 3,
  },
];

export type RatchetEligibility =
  | { eligible: true; fromLevel: AutonomyLevel; toLevel: AutonomyLevel; approvals: number }
  | { eligible: false };

/**
 * Check whether a skill has reached a promotion threshold.
 * Called after every eval_run write.
 */
export async function checkRatchetEligibility(
  skillId: string,
  ventureId: string,
): Promise<RatchetEligibility> {
  const supabase = createSupabaseAdminClient();
  const skillDef = getSkillDef(skillId);
  const resolved = await resolveAutonomyLevel(skillDef, ventureId);
  const currentLevel = resolved.level;

  // hard_advise_only skills can never be promoted.
  if (resolved.hardAdviseOnly) return { eligible: false };

  const threshold = RATCHET_THRESHOLDS.find((t) => t.fromLevel === currentLevel);
  if (!threshold) return { eligible: false };

  const window = threshold.requiredApprovals;

  // Fetch the last N eval_runs for this skill.
  const { data: runs } = await supabase
    .from("eval_runs")
    .select("outcome")
    .eq("skill_id", skillId)
    .order("evaluated_at", { ascending: false })
    .limit(window);

  if (!runs || runs.length < window) return { eligible: false };

  const approvals = runs.filter((r) => r.outcome === "approved").length;
  const rejections = runs.filter((r) => r.outcome === "rejected").length;

  if (approvals >= threshold.requiredApprovals && rejections < threshold.maxRejections) {
    return {
      eligible: true,
      fromLevel: currentLevel,
      toLevel: threshold.toLevel,
      approvals,
    };
  }

  return { eligible: false };
}

/**
 * Fire a Promotion modal if the skill has just crossed a threshold.
 * Call this after writing an eval_run row.
 * Idempotent: only fires if no promotion modal was surfaced in the last 7 days
 * for this skill (prevents re-firing if the operator defers).
 */
export async function maybeFirePromotionModal(
  skillId: string,
  ventureId: string,
): Promise<void> {
  const eligibility = await checkRatchetEligibility(skillId, ventureId);
  if (!eligibility.eligible) return;

  const supabase = createSupabaseAdminClient();

  // Check for a recent promotion modal for this skill (idempotency guard).
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recent } = await supabase
    .from("modal_events")
    .select("id")
    .eq("archetype", "promotion")
    .eq("scope_id", skillId)
    .eq("scope_type", "skill")
    .gte("fired_at", sevenDaysAgo)
    .limit(1);

  if (recent && recent.length > 0) return; // already surfaced recently

  // Write the promotion modal event.
  await supabase.from("modal_events").insert({
    archetype: "promotion",
    scope_id: skillId,
    scope_type: "skill",
    action_id: null,
  });
}

/**
 * Check demotion threshold: if rejections in the last N runs exceed tolerance,
 * demote the skill one level and write a modal_events row for operator notification.
 * Called after every rejected eval_run.
 */
export async function checkDemotionThreshold(
  skillId: string,
  ventureId: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const skillDef = getSkillDef(skillId);
  const resolved = await resolveAutonomyLevel(skillDef, ventureId);
  const currentLevel = resolved.level;

  if (currentLevel === "advise") return; // already at floor, cannot demote

  const threshold = RATCHET_THRESHOLDS.find((t) => t.toLevel === currentLevel);
  if (!threshold) return;

  const window = threshold.requiredApprovals;
  const { data: runs } = await supabase
    .from("eval_runs")
    .select("outcome")
    .eq("skill_id", skillId)
    .order("evaluated_at", { ascending: false })
    .limit(window);

  if (!runs || runs.length < Math.ceil(window / 2)) return; // not enough data

  const rejections = runs.filter((r) => r.outcome === "rejected").length;
  if (rejections <= threshold.maxRejections) return; // within tolerance

  // Demote: insert an autonomy_levels row with the lower level.
  await supabase.from("autonomy_levels").insert({
    scope_type: "skill",
    scope_id: skillId,
    level: threshold.fromLevel,
    hard_advise_only: false,
  });

  // Surface an alert modal to notify the operator.
  await supabase.from("modal_events").insert({
    archetype: "alert",
    scope_id: skillId,
    scope_type: "skill",
    action_id: null,
  });
}
