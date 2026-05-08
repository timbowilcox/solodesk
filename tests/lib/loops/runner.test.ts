// Unit tests for the streaming-runner finalisation path.
//
// Live verification (Loop 1, 2026-05-08) caught that operator cancels
// arriving before the runner's in-loop checkCancelled poll were
// misclassified as `failed` / `drafting_orphaned` instead of
// `cancelled` / `cancelled`. Root cause: the catch block in
// `runStreamingLoop` saw the AbortError thrown by emit() (because the
// client closed the SSE stream right after POSTing /cancel) and routed
// unconditionally to the failed branch. The cancel-fix sprint extracted
// the catch logic into `finalizeFromCaughtError` and added the
// cancel_requested_at gate.
//
// These tests exercise the new helper directly:
//   1. cancel_requested_at SET → cancelled-classified, loop.cancelled event
//   2. cancel_requested_at NULL → failed-classified, loop.failed event
//      (the previously-missing terminal event is now written)
//   3. emit() throwing in either path is swallowed safely

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SseEvent } from "@/lib/loops/runner";

// --------------------------------------------------------------
// Mock supabase client builder.
//
// We only need to stub:
//   - loop_runs.select(cancel_requested_at).eq().maybeSingle()
//   - loop_runs.update({...}).eq()    (markRunTerminal / markRunFailed)
//   - documents.update({...}).eq()    (markDocumentStatus)
//   - events.insert({...})            (insertEvent)
// All other surface-area can be no-op chainable.
// --------------------------------------------------------------

type Recorded =
  | { kind: "select_loop_runs"; runId: string }
  | { kind: "update_loop_runs"; payload: Record<string, unknown> }
  | { kind: "update_documents"; payload: Record<string, unknown> }
  | { kind: "insert_events"; payload: Record<string, unknown> };

function makeSupabaseMock(opts: { cancelRequestedAt: string | null }) {
  const recorded: Recorded[] = [];

  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};

      builder.select = () => {
        if (table === "loop_runs") {
          // chained .eq().maybeSingle() returns cancel_requested_at row
          builder.eq = () => builder;
          builder.maybeSingle = async () => ({
            data: { cancel_requested_at: opts.cancelRequestedAt },
            error: null,
          });
        }
        return builder;
      };

      builder.eq = () => builder;
      builder.is = () => builder;
      builder.neq = () => builder;
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.single = async () => ({ data: null, error: null });

      builder.update = (payload: Record<string, unknown>) => {
        if (table === "loop_runs") {
          recorded.push({ kind: "update_loop_runs", payload });
        }
        if (table === "documents") {
          recorded.push({ kind: "update_documents", payload });
        }
        const u: Record<string, unknown> = {
          eq: () => u,
          is: () => u,
          neq: () => u,
          then: (resolve: (value: { error: null }) => void) => {
            resolve({ error: null });
          },
        };
        return u;
      };

      builder.insert = (payload: Record<string, unknown>) => {
        if (table === "events") {
          recorded.push({ kind: "insert_events", payload });
        }
        const i: Record<string, unknown> = {
          select: () => i,
          single: async () => ({ data: { id: "new-id" }, error: null }),
          eq: () => i,
          then: (resolve: (value: { error: null }) => void) => {
            resolve({ error: null });
          },
        };
        return i;
      };

      return builder;
    },
  };

  return { client, recorded };
}

function makeEmitter() {
  const events: SseEvent[] = [];
  const emit = (e: SseEvent) => {
    events.push(e);
  };
  return { events, emit };
}

const baseOpts = {
  runId: "run-1",
  documentId: "doc-1",
  ventureId: "v-1",
  loopName: "01-strategy",
  errorMessage: "anthropic stream failed",
  startedAt: 1_000_000,
  inputTokens: 0,
  outputTokens: 0,
};

describe("finalizeFromCaughtError — cancel detection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("cancel_requested_at SET → run=cancelled, doc=cancelled, loop.cancelled event written", async () => {
    const { client, recorded } = makeSupabaseMock({
      cancelRequestedAt: "2026-05-08T02:21:52.356Z",
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => client,
    }));

    const { emit, events } = makeEmitter();
    const { finalizeFromCaughtError } = await import("@/lib/loops/runner");
    await finalizeFromCaughtError({ ...baseOpts, emit });

    // Document flipped to cancelled, NOT drafting_orphaned.
    const docUpdate = recorded.find((r) => r.kind === "update_documents");
    expect(docUpdate?.payload).toEqual({ status: "cancelled" });

    // Run marked terminal as cancelled. Crucially NOT marked failed
    // (i.e., no `error_message` write — that would set status='failed').
    const runUpdates = recorded.filter((r) => r.kind === "update_loop_runs");
    expect(runUpdates).toHaveLength(1);
    expect(runUpdates[0]!.payload).toMatchObject({ status: "cancelled" });
    expect(runUpdates[0]!.payload).not.toHaveProperty("error_message");

    // Terminal event in the events table.
    const eventInsert = recorded.find((r) => r.kind === "insert_events");
    expect(eventInsert?.payload).toMatchObject({
      type: "loop.cancelled",
      source: "streaming-runner",
    });
    expect((eventInsert?.payload.payload as Record<string, unknown>).run_id).toBe(
      "run-1",
    );

    // Emitted SSE: a single `done` with status=cancelled. No `error` event.
    expect(events.find((e) => e.type === "error")).toBeUndefined();
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({
      type: "done",
      runId: "run-1",
      documentId: "doc-1",
      status: "cancelled",
    });
  });

  test("cancel_requested_at NULL → run=failed, doc=drafting_orphaned, loop.failed event written (regression: terminal event was missing)", async () => {
    const { client, recorded } = makeSupabaseMock({ cancelRequestedAt: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => client,
    }));

    const { emit, events } = makeEmitter();
    const { finalizeFromCaughtError } = await import("@/lib/loops/runner");
    await finalizeFromCaughtError({
      ...baseOpts,
      errorMessage: "Anthropic 503: upstream gateway",
      emit,
    });

    // Run marked failed (with the error_message preserved).
    const runUpdate = recorded.find((r) => r.kind === "update_loop_runs");
    expect(runUpdate?.payload).toMatchObject({
      status: "failed",
      error_message: "Anthropic 503: upstream gateway",
    });

    // Document flipped to drafting_orphaned (existing behaviour preserved).
    const docUpdate = recorded.find((r) => r.kind === "update_documents");
    expect(docUpdate?.payload).toEqual({ status: "drafting_orphaned" });

    // Terminal event in the events table — this is the regression. The
    // pre-fix catch path didn't write any terminal event, leaving Watch
    // and digest consumers with no row to render.
    const eventInsert = recorded.find((r) => r.kind === "insert_events");
    expect(eventInsert?.payload).toMatchObject({
      type: "loop.failed",
      source: "streaming-runner",
    });
    expect((eventInsert?.payload.payload as Record<string, unknown>).error).toBe(
      "Anthropic 503: upstream gateway",
    );

    // Emitted SSE: error frame + done with status=drafting_orphaned.
    const errFrame = events.find((e) => e.type === "error");
    expect(errFrame).toMatchObject({
      type: "error",
      runId: "run-1",
      reason: "Anthropic 503: upstream gateway",
    });
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({
      type: "done",
      runId: "run-1",
      documentId: "doc-1",
      status: "drafting_orphaned",
    });
  });

  test("emit() throwing (closed SSE writer) does not crash the finalisation — DB writes still complete", async () => {
    const { client, recorded } = makeSupabaseMock({
      cancelRequestedAt: "2026-05-08T02:21:52.356Z",
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => client,
    }));

    // emit throws — simulates a closed SSE response writer (which is the
    // common case when we land in the catch — the abort is what got us
    // here in the first place).
    const throwingEmit = () => {
      throw new Error("SSE writer closed");
    };

    const { finalizeFromCaughtError } = await import("@/lib/loops/runner");
    await expect(
      finalizeFromCaughtError({ ...baseOpts, emit: throwingEmit }),
    ).resolves.toBeUndefined();

    // DB writes (the source of truth) all happened before the failing emit.
    expect(recorded.find((r) => r.kind === "update_documents")?.payload).toEqual(
      { status: "cancelled" },
    );
    expect(recorded.find((r) => r.kind === "update_loop_runs")).toBeDefined();
    expect(recorded.find((r) => r.kind === "insert_events")?.payload).toMatchObject(
      { type: "loop.cancelled" },
    );
  });
});
