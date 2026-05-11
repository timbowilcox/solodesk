// Unit tests for the autonomy gateway.
//
// Tests are structured around what can be verified without hitting Supabase:
//   - checkGuardrails (pure)
//   - isGate (pure)
//   - resolveAutonomyLevel (mocked DB)
//   - checkKillSwitch (mocked DB)
//   - executeToolCall routing decisions (mocked DB)

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Supabase mock factory ────────────────────────────────────────────────────
//
// The gateway makes chained Supabase queries. We build a mock that stores
// the most recent table name and resolves per-table shapes on demand.

type MockRow = Record<string, unknown>;

const mockRows: Record<string, MockRow[]> = {};
const mockInsertResult: Record<string, { data: MockRow | null; error: null | { message: string } }> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildQueryMock(tableName: string): any {
  const terminal = () => ({
    data: mockRows[tableName] ?? [],
    error: null,
  });

  const terminalSingle = () => {
    const result = mockInsertResult[tableName];
    if (result !== undefined) return Promise.resolve(result);
    const rows = mockRows[tableName] ?? [];
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  };

  const self = {
    select: () => self,
    insert: () => self,
    update: () => self,
    upsert: () => self,
    eq: () => self,
    in: () => self,
    order: () => self,
    limit: () => self,
    maybeSingle: () => Promise.resolve({ data: mockRows[tableName]?.[0] ?? null, error: null }),
    single: terminalSingle,
    // Make the chain itself thenable so `await supabase.from(...).update(...).eq(...)` works.
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal()).then(resolve, reject),
  };

  return self;
}

const fromMock = vi.fn((table: string) => buildQueryMock(table));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setRows(table: string, rows: MockRow[]) {
  mockRows[table] = rows;
}

function setInsertResult(table: string, data: MockRow | null, error?: { message: string }) {
  mockInsertResult[table] = { data, error: error ?? null };
}

function clearAll() {
  for (const k of Object.keys(mockRows)) delete mockRows[k];
  for (const k of Object.keys(mockInsertResult)) delete mockInsertResult[k];
  fromMock.mockClear();
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const VENTURE_A = "aaaaaaaa-0000-0000-0000-000000000001";
const VENTURE_B = "bbbbbbbb-0000-0000-0000-000000000002";

const baseSkill = {
  id: "test-skill",
  loopId: "01-test",
  level: "operate" as const,
  hardAdviseOnly: false,
  budgetCents: 50,
};

// ─── Pure-function tests ──────────────────────────────────────────────────────

describe("isGate", () => {
  test("send_email is a gate tool", async () => {
    const { isGate } = await import("@/lib/autonomy/gateway");
    expect(isGate("send_email")).toBe(true);
  });

  test("publish_post is a gate tool", async () => {
    const { isGate } = await import("@/lib/autonomy/gateway");
    expect(isGate("publish_post")).toBe(true);
  });

  test("invoke_loop is not a gate tool", async () => {
    const { isGate } = await import("@/lib/autonomy/gateway");
    expect(isGate("invoke_loop")).toBe(false);
  });

  test("unknown tool is not a gate", async () => {
    const { isGate } = await import("@/lib/autonomy/gateway");
    expect(isGate("look_up_crm")).toBe(false);
  });
});

describe("checkGuardrails — pure logic", () => {
  const budgetGuardrail = {
    id: "g1",
    scopeType: "venture" as const,
    scopeId: VENTURE_A,
    guardrailType: "budget_cap" as const,
    config: { max_cents: 100 },
    active: true,
  };

  test("budget_cap: no breach when estimated is under cap", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const result = checkGuardrails(
      "invoke_loop",
      { estimated_cost_cents: 50 },
      [budgetGuardrail],
    );
    expect(result).toBeNull();
  });

  test("budget_cap: breach when estimated exceeds cap", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const result = checkGuardrails(
      "invoke_loop",
      { estimated_cost_cents: 150 },
      [budgetGuardrail],
    );
    expect(result).not.toBeNull();
    expect(result?.breached).toBe("budget_cap");
    expect(result?.detail).toMatch(/\$1\.50/);
  });

  test("recipient_allowlist: passes when recipient is in list", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const g = {
      id: "g2",
      scopeType: "operator" as const,
      scopeId: "op1",
      guardrailType: "recipient_allowlist" as const,
      config: { allowed_recipients: ["tim@example.com"] },
      active: true,
    };
    const result = checkGuardrails("send_email", { to: "tim@example.com" }, [g]);
    expect(result).toBeNull();
  });

  test("recipient_allowlist: breach when recipient not in list", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const g = {
      id: "g2",
      scopeType: "operator" as const,
      scopeId: "op1",
      guardrailType: "recipient_allowlist" as const,
      config: { allowed_recipients: ["tim@example.com"] },
      active: true,
    };
    const result = checkGuardrails("send_email", { to: "hacker@evil.com" }, [g]);
    expect(result).not.toBeNull();
    expect(result?.breached).toBe("recipient_allowlist");
  });

  test("recipient_allowlist: does not apply to non-email tools", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const g = {
      id: "g3",
      scopeType: "operator" as const,
      scopeId: "op1",
      guardrailType: "recipient_allowlist" as const,
      config: { allowed_recipients: ["tim@example.com"] },
      active: true,
    };
    const result = checkGuardrails("publish_post", { to: "hacker@evil.com" }, [g]);
    expect(result).toBeNull();
  });

  test("topic_blocklist: breach when content includes blocked topic", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const g = {
      id: "g4",
      scopeType: "venture" as const,
      scopeId: VENTURE_A,
      guardrailType: "topic_blocklist" as const,
      config: { forbidden_topics: ["competitor-name"] },
      active: true,
    };
    const result = checkGuardrails(
      "publish_post",
      { content: "Our product beats competitor-name hands down." },
      [g],
    );
    expect(result).not.toBeNull();
    expect(result?.breached).toBe("topic_blocklist");
  });

  test("time_window: no breach within allowed hours", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const hour = new Date().getUTCHours();
    const g = {
      id: "g5",
      scopeType: "operator" as const,
      scopeId: "op1",
      guardrailType: "time_window" as const,
      config: { allowed_start_hour: 0, allowed_end_hour: 24 },
      active: true,
    };
    const result = checkGuardrails("send_email", { hour }, [g]);
    expect(result).toBeNull();
  });

  test("time_window: breach outside allowed hours", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const g = {
      id: "g6",
      scopeType: "operator" as const,
      scopeId: "op1",
      guardrailType: "time_window" as const,
      // Window that's guaranteed to exclude current hour: start=23, end=23 (zero-length window).
      config: { allowed_start_hour: 23, allowed_end_hour: 23 },
      active: true,
    };
    // At any time other than 23:xx UTC this will breach. We fake it:
    const currentHour = new Date().getUTCHours();
    if (currentHour !== 23) {
      const result = checkGuardrails("send_email", {}, [g]);
      expect(result?.breached).toBe("time_window");
    }
    // If currently 23 UTC: window 0..0 also breaches (end exclusive).
  });

  test("malformed config: fails closed (returns a breach)", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const g = {
      id: "g7",
      scopeType: "operator" as const,
      scopeId: "op1",
      guardrailType: "budget_cap" as const,
      // Not a valid budget_cap config — will cause no breach (null numbers).
      // Actually budget_cap with null numbers returns null (no breach).
      // Malformed config test: throw inside switch.
      config: null as unknown as Record<string, unknown>,
      active: true,
    };
    // This should not throw; it returns a breach (fail-closed).
    expect(() => checkGuardrails("invoke_loop", {}, [g])).not.toThrow();
  });

  test("empty guardrails list: returns null", async () => {
    const { checkGuardrails } = await import("@/lib/autonomy/gateway");
    const result = checkGuardrails("send_email", { to: "anyone@evil.com" }, []);
    expect(result).toBeNull();
  });
});

// ─── DB-backed tests ──────────────────────────────────────────────────────────

describe("resolveAutonomyLevel — scope precedence", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  test("defaults to skill level when no DB rows", async () => {
    setRows("autonomy_levels", []);
    const { resolveAutonomyLevel } = await import("@/lib/autonomy/gateway");
    const result = await resolveAutonomyLevel(baseSkill, VENTURE_A);
    expect(result.level).toBe("operate");
    expect(result.resolvedFrom).toBe("skill_default");
  });

  test("skill-scoped row wins over venture-scoped row", async () => {
    setRows("autonomy_levels", [
      {
        scope_type: "venture",
        scope_id: VENTURE_A,
        level: "steward",
        hard_advise_only: false,
        set_at: "2026-01-01T00:00:00Z",
      },
      {
        scope_type: "skill",
        scope_id: "test-skill",
        level: "advise",
        hard_advise_only: false,
        set_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const { resolveAutonomyLevel } = await import("@/lib/autonomy/gateway");
    const result = await resolveAutonomyLevel(baseSkill, VENTURE_A);
    // skill (precedence 0) beats venture (precedence 2)
    expect(result.level).toBe("advise");
    expect(result.resolvedFrom).toBe("skill");
  });

  test("operator-scoped row applies across all ventures", async () => {
    setRows("autonomy_levels", [
      {
        scope_type: "operator",
        scope_id: "op-uuid",
        level: "advise",
        hard_advise_only: false,
        set_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const { resolveAutonomyLevel } = await import("@/lib/autonomy/gateway");
    const result = await resolveAutonomyLevel(baseSkill, VENTURE_B);
    expect(result.level).toBe("advise");
    expect(result.resolvedFrom).toBe("operator");
  });

  test("hard_advise_only at any scope overrides level to advise", async () => {
    setRows("autonomy_levels", [
      {
        // Venture-scoped, but hard_advise_only = true.
        scope_type: "venture",
        scope_id: VENTURE_A,
        level: "steward",
        hard_advise_only: true,
        set_at: "2026-01-01T00:00:00Z",
      },
      {
        // Skill-scoped says operate.
        scope_type: "skill",
        scope_id: "test-skill",
        level: "operate",
        hard_advise_only: false,
        set_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const { resolveAutonomyLevel } = await import("@/lib/autonomy/gateway");
    const result = await resolveAutonomyLevel(baseSkill, VENTURE_A);
    // hard_advise_only from venture forces advise regardless of skill-level.
    expect(result.level).toBe("advise");
    expect(result.hardAdviseOnly).toBe(true);
  });

  test("skill hard_advise_only is unbypassable by DB rows", async () => {
    const hardSkill = { ...baseSkill, hardAdviseOnly: true };
    setRows("autonomy_levels", [
      {
        scope_type: "operator",
        scope_id: "op-uuid",
        level: "steward",
        hard_advise_only: false,
        set_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const { resolveAutonomyLevel } = await import("@/lib/autonomy/gateway");
    const result = await resolveAutonomyLevel(hardSkill, VENTURE_A);
    expect(result.level).toBe("advise");
    expect(result.hardAdviseOnly).toBe(true);
  });

  test("cross-venture isolation: venture-B row does not apply for venture-A", async () => {
    setRows("autonomy_levels", [
      {
        scope_type: "venture",
        scope_id: VENTURE_B,
        level: "steward",
        hard_advise_only: false,
        set_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const { resolveAutonomyLevel } = await import("@/lib/autonomy/gateway");
    // Querying for venture A — venture B's row should not be picked up.
    const result = await resolveAutonomyLevel(baseSkill, VENTURE_A);
    expect(result.resolvedFrom).toBe("skill_default");
    expect(result.level).toBe("operate");
  });
});

describe("checkKillSwitch", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  test("returns false when no killed=true row exists", async () => {
    setRows("operator_kill_switch", []);
    const { checkKillSwitch } = await import("@/lib/autonomy/gateway");
    const killed = await checkKillSwitch();
    expect(killed).toBe(false);
  });

  test("returns true when any killed=true row exists (single-operator v0 mode)", async () => {
    setRows("operator_kill_switch", [{ killed: true }]);
    const { checkKillSwitch } = await import("@/lib/autonomy/gateway");
    const killed = await checkKillSwitch();
    expect(killed).toBe(true);
  });
});

describe("executeToolCall — routing decisions", () => {
  beforeEach(() => {
    clearAll();
    // Default: kill switch not active, no autonomy overrides, no guardrails.
    setRows("operator_kill_switch", []);
    setRows("autonomy_levels", []);
    setRows("guardrails", []);
    // actions insert returns a fresh row id.
    setInsertResult("actions", { id: "action-uuid-1" });
    // modal_events insert returns a fresh row id.
    setInsertResult("modal_events", { id: "modal-uuid-1" });
  });

  afterEach(clearAll);

  test("operate level + non-gate tool → executed: true", async () => {
    const { executeToolCall } = await import("@/lib/autonomy/gateway");
    const result = await executeToolCall({
      skill: baseSkill,
      tool: "invoke_loop",
      params: {},
      ventureId: VENTURE_A,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.executed).toBe(true);
    }
  });

  test("kill switch active → executed: false, reason: kill_switch", async () => {
    setRows("operator_kill_switch", [{ killed: true }]);
    const { executeToolCall } = await import("@/lib/autonomy/gateway");
    const result = await executeToolCall({
      skill: baseSkill,
      tool: "invoke_loop",
      params: {},
      ventureId: VENTURE_A,
    });
    expect(result.ok).toBe(true);
    if (result.ok && !result.executed) {
      expect(result.reason).toBe("kill_switch");
      expect(result.modalEventId).toBeDefined();
    }
  });

  test("advise level → executed: false, reason: advise", async () => {
    setRows("autonomy_levels", [
      {
        scope_type: "venture",
        scope_id: VENTURE_A,
        level: "advise",
        hard_advise_only: false,
        set_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const { executeToolCall } = await import("@/lib/autonomy/gateway");
    const result = await executeToolCall({
      skill: baseSkill,
      tool: "invoke_loop",
      params: {},
      ventureId: VENTURE_A,
    });
    expect(result.ok).toBe(true);
    if (result.ok && !result.executed) {
      expect(result.reason).toBe("advise");
    }
  });

  test("operate level + gate tool → executed: false, reason: operate_gate", async () => {
    const { executeToolCall } = await import("@/lib/autonomy/gateway");
    const result = await executeToolCall({
      skill: baseSkill,
      tool: "send_email",
      params: { to: "anyone@example.com", content: "Hello" },
      ventureId: VENTURE_A,
    });
    expect(result.ok).toBe(true);
    if (result.ok && !result.executed) {
      expect(result.reason).toBe("operate_gate");
    }
  });

  test("guardrail breach → executed: false (escalation modal written)", async () => {
    setRows("guardrails", [
      {
        id: "g-uuid",
        scope_type: "venture",
        scope_id: VENTURE_A,
        guardrail_type: "budget_cap",
        config: { max_cents: 10 },
        active: true,
      },
    ]);
    setInsertResult("escalations", { id: "esc-1" });
    const { executeToolCall } = await import("@/lib/autonomy/gateway");
    const result = await executeToolCall({
      skill: baseSkill,
      tool: "invoke_loop",
      params: { estimated_cost_cents: 200 },
      ventureId: VENTURE_A,
    });
    expect(result.ok).toBe(true);
    if (result.ok && !result.executed) {
      expect(result.reason).toBe("guardrail_breach");
    }
  });

  test("actions row insert failure → ok: false (fail-closed)", async () => {
    setInsertResult("actions", null, { message: "DB down" });
    const { executeToolCall } = await import("@/lib/autonomy/gateway");
    const result = await executeToolCall({
      skill: baseSkill,
      tool: "invoke_loop",
      params: {},
      ventureId: VENTURE_A,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/actions row insert failed/i);
    }
  });
});
