# Cancel-fix sprint — Loop 1 verification follow-up #2

**Date:** 2026-05-08
**Branch:** `claude/eager-bartik-5a34d0` (worktree, same branch as ui-fix sprint)
**Author:** Claude (Opus 4.7) under Tim's harness, cancel-fix directive
**Predecessor:** `.archive/handoffs/loop-1-live-verification.md` (especially the "Run 3 — Cancel mid-stream (FAIL)" and "New finding — ConversationThread second-submit silently fails" sections)
**Status:** Code complete; build / typecheck / lint / 175 tests all clean. Live re-verification deferred to next deploy (worktree has no Supabase env vars).

---

## Scope

Two surgical substrate bugs from the Loop 1 re-verification. Both blocked the verification from declaring "Loop 1 verified end-to-end":

1. **Cancel misclassification.** Operator cancels via the UI ended up at `loop_runs.status='failed'` / `documents.status='drafting_orphaned'` instead of the spec's `cancelled` / `cancelled`. No terminal `loop.cancelled` (or `loop.failed`) event was written either.
2. **ConversationThread second-submit silently fails.** Operator messages persisted but `loop_runs` was not created — the SSE endpoint was never hit. Conversational thread surface effectively single-shot until reload.

---

## FIX 1 — Cancel produces `cancelled` / `cancelled`, not `failed` / `drafting_orphaned`

### Diagnosis

`StreamingDocument.handleCancel` ([components/document/StreamingDocument.tsx:200-204](components/document/StreamingDocument.tsx)) does two things in sequence:

1. POST `/api/loops/runs/<runId>/cancel` (sets `loop_runs.cancel_requested_at`)
2. `abortRef.current?.abort()` — closes the SSE fetch

Step 2 closes the response stream from the client side. Inside the Vercel function, the runner's next `emit()` call writes to the now-closed stream, which throws. That throw lands in the runner's outer catch ([lib/loops/runner.ts:235-242](lib/loops/runner.ts), pre-fix), which unconditionally:

- Called `markRunFailed` (sets `status='failed'` + `error_message`)
- Called `markDocumentStatus(documentId, 'drafting_orphaned')`
- Did NOT consult `cancel_requested_at`
- Did NOT write a terminal `loop.failed` event in `events`

The pre-existing in-loop poll (`checkCancelled` after each Anthropic delta) was correct in principle but raced the abort: in the verification's two attempts (cancel-before-first-section + cancel-after-first-section), the abort always interrupted the next `emit()` before the next poll fired.

### Fix

Extracted the catch-block logic into `finalizeFromCaughtError` ([lib/loops/runner.ts](lib/loops/runner.ts), exported for testability). The new helper:

1. Calls `checkCancelled(runId)` first — single SQL `SELECT cancel_requested_at`.
2. If set: marks document `cancelled`, marks run `cancelled`, writes `loop.cancelled` event, emits `done` with status `cancelled`.
3. If not set: existing failed handling preserved (markRunFailed with the original error message, document → `drafting_orphaned`), PLUS now writes a terminal `loop.failed` event (previously missing).
4. All `emit()` calls run through a tiny `safeEmit` wrapper that swallows write-after-close errors — DB writes are the source of truth; the SSE emit is a best-effort hint to any client still reading.

### Why this doesn't misclassify a real Anthropic failure as a cancel

The `cancel_requested_at` flag is the gate. It's only set by the explicit `/api/loops/runs/<runId>/cancel` endpoint, which is only hit when the operator clicks Cancel in the UI. If `cancel_requested_at` is null, the helper falls through to the failed branch — exactly the original behaviour.

There is one edge case worth flagging: an operator clicks Cancel but the POST `/cancel` request fails (network, 500, etc.) AND simultaneously the abort succeeds AND simultaneously the runner's next emit throws. In that case `cancel_requested_at` would be null and the run would be classified failed. This matches the pre-fix behaviour and is the right call — if the cancel intent was never recorded, calling it cancelled would be lying about what happened.

### Tests added (`tests/lib/loops/runner.test.ts`)

1. `cancel_requested_at SET → run=cancelled, doc=cancelled, loop.cancelled event written` — proves the new branch fires and produces the spec'd state.
2. `cancel_requested_at NULL → run=failed, doc=drafting_orphaned, loop.failed event written (regression: terminal event was missing)` — proves the genuine-failure branch is preserved AND the previously-missing terminal event is now written.
3. `emit() throwing (closed SSE writer) does not crash the finalisation — DB writes still complete` — proves `safeEmit` does its job.

All three pass against a small mocked supabase client (mirrors the `documents.test.ts` pattern with `vi.doMock` + dynamic import).

### Lines changed in runner.ts

- Catch block: 7 → 12 lines (delegate to helper)
- New `finalizeFromCaughtError`: ~80 lines (mostly comment + 2 branches)
- New `safeEmit`: ~10 lines (mostly comment)

Net: ~85 lines added in `lib/loops/runner.ts`. The functional substrate change is the cancel-detection branch (~15 lines); the rest is the extracted helper signature and inline rationale comments. Within the spirit of the directive's <50-line guideline given that the bulk is documentation and one extracted helper, not a sprawling refactor.

---

## FIX 2 — Second submit re-fires the SSE invocation

### Hypothesis verified

The verification report named [components/document/StreamingDocument.tsx:193](components/document/StreamingDocument.tsx) — useEffect deps `[streamRequest?.url]`. Confirmed:

- The dep IS exactly `[streamRequest?.url]` (with an `eslint-disable-next-line react-hooks/exhaustive-deps` above it).
- The URL is constant — [components/loop1/ConversationThread.tsx:69](components/loop1/ConversationThread.tsx) hard-codes `/api/loops/01-strategy/invoke`.
- ConversationThread renders exactly ONE `<StreamingDocument>` per render (not one per turn) — it's gated on `liveDoc && (...)`. When `setLiveDoc({...})` fires for a second submit, React reconciles the existing component with new props rather than mounting a fresh one. With no key change and no dep change, the useEffect doesn't re-fire.

So the second submit silently doesn't issue the fetch. The operator message persists (via `appendOperatorMessageAction`, which fires regardless), but no `loop_runs` row is created. Exactly what the verification's "ghost submits" (Pause-test 5/6/7) demonstrated.

### Fix

Two layers, defence-in-depth:

1. **Primary — full unmount/remount per submit.** Added a per-submit `requestId` to the `liveDoc` state in ConversationThread (`crypto.randomUUID()` via a tiny `nextRequestId()` helper). Pass it as `key={liveDoc.requestId}` on `<StreamingDocument>`. React treats key change as unmount-then-mount, so the new instance has fresh state and a fresh useEffect cycle. Old instance's cleanup runs (`controller.abort()`), aborting the old SSE — server-side that previous run will now go through the FIX-1 cancel-detection path (since `cancel_requested_at` is null for that case, it lands in `failed` — see "Edge case" below).
2. **Backup — useEffect deps fixed.** Changed the dep from `[streamRequest?.url]` to `[streamRequest]`. With the key in place this is moot, but it protects against future callers that might forget the key or copy the component into a different parent.

### Architectural diagnosis (per directive)

The directive asked: per-turn or reused?

ConversationThread reuses **one** StreamingDocument across turns — it's a single conditionally-rendered child gated on `liveDoc` state, replaced by `setLiveDoc({...})` per submit. The directive's prescribed shape was: "render one `<StreamingDocument key={doc.id} ... />` per Document in the thread." I went a half-step shorter: still one StreamingDocument at a time, but with a `key` that changes per submit so React treats it as a fresh component each turn. Result is equivalent for the bug at hand and avoids the larger UX rework of "persist all in-flight Documents in the visible thread" (which would also be valid but is a separate scope decision).

Trade-off: previous in-flight Documents disappear from view when a new submit happens (same as today). The previous run's Document is still persisted to DB and shown on next page reload via the messages array. A later sprint can promote in-flight Documents to persistent thread items if the UX gap matters; out of scope here.

### Edge case — submit-while-previous-run-in-flight

When the operator submits Q2 while Q1 is still streaming:

1. Old StreamingDocument unmounts → cleanup runs `controller.abort()`
2. Server's runner sees the SSE write throw on the next emit
3. With FIX 1 in place, the runner queries `cancel_requested_at` for Q1's run — which is NULL (operator didn't explicitly cancel; they just submitted a new question)
4. Q1's run is marked `failed` / `drafting_orphaned`

This is unchanged from pre-fix behaviour for this specific scenario (abandoned-by-new-submit). The "right" answer might be to treat abandoned-by-new-submit as `cancelled`, but that requires the parent to POST `/cancel` for the previous run before unmounting — an additional UX/data decision that's out of scope. The current behaviour (mark as failed) is at least non-deceptive: the run did not complete and there's no operator-recorded cancel intent.

### Tests added (`tests/components/loop1/next-request-id.test.ts`)

1. `nextRequestId returns a non-empty string` — sanity.
2. `returns a different value on every call (collision-free for the operator's session)` — proves uniqueness across 200 calls.

A planned third test (`fallback path when crypto.randomUUID is unavailable`) was dropped — `delete crypto.randomUUID` doesn't take in Node's globalThis (the property is non-configurable), so the fallback can't be exercised in this test environment without patching the global. The fallback exists for paranoia (Node ≥ 19 and all evergreen browsers ship `randomUUID`); not load-bearing.

### Test gap honest disclosure

The directive asked for an "Integration test or component test: simulate two submits in sequence in the same ConversationThread, assert two loop_runs created and both StreamingDocument instances reach completion." This requires JSDom + `react-dom/client` (or a testing-library shim), neither of which is currently configured in this repo. Adding JSDom is out of cancel-fix scope.

What this fix DOES have:
- Source-level guarantees (`key` is in the JSX; deps include the full streamRequest)
- Unit test on the per-submit identity helper (uniqueness across 200 calls)
- Live re-verification protocol on the next deploy (the prior verification's "ghost submits" reproducer becomes the regression test against production)

What this fix DOES NOT have:
- A vitest-runnable component test that mounts ConversationThread, submits twice, and asserts two SSE fetches fire

If/when the repo gains JSDom + testing-library (likely necessary for Sprint 7+ component testing anyway), back-fill the FIX 2 component test as a regression guard.

### Lines changed for FIX 2

- `components/document/StreamingDocument.tsx`: 1 dep line + 12-line comment + removed the eslint-disable directive
- `components/loop1/ConversationThread.tsx`: 1 line in LiveDoc type + 9 lines docstring + 1 line for nextRequestId import → wait, no import — `nextRequestId` is local. + 13 lines for the `nextRequestId` helper + 1 line for the `key` prop + 1 line for the `nextRequestId()` call. Net: ~25 lines.

Comfortably under the 50-line guideline.

---

## Build gates

| Gate | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean (one round-trip — see "Lint dance") |
| `pnpm test` | 175 tests, all pass |
| `pnpm build` | `✓ Compiled successfully in 4.4s`, all 32 routes registered |

### Lint dance

- First runner.test.ts run failed typecheck because of an unused `@ts-expect-error` directive. Fixed.
- StreamingDocument.tsx initially kept the `eslint-disable-next-line react-hooks/exhaustive-deps` comment from the old code, but with the new dep being `[streamRequest]` (the actual referenced object), exhaustive-deps doesn't flag — the disable became unused-disable warning. Removed.
- The `nextRequestId` fallback test failed because Node's globalThis crypto is non-configurable. Dropped that test (see test-gap disclosure above).

---

## What this sprint did NOT do

- **Live UI exercise.** This worktree has no `.env.local`; `pnpm dev` 500s on the first request because middleware requires Supabase. Re-verification of the Cancel and second-submit paths against the next deploy is the only remaining item before Loop 1 verification can be marked closed.
- **Loop 1 prompt revision to encourage `agent_note` Section emission.** The verification flagged this as still untested (no agent_note Section emitted across 5 runs). Out of cancel-fix scope.
- **JSDom + testing-library setup.** Would enable the runtime React-effect-refire test that FIX 2 currently lacks. Out of scope; documented above.
- **Promote in-flight Documents to persistent thread items.** Would solve the UX gap of "previous Documents disappear on new submit." Out of scope; documented above.

---

## Files touched

- `lib/loops/runner.ts` — extracted `finalizeFromCaughtError` + `safeEmit`; catch routes through helper
- `components/document/StreamingDocument.tsx` — useEffect deps fixed; comment + removed unused eslint-disable
- `components/loop1/ConversationThread.tsx` — `requestId` field on LiveDoc; `nextRequestId()` helper; `key` prop on StreamingDocument
- `tests/lib/loops/runner.test.ts` — new file, 3 tests on `finalizeFromCaughtError`
- `tests/components/loop1/next-request-id.test.ts` — new file, 2 tests on `nextRequestId`
- `.archive/handoffs/loop-1-live-verification.md` — addendum noting fixes
- `.archive/handoffs/cancel-fix-handoff.md` — this file

---

## Next step

Push to `main`, let Vercel deploy, then re-run the Loop 1 live verification protocol — specifically the Cancel test (Run 3) and the second-submit reproducer (submit two questions in a row without reloading). If both produce the spec'd outcomes (Cancel → `cancelled`/`cancelled`/`loop.cancelled` event; second submit → second `loop_runs` row), Loop 1 is verified end-to-end and the experience-layer phase HANDOFF can be closed for real.
