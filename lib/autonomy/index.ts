// lib/autonomy/index.ts — public surface of the autonomy module.
// Import from here, not from sub-modules directly.

export { executeToolCall, resolveAutonomyLevel, resolveGuardrails, checkGuardrails, isGate, checkKillSwitch, writeEvalRun, fireInsightModal } from "./gateway";
export { getSkillDef, registerSkill, listRegisteredSkills } from "./skills-registry";
export { killAllAutonomy, restoreAutonomy, getKillSwitchState } from "./kill-switch";
export type {
  AutonomyLevel,
  ScopeType,
  GuardrailType,
  ModalArchetype,
  EscalationTrigger,
  EvalOutcome,
  SkillDef,
  EffectiveLevel,
  Guardrail,
  GuardrailBreach,
  ToolCallInput,
  ToolCallResult,
  KillSwitchState,
} from "./types";
