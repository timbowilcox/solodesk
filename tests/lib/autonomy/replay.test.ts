// Unit tests for the deferred-action replay dispatcher.
// Verifies the full status-transition lifecycle, audit-trail writes,
// kill-switch enforcement, concurrency guard, and escalation logic.
// Mocks Supabase, the gateway kill switch, and the loop runner — no live DB.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Supabase mock ────────────────────────────────────────────────────────────

type MockRow = Record<string, unknown>;
const mockRows: Record<string, MockRow[]> = {};
const mockInsertCapture: { table: string; rows: MockRow[] }[] = [];
const mockUpdateCapture: { table: string; data: MockRow }[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildQueryMock(tableName: string): any {
  const getRows = () => mockRows[tableName] ?? [];

  const chain: Record<string, unknown> = {};

  const insertFn = (rows: MockRow | MockRow[]) => {
    const arr = Array.isArray(rows) ? rows : [rows];
    mockInsertCapture.push({ table: tableName, rows: arr });
    return chain;
  };

  const updateFn = (data: MockRow) => {
    mockUpdateCapture.push({ table: tableName, data });
    return chain;
  };

  Object.assign(chain, {
    select: () => chain,
    insert: insertFn,
    update: updateFn,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    is: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({
        data: getRows(),
        count: getRows().length,
        error: null,
      }).then(resolve, reject),
    single: () => Promise.resolve({ data: getRows()[0] ?? null, error: null }),
    maybeSingle: () =>
      Promise.resolve({ data: getRows()[0] ?? null, error: null }),
  });

  return chain;
}

const fromMock = vi.fn((table: string) => buildQueryMock(table));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

// ─── Gateway mock (kill switch only) ─────────────────────────────────────────

let mockKilled = false;

vi.mock("@/lib/autonomy/gateway", () => ({
  checkKillSwitch: vi.fn(async () => mockKilled),
}));

// ─── Runner mock ──────────────────────────────────────────────────────────────

let runnerShouldThrow = false;
let runnerError = "runner error";

vi.mock("@/lib/loops/runner", () => ({
  runStreamingLoop: vi.fn(async () => {
    if (runnerShouldThrow) throw new Error(runnerError);
  }),
}));

// ─── Config mock ──────────────────────────────────────────────────────────────

vi.mock("@/lib/loops/config", () => ({
  SUPPORTED_LOOPS: {
    "01-strategy": {
      loopName: "01-strategy",
      skillPrompt: "mock prompt",
      documentType: "decision",
      budgetTokens: 25_000,
      budgetCents: 75,
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VENTURE_ID = "00000000-0000-0000-0000-000000000001";
const ACTION_ID = "00000000-0000-0000-0000-000000000002";
const MODAL_EVENT_ID = "00000000-0000-0000-0000-000000000003";
const DEFERRED_ID = "00000000-0000-0000-0000-000000000004";

function makeDeferred(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: DEFERRED_ID,
    skill_id: "01-strategy",
    tool: "invoke_loop",
    params: {
      loopId: "01-strategy",
      task: "Write a strategy document",
      title: "Strategy Q2",
      ventureId: VENTURE_ID,
    },
    venture_id: VENTURE_ID,
    action_id: ACTION_ID,
    modal_event_id: MODAL_EVENT_ID,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

import { replayApprovedTool } from "@/lib/autonomy/replay";

beforeEach(() => {
  for (const key of Object.keys(mockRows)) delete mockRows[key];
  mockInsertCapture.length = 0;
  mockUpdateCapture.length = 0;
  fromMock.mockClear();
  mockKilled = false;
  runnerShouldThrow = false;
  runnerError = "runner error";

  // Default: original action row has autonomy_level='operate'.
  mockRows["actions"] = [{ autonomy_level: "operate" }];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("replayApprovedTool", () => {
  test("happy path: invoke_loop executes, status→executed, actions row written", async () => {
    mockRows["deferred_actions"] = [makeDeferred()];

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(true);

    const actionsInsert = mockInsertCapture.find((c) => c.table === "actions");
    expect(actionsInsert).toBeDefined();
    const row = actionsInsert!.rows[0]!;
    expect(row.via_modal).toBe(true);
    expect(row.deferred_action_id).toBe(DEFERRED_ID);
    expect(row.modal_event_id).toBe(MODAL_EVENT_ID);
    expect(row.autonomy_level).toBe("operate");
    expect(row.skill_id).toBe("01-strategy");
    expect(row.tool).toBe("invoke_loop");
    expect(row.modal_surfaced).toBe(false);

    const statusUpdate = mockUpdateCapture.find(
      (u) => u.table === "deferred_actions" && u.data.status === "executed",
    );
    expect(statusUpdate).toBeDefined();
  });

  test("tool='' (Promotion no-op) → result.ok=true, status→executed, no handler called", async () => {
    mockRows["deferred_actions"] = [makeDeferred({ tool: "" })];

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(true);

    // No actions or escalations inserted — Promotion has no tool to replay.
    expect(mockInsertCapture.some((c) => c.table === "actions")).toBe(false);
    expect(mockInsertCapture.some((c) => c.table === "escalations")).toBe(false);

    const statusUpdate = mockUpdateCapture.find(
      (u) => u.table === "deferred_actions" && u.data.status === "executed",
    );
    expect(statusUpdate).toBeDefined();
  });

  test("unknown tool name → result.error='tool_not_found', no escalation", async () => {
    mockRows["deferred_actions"] = [makeDeferred({ tool: "some_unknown_tool" })];

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("tool_not_found");

    expect(mockInsertCapture.some((c) => c.table === "escalations")).toBe(false);

    const statusUpdate = mockUpdateCapture.find(
      (u) => u.table === "deferred_actions" && u.data.status === "failed",
    );
    expect(statusUpdate?.data.error).toBe("tool_not_found");
  });

  test("handler throws → status=failed, escalation written, result.ok=false", async () => {
    mockRows["deferred_actions"] = [makeDeferred()];
    runnerShouldThrow = true;
    runnerError = "anthropic timeout";

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("anthropic timeout");

    const escalation = mockInsertCapture.find((c) => c.table === "escalations");
    expect(escalation).toBeDefined();
    expect(escalation!.rows[0]!.trigger_type).toBe("config_error");
    expect(escalation!.rows[0]!.skill_id).toBe("01-strategy");

    const statusUpdate = mockUpdateCapture.find(
      (u) => u.table === "deferred_actions" && u.data.status === "failed",
    );
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate!.data.error).toBe("anthropic timeout");
  });

  test("kill switch engaged → status=failed, error='kill_switch_engaged', no escalation", async () => {
    mockRows["deferred_actions"] = [makeDeferred()];
    mockKilled = true;

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("kill_switch_engaged");

    // Kill switch is not an unexpected error — no escalation.
    expect(mockInsertCapture.some((c) => c.table === "escalations")).toBe(false);

    const statusUpdate = mockUpdateCapture.find(
      (u) =>
        u.table === "deferred_actions" && u.data.status === "failed",
    );
    expect(statusUpdate?.data.error).toBe("kill_switch_engaged");
  });

  test("concurrent claim: row not in approved state → skipped, result.ok=false", async () => {
    // maybeSingle() returns null when no rows are present.
    mockRows["deferred_actions"] = [];

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("skipped");

    // No inserts — function exits before any tool dispatch.
    expect(mockInsertCapture.length).toBe(0);
    // The claim attempt UPDATE is issued (SQL runs, finds no row), but no
    // subsequent status transitions should happen after the early return.
    const terminalUpdates = mockUpdateCapture.filter(
      (u) =>
        u.table === "deferred_actions" &&
        (u.data.status === "failed" || u.data.status === "executed"),
    );
    expect(terminalUpdates.length).toBe(0);
  });

  test("invoke_loop with missing task param → ok:false, status=failed, no escalation", async () => {
    const brokenParams = { loopId: "01-strategy", title: "Missing Task" };
    mockRows["deferred_actions"] = [makeDeferred({ params: brokenParams })];

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("invoke_loop");

    // Controlled failure from handler (ok:false return, not throw) — no escalation.
    expect(mockInsertCapture.some((c) => c.table === "escalations")).toBe(false);

    const statusUpdate = mockUpdateCapture.find(
      (u) => u.table === "deferred_actions" && u.data.status === "failed",
    );
    expect(statusUpdate).toBeDefined();
  });

  test("invoke_loop with unknown loopId → ok:false, status=failed, no escalation", async () => {
    const unknownLoopParams = {
      loopId: "99-nonexistent",
      task: "some task",
      title: "Test",
      ventureId: VENTURE_ID,
    };
    mockRows["deferred_actions"] = [makeDeferred({ params: unknownLoopParams })];

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("unknown loopId");

    expect(mockInsertCapture.some((c) => c.table === "escalations")).toBe(false);

    const statusUpdate = mockUpdateCapture.find(
      (u) => u.table === "deferred_actions" && u.data.status === "failed",
    );
    expect(statusUpdate).toBeDefined();
  });

  test("actions row has autonomy_level from original actions row, not hardcoded", async () => {
    // Override the default mock — original action was at steward level.
    mockRows["actions"] = [{ autonomy_level: "steward" }];
    mockRows["deferred_actions"] = [makeDeferred()];

    const result = await replayApprovedTool(DEFERRED_ID);

    expect(result.ok).toBe(true);

    const actionsInsert = mockInsertCapture.find((c) => c.table === "actions");
    expect(actionsInsert!.rows[0]!.autonomy_level).toBe("steward");
  });
});
