// lib/autonomy/skills-registry.ts
//
// Runtime registry of skill definitions with autonomy metadata.
// Mirrors the frontmatter in .claude/skills/<name>/SKILL.md.
//
// DECISION [B.1-D1]: Existing skills are registered at level 'operate'
// (not 'advise' as SPRINT.md specifies). This preserves system function
// during the B.1→B.2 gap when modal UI doesn't exist yet. Once B.2 modal
// queue is live, Tim should reset skills to 'advise' via the command palette
// and let them earn back to 'operate' through the trust ratchet.
// New skills not listed here default to 'advise'.

import type { SkillDef, AutonomyLevel } from "./types";

const REGISTERED_SKILLS: SkillDef[] = [
  {
    id: "office-hours",
    loopId: "01-strategy",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 100,
  },
  {
    id: "adversarial-strategy",
    loopId: "01-strategy",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 100,
  },
  {
    id: "content-writer",
    loopId: "04-content",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 60,
  },
  {
    id: "content-critic",
    loopId: "04-content",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 60,
  },
  {
    id: "support-triage",
    loopId: "06-support",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 5,
  },
  {
    id: "support-replier",
    loopId: "06-support",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 40,
  },
  {
    id: "loop8-investigator",
    loopId: "08-metrics",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 60,
  },
  {
    id: "intel-scout",
    loopId: "09-intel",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 200,
  },
  {
    id: "intel-critic",
    loopId: "09-intel",
    level: "operate",
    hardAdviseOnly: false,
    budgetCents: 200,
  },
];

const registry = new Map<string, SkillDef>(
  REGISTERED_SKILLS.map((s) => [s.id, s]),
);

// New / unknown skills default to 'advise' — the most restrictive level.
const DEFAULT_LEVEL: AutonomyLevel = "advise";

export function getSkillDef(skillId: string): SkillDef {
  const found = registry.get(skillId);
  if (found) return found;
  return {
    id: skillId,
    level: DEFAULT_LEVEL,
    hardAdviseOnly: false,
    budgetCents: 0,
  };
}

export function registerSkill(def: SkillDef): void {
  registry.set(def.id, def);
}

export function listRegisteredSkills(): SkillDef[] {
  return [...registry.values()];
}
