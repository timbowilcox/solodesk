// lib/skills/load.ts
//
// Skill definition validation and registration.
//
// SKILL.md frontmatter fields required from B.1 onwards:
//   name, description, loop, counterpart, budget_tokens, budget_cents,
//   level, hard_advise_only
//
// The runtime registry is in /lib/autonomy/skills-registry.ts.
// This module provides the validation contract and a typed registerSkill
// surface that callers use instead of importing the registry directly.

import { registerSkill as _register } from "@/lib/autonomy/skills-registry";
import type { AutonomyLevel, SkillDef } from "@/lib/autonomy/types";

// Required frontmatter fields from SKILL.md (as parsed at build time or in tests).
export type SkillFrontmatter = {
  name: string;
  description: string;
  loop?: string;
  counterpart?: string | null;
  budget_tokens: number;
  budget_cents: number;
  level: AutonomyLevel;
  hard_advise_only: boolean;
  model?: string;
};

export type SkillRegistrationError =
  | { field: "name"; reason: "missing or empty" }
  | { field: "budget_tokens"; reason: "missing or not a number" }
  | { field: "budget_cents"; reason: "missing or not a number" }
  | { field: "level"; reason: "missing or not a valid autonomy level" }
  | { field: "hard_advise_only"; reason: "missing or not a boolean" };

const VALID_LEVELS = new Set<AutonomyLevel>(["advise", "operate", "steward"]);

/**
 * Validate a skill frontmatter object.
 * Returns an array of errors (empty = valid).
 * A missing `level` field is a definition error — no silent default.
 */
export function validateSkillFrontmatter(
  fm: Partial<SkillFrontmatter>,
): SkillRegistrationError[] {
  const errors: SkillRegistrationError[] = [];

  if (!fm.name || typeof fm.name !== "string" || fm.name.trim() === "") {
    errors.push({ field: "name", reason: "missing or empty" });
  }
  if (typeof fm.budget_tokens !== "number" || isNaN(fm.budget_tokens)) {
    errors.push({ field: "budget_tokens", reason: "missing or not a number" });
  }
  if (typeof fm.budget_cents !== "number" || isNaN(fm.budget_cents)) {
    errors.push({ field: "budget_cents", reason: "missing or not a number" });
  }
  if (!fm.level || !VALID_LEVELS.has(fm.level)) {
    errors.push({ field: "level", reason: "missing or not a valid autonomy level" });
  }
  if (typeof fm.hard_advise_only !== "boolean") {
    errors.push({ field: "hard_advise_only", reason: "missing or not a boolean" });
  }

  return errors;
}

/**
 * Register a skill from its parsed frontmatter.
 * Throws if any required field is missing — no silent defaults.
 */
export function registerSkillFromFrontmatter(fm: SkillFrontmatter): void {
  const errors = validateSkillFrontmatter(fm);
  if (errors.length > 0) {
    throw new Error(
      `Skill '${fm.name ?? "(unnamed)"}' has invalid frontmatter: ${errors
        .map((e) => `${e.field}: ${e.reason}`)
        .join("; ")}`,
    );
  }

  const def: SkillDef = {
    id: fm.name,
    loopId: fm.loop,
    level: fm.level,
    hardAdviseOnly: fm.hard_advise_only,
    budgetCents: fm.budget_cents,
  };

  _register(def);
}
