// Unit tests for the B.4 trust ratchet.
// Verifies promotion eligibility thresholds and demotion logic.
// Mocks Supabase and the skills registry — no live DB required.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Supabase mock ────────────────────────────────────────────────────────────

type MockRow = Record<string, unknown>;
const mockRows: Record<string, MockRow[]> = {};
const mockInsertCapture: { table: string; rows: MockRow[] }[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildQueryMock(tableName: string): any {
  const getRows = () => mockRows[tableName] ?? [];

  const chain: Record<string, unknown> = {};

  const insertFn = (rows: MockRow | MockRow[]) => {
    const arr = Array.isArray(rows) ? rows : [rows];
    mockInsertCapture.push({ table: tableName, rows: arr });
    return chain;
  };

  Object.assign(chain, {
    select: () => chain,
    insert: insertFn,
    update: () => chain,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    is: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    // `await supabase.from(...).insert(...)` hits this path.
    // Returns both data and count so selects and inserts both resolve cleanly.
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({
        data: getRows(),
        count: getRows().length,
        error: null,
      }).then(resolve, reject),
    single: () => Promise.resolve({ data: getRows()[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: getRows()[0] ?? null, error: null }),
  });

  return chain;
}

const fromMock = vi.fn((table: string) => buildQueryMock(table));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

// ─── Gateway mock (resolveAutonomyLevel) ──────────────────────────────────────

let mockLevel: "advise" | "operate" | "steward" = "advise";

vi.mock("@/lib/autonomy/gateway", () => ({
  resolveAutonomyLevel: vi.fn(async () => ({
    level: mockLevel,
    hardAdviseOnly: false,
    resolvedFrom: "skill_default",
  })),
  writeEvalRun: vi.fn(async () => {}),
}));

// ─── Skills registry mock ─────────────────────────────────────────────────────

vi.mock("@/lib/autonomy/skills-registry", () => ({
  getSkillDef: vi.fn(() => ({
    id: "test-skill",
    loopId: "01-test",
    level: "advise" as const,
    hardAdviseOnly: false,
    budgetCents: 50,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setRows(table: string, rows: MockRow[]) {
  mockRows[table] = rows;
}

function clearAll() {
  for (const k of Object.keys(mockRows)) delete mockRows[k];
  mockInsertCapture.length = 0;
  fromMock.mockClear();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkRatchetEligibility", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  test("not eligible when fewer than 20 eval_runs exist", async () => {
    mockLevel = "advise";
    setRows("eval_runs", Array.from({ length: 15 }, () => ({ outcome: "approved" })));

    const { checkRatchetEligibility } = await import("@/lib/autonomy/ratchet");
    const result = await checkRatchetEligibility("test-skill", "venture-1");
    expect(result.eligible).toBe(false);
  });

  test("eligible when 20 consecutive approvals with <2 rejections", async () => {
    mockLevel = "advise";
    setRows("eval_runs", Array.from({ length: 20 }, () => ({ outcome: "approved" })));

    const { checkRatchetEligibility } = await import("@/lib/autonomy/ratchet");
    const result = await checkRatchetEligibility("test-skill", "venture-1");
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.fromLevel).toBe("advise");
      expect(result.toLevel).toBe("operate");
      expect(result.approvals).toBe(20);
    }
  });

  test("not eligible when rejections exceed tolerance", async () => {
    mockLevel = "advise";
    const runs = Array.from({ length: 18 }, () => ({ outcome: "approved" }));
    runs.push({ outcome: "rejected" }, { outcome: "rejected" });
    setRows("eval_runs", runs);

    const { checkRatchetEligibility } = await import("@/lib/autonomy/ratchet");
    const result = await checkRatchetEligibility("test-skill", "venture-1");
    expect(result.eligible).toBe(false);
  });

  test("eligible for operate→steward with 50 approvals and <3 rejections", async () => {
    mockLevel = "operate";
    setRows("eval_runs", Array.from({ length: 50 }, () => ({ outcome: "approved" })));

    const { checkRatchetEligibility } = await import("@/lib/autonomy/ratchet");
    const result = await checkRatchetEligibility("test-skill", "venture-1");
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.toLevel).toBe("steward");
    }
  });

  test("not eligible for steward-level skill (no higher level)", async () => {
    mockLevel = "steward";
    setRows("eval_runs", Array.from({ length: 50 }, () => ({ outcome: "approved" })));

    const { checkRatchetEligibility } = await import("@/lib/autonomy/ratchet");
    const result = await checkRatchetEligibility("test-skill", "venture-1");
    expect(result.eligible).toBe(false);
  });
});

describe("checkDemotionThreshold", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  test("no demotion when skill is already at advise", async () => {
    mockLevel = "advise";
    setRows("eval_runs", [{ outcome: "rejected" }, { outcome: "rejected" }, { outcome: "rejected" }]);

    const { checkDemotionThreshold } = await import("@/lib/autonomy/ratchet");
    await checkDemotionThreshold("test-skill", "venture-1");
    expect(mockInsertCapture.find((c) => c.table === "autonomy_levels")).toBeUndefined();
  });

  test("demotes when rejections exceed tolerance at operate level", async () => {
    mockLevel = "operate";
    // Demotion threshold for operate→advise: advise threshold (20/2), so >2 rejections in last 10
    const runs = Array.from({ length: 10 }, () => ({ outcome: "approved" }));
    runs[0] = { outcome: "rejected" };
    runs[1] = { outcome: "rejected" };
    runs[2] = { outcome: "rejected" };
    setRows("eval_runs", runs);

    const { checkDemotionThreshold } = await import("@/lib/autonomy/ratchet");
    await checkDemotionThreshold("test-skill", "venture-1");

    const autonomyInsert = mockInsertCapture.find((c) => c.table === "autonomy_levels");
    expect(autonomyInsert).toBeDefined();
    expect(autonomyInsert?.rows[0]?.level).toBe("advise");
  });
});

describe("maybeFirePromotionModal", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  test("does not fire if not eligible", async () => {
    mockLevel = "advise";
    setRows("eval_runs", Array.from({ length: 10 }, () => ({ outcome: "approved" })));

    const { maybeFirePromotionModal } = await import("@/lib/autonomy/ratchet");
    await maybeFirePromotionModal("test-skill", "venture-1");

    expect(mockInsertCapture.find((c) => c.table === "modal_events")).toBeUndefined();
  });

  test("fires a promotion modal when eligible and no recent modal exists", async () => {
    mockLevel = "advise";
    setRows("eval_runs", Array.from({ length: 20 }, () => ({ outcome: "approved" })));
    setRows("modal_events", []); // no recent modal

    const { maybeFirePromotionModal } = await import("@/lib/autonomy/ratchet");
    await maybeFirePromotionModal("test-skill", "venture-1");

    const modalInsert = mockInsertCapture.find((c) => c.table === "modal_events");
    expect(modalInsert).toBeDefined();
    expect(modalInsert?.rows[0]?.archetype).toBe("promotion");
  });

  test("idempotent — does not fire if recent promotion modal exists", async () => {
    mockLevel = "advise";
    setRows("eval_runs", Array.from({ length: 20 }, () => ({ outcome: "approved" })));
    setRows("modal_events", [{ id: "existing", archetype: "promotion" }]);

    const { maybeFirePromotionModal } = await import("@/lib/autonomy/ratchet");
    await maybeFirePromotionModal("test-skill", "venture-1");

    expect(mockInsertCapture.find((c) => c.table === "modal_events")).toBeUndefined();
  });
});
