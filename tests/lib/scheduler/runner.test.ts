import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fromMock = vi.fn();
const listVenturesMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

vi.mock("@/lib/db/ventures", () => ({
  listVentures: listVenturesMock,
}));

beforeEach(() => {
  fromMock.mockReset();
  listVenturesMock.mockReset();
});

afterEach(async () => {
  const { clearRegistryForTests } = await import("@/lib/scheduler/registry");
  clearRegistryForTests();
});

function mockLoopRunsTable(opts: { insertId?: string; updateError?: unknown }) {
  fromMock.mockImplementation((table: string) => {
    if (table !== "loop_runs") {
      throw new Error(`unexpected from(${table})`);
    }
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.single = vi.fn(async () => ({
      data: { id: opts.insertId ?? "loop-run-id" },
      error: null,
    }));
    chain.update = vi.fn(() => chain);
    chain.eq = vi.fn(async () => ({ data: null, error: opts.updateError ?? null }));
    return chain;
  });
}

describe("runSchedule — venture-portability + isolation", () => {
  test("global scope fires once with no ventureId", async () => {
    const { registerSchedule } = await import("@/lib/scheduler/registry");
    const { runSchedule } = await import("@/lib/scheduler/runner");

    let calls = 0;
    let ctxSeen: { ventureId?: string; loopRunId: string } | null = null;
    registerSchedule({
      id: "test-global",
      cron: "0 0 * * *",
      description: "global probe",
      scope: "global",
      run: async (ctx) => {
        calls += 1;
        ctxSeen = { ventureId: ctx.ventureId, loopRunId: ctx.loopRunId };
        return { ok: true, summary: "ran" };
      },
    });

    mockLoopRunsTable({ insertId: "loop-run-1" });

    const report = await runSchedule("test-global");
    expect(calls).toBe(1);
    expect(ctxSeen).toBeTruthy();
    expect(ctxSeen!.ventureId).toBeUndefined();
    expect(ctxSeen!.loopRunId).toBe("loop-run-1");
    expect(report.totalOk).toBe(1);
    expect(report.totalFailed).toBe(0);
    expect(listVenturesMock).not.toHaveBeenCalled();
  });

  test("per-venture scope fans out and skips dormant ventures", async () => {
    const { registerSchedule } = await import("@/lib/scheduler/registry");
    const { runSchedule } = await import("@/lib/scheduler/runner");

    listVenturesMock.mockResolvedValue([
      { id: "v-kounta", slug: "kounta", phase: "build" },
      { id: "v-counsel", slug: "counsel", phase: "scale" },
      { id: "v-old", slug: "old", phase: "dormant" }, // skipped
    ]);

    const seenVentures: string[] = [];
    registerSchedule({
      id: "test-per-venture",
      cron: "0 0 * * *",
      description: "per-venture probe",
      scope: "per-venture",
      run: async (ctx) => {
        if (ctx.ventureSlug) seenVentures.push(ctx.ventureSlug);
        return { ok: true, summary: "ran" };
      },
    });

    mockLoopRunsTable({ insertId: "loop-run-x" });

    const report = await runSchedule("test-per-venture");
    expect(seenVentures.sort()).toEqual(["counsel", "kounta"]);
    expect(report.invocations).toHaveLength(2);
    expect(report.totalOk).toBe(2);
  });

  test("one venture failing doesn't stop the next", async () => {
    const { registerSchedule } = await import("@/lib/scheduler/registry");
    const { runSchedule } = await import("@/lib/scheduler/runner");

    listVenturesMock.mockResolvedValue([
      { id: "v-1", slug: "alpha", phase: "build" },
      { id: "v-2", slug: "beta", phase: "build" },
    ]);

    let runCount = 0;
    registerSchedule({
      id: "test-isolation",
      cron: "0 0 * * *",
      description: "isolation probe",
      scope: "per-venture",
      run: async (ctx) => {
        runCount += 1;
        if (ctx.ventureSlug === "alpha") {
          throw new Error("boom");
        }
        return { ok: true, summary: "ok" };
      },
    });

    mockLoopRunsTable({ insertId: "loop-run-y" });

    const report = await runSchedule("test-isolation");
    expect(runCount).toBe(2);
    expect(report.invocations).toHaveLength(2);
    expect(report.totalOk).toBe(1);
    expect(report.totalFailed).toBe(1);
    const failed = report.invocations.find((i) => !i.ok);
    expect(failed?.error).toMatch(/boom/);
  });

  test("throws on unknown schedule id", async () => {
    const { runSchedule } = await import("@/lib/scheduler/runner");
    await expect(runSchedule("does-not-exist")).rejects.toThrow(
      /unknown schedule/i,
    );
  });
});
