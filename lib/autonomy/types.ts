// lib/autonomy/types.ts
// Shared types for the Phase B autonomy control plane.

export type AutonomyLevel = "advise" | "operate" | "steward";

export type ScopeType = "operator" | "venture" | "loop" | "skill";

export type GuardrailType =
  | "budget_cap"
  | "communication_cap"
  | "recipient_allowlist"
  | "brand_voice"
  | "topic_blocklist"
  | "time_window"
  | "volume_cap";

export type ModalArchetype =
  | "decision"
  | "brief"
  | "insight"
  | "alert"
  | "completion"
  | "question"
  | "promotion"
  | "escalation";

export type EscalationTrigger =
  | "guardrail_breach"
  | "anomaly"
  | "classifier_fail"
  | "config_error";

export type EvalOutcome =
  | "approved"
  | "rejected"
  | "deferred"
  | "anomaly"
  | "breach";

// SkillDef — the runtime representation of a registered skill.
// Sourced from /lib/autonomy/skills-registry.ts (which mirrors SKILL.md frontmatter).
export type SkillDef = {
  id: string;        // e.g. 'office-hours', 'content-writer'
  loopId?: string;   // e.g. '01-strategy', '04-content'
  level: AutonomyLevel;
  hardAdviseOnly: boolean;
  budgetCents: number;
};

// EffectiveLevel — resolved after walking scope precedence.
export type EffectiveLevel = {
  level: AutonomyLevel;
  hardAdviseOnly: boolean;
  resolvedFrom: ScopeType | "skill_default";
};

// Guardrail — a single active constraint for a scope.
export type Guardrail = {
  id: string;
  scopeType: ScopeType;
  scopeId: string;
  guardrailType: GuardrailType;
  config: Record<string, unknown>;
  active: boolean;
};

// GuardrailBreach — returned when checkGuardrails finds a violation.
export type GuardrailBreach = {
  breached: GuardrailType;
  detail: string;
};

// ToolCallInput — the single argument to executeToolCall.
export type ToolCallInput = {
  skill: SkillDef;
  tool: string;
  params: Record<string, unknown>;
  ventureId: string;
  loopRunId?: string;
  operatorId?: string;
};

// ToolCallResult — discriminated union returned by executeToolCall.
export type ToolCallResult =
  | { ok: true; executed: true; actionId: string }
  | {
      ok: true;
      executed: false;
      actionId: string;
      reason: "advise" | "operate_gate" | "kill_switch" | "guardrail_breach";
      modalEventId: string;
    }
  | { ok: false; actionId?: string; error: string };

// KillSwitchState — current state of the operator kill switch.
export type KillSwitchState =
  | { killed: false }
  | { killed: true; killedAt: string; killedReason: string | null };
