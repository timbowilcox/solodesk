import "server-only";

// lib/autonomy/gateway.ts
//
// The single enforcement point for all tool calls in the autonomy system.
// Every Loop invocation and external tool action routes through
// executeToolCall() before being attempted.
//
// Bright lines:
//   - actions row written BEFORE any tool is invoked (fail-closed on DB error)
//   - kill switch checked first; overrides all scope levels
//   - hard_advise_only at any scope cannot be bypassed by more-specific scopes
//   - cross-venture isolation: guardrails and levels scoped by ventureId only
//   - anomaly stubs wired at correct call sites; B.4 plugs in real logic

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import type {
  AutonomyLevel,
  EffectiveLevel,
  Guardrail,
  GuardrailBreach,
  GuardrailType,
  ModalArchetype,
  SkillDef,
  ToolCallInput,
  ToolCallResult,
} from "./types";

// ─── Gate tool catalogue ──────────────────────────────────────────────────────

const GATE_TOOLS = new Set([
  "send_email",
  "publish_post",
  "pay_invoice",
  "sign_contract",
  "execute_trade",
  "modify_production_data",
  "allocate_budget",
]);

export function isGate(tool: string): boolean {
  return GATE_TOOLS.has(tool);
}

// ─── Scope precedence (lower = more specific = wins) ─────────────────────────

const SCOPE_PRECEDENCE: Record<string, number> = {
  skill: 0,
  loop: 1,
  venture: 2,
  operator: 3,
};

// ─── Level resolution ────────────────────────────────────────────────────────

export async function resolveAutonomyLevel(
  skill: SkillDef,
  ventureId: string,
): Promise<EffectiveLevel> {
  const supabase = createSupabaseAdminClient();

  const { data: rows } = await supabase
    .from("autonomy_levels")
    .select("scope_type, scope_id, level, hard_advise_only")
    .in("scope_type", ["operator", "venture", "loop", "skill"])
    .order("set_at", { ascending: false });

  if (!rows || rows.length === 0) {
    return {
      level: skill.level,
      hardAdviseOnly: skill.hardAdviseOnly,
      resolvedFrom: "skill_default",
    };
  }

  // Filter to rows applicable to this skill invocation.
  const applicable = rows.filter((row) => {
    switch (row.scope_type) {
      case "venture":
        return row.scope_id === ventureId;
      case "skill":
        return row.scope_id === skill.id;
      case "loop":
        return skill.loopId !== undefined && row.scope_id === skill.loopId;
      case "operator":
        // v0: operator rows apply globally (single-operator).
        return true;
      default:
        return false;
    }
  });

  if (applicable.length === 0) {
    return {
      level: skill.level,
      hardAdviseOnly: skill.hardAdviseOnly,
      resolvedFrom: "skill_default",
    };
  }

  // Sort by specificity: most specific (lower precedence number) first.
  applicable.sort(
    (a, b) =>
      (SCOPE_PRECEDENCE[a.scope_type] ?? 99) -
      (SCOPE_PRECEDENCE[b.scope_type] ?? 99),
  );

  // hard_advise_only: any scope setting this flag wins (most restrictive).
  const hardAdviseOnly =
    skill.hardAdviseOnly || applicable.some((r) => r.hard_advise_only);

  // applicable.length > 0 guaranteed by the check above.
  const mostSpecific = applicable[0]!;
  const level: AutonomyLevel = hardAdviseOnly
    ? "advise"
    : (mostSpecific.level as AutonomyLevel);

  return {
    level,
    hardAdviseOnly,
    resolvedFrom: mostSpecific.scope_type as EffectiveLevel["resolvedFrom"],
  };
}

// ─── Guardrail resolution ────────────────────────────────────────────────────

export async function resolveGuardrails(
  skill: SkillDef,
  ventureId: string,
): Promise<Guardrail[]> {
  const supabase = createSupabaseAdminClient();

  const { data: rows } = await supabase
    .from("guardrails")
    .select("id, scope_type, scope_id, guardrail_type, config, active")
    .eq("active", true);

  if (!rows) return [];

  return rows
    .filter((row) => {
      switch (row.scope_type) {
        case "venture":
          return row.scope_id === ventureId;
        case "skill":
          return row.scope_id === skill.id;
        case "loop":
          return skill.loopId !== undefined && row.scope_id === skill.loopId;
        case "operator":
          return true;
        default:
          return false;
      }
    })
    .map((row) => ({
      id: row.id as string,
      scopeType: row.scope_type as Guardrail["scopeType"],
      scopeId: row.scope_id as string,
      guardrailType: row.guardrail_type as GuardrailType,
      config: (row.config ?? {}) as Record<string, unknown>,
      active: row.active as boolean,
    }));
}

// ─── Guardrail check ─────────────────────────────────────────────────────────

export function checkGuardrails(
  tool: string,
  params: Record<string, unknown>,
  guardrails: Guardrail[],
): GuardrailBreach | null {
  for (const g of guardrails) {
    const breach = checkSingleGuardrail(tool, params, g);
    if (breach) return breach;
  }
  return null;
}

function checkSingleGuardrail(
  tool: string,
  params: Record<string, unknown>,
  guardrail: Guardrail,
): GuardrailBreach | null {
  const cfg = guardrail.config;

  try {
    switch (guardrail.guardrailType) {
      case "budget_cap": {
        const maxCents =
          typeof cfg.max_cents === "number" ? cfg.max_cents : null;
        const estimated =
          typeof params.estimated_cost_cents === "number"
            ? params.estimated_cost_cents
            : null;
        if (maxCents !== null && estimated !== null && estimated > maxCents) {
          return {
            breached: "budget_cap",
            detail: `Estimated cost $${(estimated / 100).toFixed(2)} exceeds cap $${(maxCents / 100).toFixed(2)}`,
          };
        }
        return null;
      }

      case "communication_cap":
        // v1 stub — needs recipient history query. B.4 wires real logic.
        return null;

      case "recipient_allowlist": {
        if (tool !== "send_email") return null;
        const allowed = Array.isArray(cfg.allowed_recipients)
          ? (cfg.allowed_recipients as string[])
          : null;
        if (!allowed) return null;
        const to =
          typeof params.to === "string" ? params.to.toLowerCase() : null;
        if (to && !allowed.map((r) => r.toLowerCase()).includes(to)) {
          return {
            breached: "recipient_allowlist",
            detail: `Recipient ${params.to} not in allowlist`,
          };
        }
        return null;
      }

      case "topic_blocklist": {
        const blocked = Array.isArray(cfg.forbidden_topics)
          ? (cfg.forbidden_topics as string[])
          : null;
        if (!blocked) return null;
        const content =
          typeof params.content === "string"
            ? params.content.toLowerCase()
            : "";
        for (const topic of blocked) {
          if (content.includes(topic.toLowerCase())) {
            return {
              breached: "topic_blocklist",
              detail: `Content mentions blocked topic: ${topic}`,
            };
          }
        }
        return null;
      }

      case "time_window": {
        const start =
          typeof cfg.allowed_start_hour === "number"
            ? cfg.allowed_start_hour
            : null;
        const end =
          typeof cfg.allowed_end_hour === "number"
            ? cfg.allowed_end_hour
            : null;
        if (start === null || end === null) return null;
        const hour = new Date().getUTCHours();
        if (hour < start || hour >= end) {
          return {
            breached: "time_window",
            detail: `Tool ${tool} not allowed at UTC hour ${hour} (window: ${start}–${end})`,
          };
        }
        return null;
      }

      case "volume_cap":
        // v1 stub — needs recent action count query. B.4 wires real logic.
        return null;

      case "brand_voice":
        // v1 stub — needs classifier call. B.4 wires real logic.
        return null;

      default:
        return null;
    }
  } catch {
    // Malformed config — fail closed (treat as breach per SPRINT.md AC).
    return {
      breached: guardrail.guardrailType,
      detail: `Guardrail config malformed for ${guardrail.guardrailType}`,
    };
  }
}

// ─── Anomaly detection stubs ─────────────────────────────────────────────────
// B.4 replaces these with real logic. Stubs are named so B.4 knows where to
// plug in each detection case from AUTONOMY-MODEL §7.

function detectRecipientAnomaly(
  _tool: string,
  _params: Record<string, unknown>,
  _skill: SkillDef,
): null {
  // B.4: check recipient against historical pattern for this skill.
  return null;
}

function detectVolumeSpike(
  _tool: string,
  _params: Record<string, unknown>,
  _skill: SkillDef,
): null {
  // B.4: check action frequency vs rolling mean for this skill.
  return null;
}

function detectContentClassifierFire(
  _tool: string,
  _params: Record<string, unknown>,
  _skill: SkillDef,
): null {
  // B.4: run brand-voice classifier on params.content.
  return null;
}

function detectTimeOfDayDeviation(
  _tool: string,
  _params: Record<string, unknown>,
  _skill: SkillDef,
): null {
  // B.4: compare current hour to historical distribution for this skill.
  return null;
}

function detectCrossSkillCorrelation(
  _tool: string,
  _params: Record<string, unknown>,
  _skill: SkillDef,
): null {
  // B.4: check whether multiple skills are hitting the same external system
  // simultaneously (cascade risk).
  return null;
}

function detectAnomaly(
  tool: string,
  params: Record<string, unknown>,
  skill: SkillDef,
): null {
  return (
    detectRecipientAnomaly(tool, params, skill) ??
    detectVolumeSpike(tool, params, skill) ??
    detectContentClassifierFire(tool, params, skill) ??
    detectTimeOfDayDeviation(tool, params, skill) ??
    detectCrossSkillCorrelation(tool, params, skill)
  );
}

// ─── Kill switch ─────────────────────────────────────────────────────────────

export async function checkKillSwitch(operatorId?: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();

  if (operatorId) {
    const { data } = await supabase
      .from("operator_kill_switch")
      .select("killed")
      .eq("operator_id", operatorId)
      .maybeSingle();
    return data?.killed === true;
  }

  // v0: single-operator — any killed=true row activates the switch.
  const { data } = await supabase
    .from("operator_kill_switch")
    .select("killed")
    .eq("killed", true)
    .limit(1)
    .maybeSingle();
  return data !== null;
}

// ─── DB writes ───────────────────────────────────────────────────────────────

async function writeActionsRow(opts: {
  skillId: string;
  ventureId: string;
  tool: string;
  params: Record<string, unknown>;
  autonomyLevel: AutonomyLevel;
  modalSurfaced: boolean;
}): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("actions")
    .insert({
      skill_id: opts.skillId,
      venture_id: opts.ventureId,
      tool: opts.tool,
      params: opts.params as Json,
      autonomy_level: opts.autonomyLevel,
      modal_surfaced: opts.modalSurfaced,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Fail-closed: audit row insert failure blocks execution.
    throw new Error(
      `actions row insert failed: ${error?.message ?? "unknown"}`,
    );
  }
  return data.id as string;
}

async function finalizeActionsRow(
  actionId: string,
  update: { result?: unknown; error?: string; durationMs?: number },
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("actions")
    .update({
      ...(update.result !== undefined
        ? { result: update.result as Json }
        : {}),
      ...(update.error !== undefined ? { error: update.error } : {}),
      ...(update.durationMs !== undefined
        ? { duration_ms: update.durationMs }
        : {}),
    })
    .eq("id", actionId);
}

type ModalScopeType = "operator" | "venture" | "loop" | "skill";

async function writeModalEvent(opts: {
  archetype: ModalArchetype;
  scopeId: string;
  scopeType: ModalScopeType;
  actionId: string;
}): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("modal_events")
    .insert({
      archetype: opts.archetype,
      scope_id: opts.scopeId,
      scope_type: opts.scopeType,
      action_id: opts.actionId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`modal_events insert failed: ${error?.message ?? "unknown"}`);
  }
  return data.id as string;
}

async function writeEscalation(opts: {
  actionId: string;
  skillId: string;
  reason: string;
  triggerType: "guardrail_breach" | "anomaly" | "classifier_fail" | "config_error";
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.from("escalations").insert({
    action_id: opts.actionId,
    skill_id: opts.skillId,
    reason: opts.reason,
    trigger_type: opts.triggerType,
  });
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * executeToolCall — the single enforcement point for all autonomy decisions.
 *
 * Every Loop invocation and external tool action must call this before
 * proceeding. The function:
 *   1. Checks the kill switch (global override).
 *   2. Resolves the effective autonomy level via scope precedence.
 *   3. Resolves the guardrail set for this skill + venture.
 *   4. Checks guardrails — fail-closed on breach.
 *   5. Runs anomaly stubs (v1: always null; B.4 wires real logic).
 *   6. Writes an `actions` row BEFORE invoking any tool (fail-closed on error).
 *   7. Routes by level: advise/gate → modal event; operate non-gate/steward → execute.
 *
 * Returns a discriminated union so callers know whether the tool actually ran.
 */
export async function executeToolCall(
  input: ToolCallInput,
): Promise<ToolCallResult> {
  const startedAt = Date.now();
  let actionId: string | undefined;

  try {
    // 1. Kill switch — overrides everything.
    const killed = await checkKillSwitch(input.operatorId);

    // 2. Resolve effective level.
    const resolved = killed
      ? ({
          level: "advise" as const,
          hardAdviseOnly: false,
          resolvedFrom: "operator" as const,
        })
      : await resolveAutonomyLevel(input.skill, input.ventureId);
    const effectiveLevel = resolved.level;

    // 3. Resolve guardrails.
    const guardrails = await resolveGuardrails(input.skill, input.ventureId);

    // 4. Check guardrails.
    const breach = checkGuardrails(input.tool, input.params, guardrails);

    // 5. Anomaly detection (v1 stubs; always null).
    // anomaly is typed as null here; B.4 changes return type to string | null.
    const anomaly = detectAnomaly(input.tool, input.params, input.skill);

    // Determine whether a modal needs to surface.
    const needsEscalation = breach !== null || anomaly !== null;
    const needsDecisionModal =
      effectiveLevel === "advise" ||
      (effectiveLevel === "operate" && isGate(input.tool));
    const modalSurfaced = needsDecisionModal || needsEscalation;

    // 6. Write actions row — fail-closed.
    actionId = await writeActionsRow({
      skillId: input.skill.id,
      ventureId: input.ventureId,
      tool: input.tool,
      params: input.params,
      autonomyLevel: effectiveLevel,
      modalSurfaced,
    });

    // 7a. Guardrail breach → escalation modal.
    if (breach !== null) {
      await writeEscalation({
        actionId,
        skillId: input.skill.id,
        reason: breach.detail,
        triggerType: "guardrail_breach",
      });
      const modalEventId = await writeModalEvent({
        archetype: "escalation",
        scopeId: input.ventureId,
        scopeType: "venture",
        actionId,
      });
      await finalizeActionsRow(actionId, { durationMs: Date.now() - startedAt });
      return {
        ok: true,
        executed: false,
        actionId,
        reason: "guardrail_breach",
        modalEventId,
      };
    }

    // 7b. Anomaly → escalation modal (stub; always skipped in v1).
    if (anomaly !== null) {
      const modalEventId = await writeModalEvent({
        archetype: "escalation",
        scopeId: input.ventureId,
        scopeType: "venture",
        actionId,
      });
      await finalizeActionsRow(actionId, { durationMs: Date.now() - startedAt });
      return {
        ok: true,
        executed: false,
        actionId,
        reason: "advise",
        modalEventId,
      };
    }

    // 7c. Decision modal (advise level or operate gate).
    if (needsDecisionModal) {
      const modalEventId = await writeModalEvent({
        archetype: "decision",
        scopeId: input.skill.id,
        scopeType: "skill",
        actionId,
      });
      await finalizeActionsRow(actionId, { durationMs: Date.now() - startedAt });
      const reason = (
        killed ? "kill_switch"
        : effectiveLevel === "advise" ? "advise"
        : "operate_gate"
      ) as "kill_switch" | "advise" | "operate_gate";
      return { ok: true, executed: false, actionId, reason, modalEventId };
    }

    // 7d. Execute (operate non-gate or steward).
    await finalizeActionsRow(actionId, {
      result: { ok: true },
      durationMs: Date.now() - startedAt,
    });
    return { ok: true, executed: true, actionId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "gateway error";
    if (actionId) {
      await finalizeActionsRow(actionId, {
        error: message,
        durationMs: Date.now() - startedAt,
      }).catch(() => {/* ignore secondary error */});
    }
    return { ok: false, actionId, error: message };
  }
}
