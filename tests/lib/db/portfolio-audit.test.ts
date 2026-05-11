// Unit tests for the B.5 portfolio audit data layer.
// Tests: auditDateKey formatting, computePortfolioFindings logic,
// generatePortfolioAudit idempotency and highSeverityCount.

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Supabase mock ────────────────────────────────────────────────────────────

type MockRow = Record<string, unknown>;
const mockCounts: Record<string, number> = {};
const mockRows: Record<string, MockRow[]> = {};
const mockInserts: { table: string; rows: MockRow[] }[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMock(table: string): any {
  let _countOverride: number | null = null;
  const self: Record<string, unknown> = {};

  const terminal = () =>
    Promise.resolve({
      data: mockRows[table] ?? [],
      count: _countOverride ?? mockCounts[table] ?? 0,
      error: null,
    });

  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === "exact") {
        // return countable chain
      }
      return chain;
    },
    insert: (rows: MockRow | MockRow[]) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      mockInserts.push({ table, rows: arr });
      return chain;
    },
    update: () => chain,
    eq: () => chain,
    neq: () => chain,
    is: () => chain,
    lt: () => chain,
    lte: () => chain,
    gte: () => chain,
    contains: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve({ data: (mockRows[table] ?? [])[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: (mockRows[table] ?? [])[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      terminal().then(resolve, reject),
  };

  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (t: string) => buildMock(t) }),
}));

// ─── listVentures mock ────────────────────────────────────────────────────────

const mockVentures: MockRow[] = [];

vi.mock("@/lib/db/ventures", () => ({
  listVentures: vi.fn(async () => mockVentures),
}));

// ─── createDocument mock ──────────────────────────────────────────────────────

const createDocumentMock = vi.fn(async () => ({
  ok: true as const,
  documentId: "doc-created-123",
}));

vi.mock("@/lib/db/documents", () => ({
  createDocument: createDocumentMock,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setCount(table: string, count: number) {
  mockCounts[table] = count;
}

function setRows(table: string, rows: MockRow[]) {
  mockRows[table] = rows;
}

function clearAll() {
  for (const k of Object.keys(mockCounts)) delete mockCounts[k];
  for (const k of Object.keys(mockRows)) delete mockRows[k];
  mockInserts.length = 0;
  createDocumentMock.mockClear();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auditDateKey", () => {
  test("returns YYYY-MM-DD in Sydney timezone", async () => {
    const { auditDateKey } = await import("@/lib/db/portfolio-audit");
    const key = auditDateKey(new Date("2026-05-12T10:00:00Z")); // 10:00 UTC = 20:00 AEST
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(key).toBe("2026-05-12");
  });

  test("uses today's date when no argument given", async () => {
    const { auditDateKey } = await import("@/lib/db/portfolio-audit");
    const key = auditDateKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("computePortfolioFindings", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  test("returns empty array when no active ventures", async () => {
    mockVentures.length = 0;
    const { computePortfolioFindings } = await import("@/lib/db/portfolio-audit");
    const findings = await computePortfolioFindings();
    expect(findings).toHaveLength(0);
  });

  test("ignores dormant ventures", async () => {
    mockVentures.splice(0, mockVentures.length, {
      id: "v-1", slug: "kounta", name: "Kounta", phase: "dormant", loops_enabled: [],
    });
    const { computePortfolioFindings } = await import("@/lib/db/portfolio-audit");
    const findings = await computePortfolioFindings();
    expect(findings).toHaveLength(0);
  });

  test("flags stale active decisions as high severity when >3", async () => {
    mockVentures.splice(0, mockVentures.length, {
      id: "v-1", slug: "kounta", name: "Kounta", phase: "launch", loops_enabled: [],
    });
    setCount("decisions", 5);
    setCount("events", 10); // enough events — no low_activity finding

    const { computePortfolioFindings } = await import("@/lib/db/portfolio-audit");
    const findings = await computePortfolioFindings();
    const stale = findings.filter((f) => f.kind === "stale_priority");
    expect(stale).toHaveLength(1);
    expect(stale[0]!.severity).toBe("high");
  });

  test("flags unused_capability when loop enabled but no recent invocations", async () => {
    mockVentures.splice(0, mockVentures.length, {
      id: "v-1", slug: "kounta", name: "Kounta", phase: "launch",
      loops_enabled: ["01-strategy"],
    });
    setCount("decisions", 0);
    setCount("events", 10);
    setCount("loop_runs", 0);

    const { computePortfolioFindings } = await import("@/lib/db/portfolio-audit");
    const findings = await computePortfolioFindings();
    expect(findings.some((f) => f.kind === "unused_capability")).toBe(true);
  });
});

describe("generatePortfolioAudit", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  test("returns alreadyExisted=true when document exists for dateKey", async () => {
    setRows("documents", [{ id: "existing-doc" }]);

    const { generatePortfolioAudit } = await import("@/lib/db/portfolio-audit");
    const result = await generatePortfolioAudit({ dateKey: "2026-05-12" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyExisted).toBe(true);
      expect(result.documentId).toBe("existing-doc");
    }
    expect(createDocumentMock).not.toHaveBeenCalled();
  });

  test("creates document and returns highSeverityCount when no existing", async () => {
    setRows("documents", []); // no existing audit
    mockVentures.splice(0, mockVentures.length, {
      id: "v-1", slug: "kounta", name: "Kounta", phase: "launch", loops_enabled: [],
    });
    setCount("decisions", 5); // > 3 → high severity stale_priority
    setCount("events", 10);

    const { generatePortfolioAudit } = await import("@/lib/db/portfolio-audit");
    const result = await generatePortfolioAudit({ dateKey: "2026-05-12" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyExisted).toBe(false);
      expect(result.highSeverityCount).toBeGreaterThanOrEqual(1);
      expect(result.documentId).toBe("doc-created-123");
    }
  });

  test("returns ok=false when createDocument fails", async () => {
    setRows("documents", []);
    mockVentures.length = 0; // no findings
    createDocumentMock.mockResolvedValueOnce({ ok: false, error: "db error" } as unknown as { ok: true; documentId: string });

    const { generatePortfolioAudit } = await import("@/lib/db/portfolio-audit");
    const result = await generatePortfolioAudit({ dateKey: "2026-05-12" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("db error");
    }
  });
});
