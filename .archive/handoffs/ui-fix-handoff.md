# UI-fix sprint — Loop 1 verification follow-up

**Date:** 2026-05-08
**Branch:** `claude/eager-bartik-5a34d0` (worktree)
**Author:** Claude (Opus 4.7) under Tim's harness, ui-fix directive
**Predecessor:** `.archive/handoffs/loop-1-live-verification.md`
**Status:** Code complete; build / typecheck / lint / 174 tests all clean. Live-UI re-verification deferred to next deploy (worktree has no Supabase env vars).

---

## Scope

Two surgical UI defects from the Loop 1 live verification, both blocking operator approval of Loop-generated Documents:

1. **Hydration mismatch on the strategy page** (React #418), cascading into `StreamingDocument`'s Pause/Cancel buttons never mounting.
2. **Approve form gated on `status='draft'` only**, so Loop-generated Documents (which land in `status='reviewing'` per `runner.ts:255`) had no operator approval path.

---

## FIX 1 — Hydration mismatch

### Source identification (different from the verification's hypothesis)

The verification report named **`LiveClock`** and **`TimeOfDayProvider`** as prime suspects. Both render only inside `Bridge.tsx`, which is mounted at `app/(authed)/page.tsx` (the `/` route). The strategy page route `app/(authed)/ventures/[slug]/strategy/page.tsx` does **not** include `Bridge`; it renders `ConversationThread` and `Watch` inside the `AuthedLayout` (sidebar + command bar). So neither named suspect is on the strategy page tree at all.

The actual source on the strategy page is **`components/watch/WatchEntry.tsx`** — specifically `formatTimestamp(event.ts)` on line 59-60, which calls `Date.getHours()` and `Date.getMinutes()`. Both are timezone-dependent. On Vercel the server-side renderer runs in UTC; the operator's browser hydrates with the local TZ. Every event row in the Watch produced a server-vs-client text divergence on the `<time>` element. With multiple rows visible, React #418 fires during hydration. React 19 in production then degrades the affected subtree, which (in this codebase) elides the conditional `isStreaming && (Pause/Cancel)` block on `StreamingDocument`.

The verification correctly identified the *symptom* (#418 → Pause/Cancel never renders) and the *class* of bug (TZ-dependent rendering), but mis-named the file. Same fix pattern; different file.

### Fix

[components/watch/WatchEntry.tsx](components/watch/WatchEntry.tsx) — added `"use client"`, replaced inline `formatTimestamp()` call with the same placeholder-then-hydrate pattern that `LiveClock` already uses:

- `useState<string>("--:--")` for the initial render (stable across SSR + first client paint).
- `useEffect` schedules `setLocalTime(formatLocalTime(event.ts))` via `window.setTimeout(..., 0)`. The deferred `setState` matches the LiveClock convention and satisfies the `react-hooks/set-state-in-effect` lint rule (which would otherwise flag synchronous setState inside an effect body — here the cascading render is the whole point).
- Cleanup cancels the pending timeout if the row unmounts before the microtask fires.
- Added a comment explaining *why* the placeholder is necessary so future-Tim (or future-Claude) doesn't "simplify" by computing the time during initial render.

Net change: +24 / −5 lines in one file. No change to `StreamingDocument.tsx` — its conditional Pause/Cancel block was correct; it was being suppressed by the upstream hydration error.

### Why not `suppressHydrationWarning`?

Considered. Rejected because `suppressHydrationWarning` keeps the *server* HTML for the affected element — which means the operator would see UTC time (e.g. "01:30") instead of local time (e.g. "11:30") until something else triggered a re-render. The placeholder pattern produces the correct local time without any UTC bleed-through.

---

## FIX 2 — Approve gate accepts `reviewing`

### Change

[lib/db/documents.ts](lib/db/documents.ts) — added an exported predicate:

```ts
export function isApprovableDocumentStatus(status: DocumentStatus): boolean {
  return status === "draft" || status === "reviewing";
}
```

[app/(authed)/ventures/[slug]/decisions/[id]/page.tsx](app/(authed)/ventures/[slug]/decisions/[id]/page.tsx) — replaced the inline `const isDraft = ctx.document.status === "draft"` (line 79) with `const isApprovable = isApprovableDocumentStatus(ctx.document.status)` and updated the JSX gate at line 158.

The predicate is exhaustive against every value of the `DocumentStatus` enum:
- approvable: `draft`, `reviewing`
- not approvable: `approved`, `rejected`, `published`, `archived`, `drafting`, `cancelled`, `drafting_orphaned`

### Agent_note guard preserved

The `approveDecisionDocument` function (lib/db/documents.ts:375) reads `document.type` and `sections[]` — never `document.status`. The agent_note enforcement guard runs identically for `draft` and `reviewing` documents. A new test (`tests/lib/db/documents.test.ts`, "guard fires for status='reviewing' documents") seeds a `status='reviewing'` document mock with one unresolved agent_note, calls `approveDecisionDocument`, and asserts:
- `result.ok === false`
- `result.error === "1 agent_note unresolved"`
- zero update calls (no section status flipped)
- zero insert calls (no `decisions` row created)

### "Submit for review" path

There is no "submit for review" action in the codebase. Operator-authored documents land directly in `status='draft'` via `createDecisionDocumentAction → createDocument` (defaults). Loop-generated documents land in `status='reviewing'` via `runner.ts:255`. Both reach the approve form unchanged; no draft→reviewing transition exists for operators.

---

## Tests

**New tests** (in `tests/lib/db/documents.test.ts`):

1. `isApprovableDocumentStatus — draft is approvable (operator-authored path)`
2. `isApprovableDocumentStatus — reviewing is approvable (Loop-generated path)` ← regression for the verification gap
3. `isApprovableDocumentStatus — terminal statuses are not approvable` (covers `approved`, `rejected`, `archived`)
4. `isApprovableDocumentStatus — transient runner statuses are not approvable` (covers `drafting`, `cancelled`, `drafting_orphaned`)
5. `isApprovableDocumentStatus — covers every value of DocumentStatus exhaustively` (typed array of all enum values; if the enum gains a new state, the array literal still type-checks but `expect(...).toEqual([...])` will fail until the predicate decides)
6. `approveDecisionDocument — guard fires for status='reviewing' documents (Loop-generated path)` ← regression for the directive's "Verify the agent_note enforcement guard still fires for reviewing-state documents" requirement

**Test count:** 170 → 174 (4 new on the predicate, 1 new in the guard suite, 1 reorganisation). All passing.

**Hydration fix is not unit-testable** in a meaningful way — `renderToStaticMarkup` would just render the `--:--` placeholder, which proves nothing about hydration. The fix's correctness rests on (a) matching the proven `LiveClock` pattern and (b) live verification on next deploy.

---

## Build gates

| Gate | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean (after one round trip — see "Lint dance" below) |
| `pnpm test -- --run` | 174 tests, all pass, 0 fail |
| `pnpm build` | `✓ Compiled successfully in 3.9s`, 14 static pages generated, all 32 routes registered |

### Lint dance

First pass of the WatchEntry fix called `setLocalTime(formatLocalTime(event.ts))` synchronously inside `useEffect`. The repo's `react-hooks/set-state-in-effect` rule (sensible default — cascading renders are usually a smell) flagged it. Fix: defer via `window.setTimeout(..., 0)` with cleanup, matching the `LiveClock` convention. The deferred call is what we actually want here — the whole point is for the second render (post-mount) to swap placeholder for local time.

---

## What this sprint did *not* do

- **Live UI exercise.** This worktree has no `.env.local`; `pnpm dev` crashes on the first request because the middleware requires `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY`. Re-verification of the deployed UI is required before Loop 1 verification can be marked closed.
- **Loop 1 prompt revision to encourage `agent_note` Section emission.** The verification flagged that neither of its two runs produced an `agent_note` Section, so the guard's live behaviour is still untested in operation. Out of scope for this fix per the directive.
- **Streaming runner unit tests** with mocked Anthropic SDK (verification follow-up #4). Out of scope.
- **`Bridge.tsx`** (the home page chrome). `LiveClock` and `TimeOfDayProvider` use the placeholder pattern correctly; the Bridge page renders Watch with initial events too, so it likely had the same `WatchEntry`-driven mismatch. The fix to `WatchEntry` resolves it on every page that renders Watch (Bridge, strategy, anywhere else). No separate Bridge change needed.

---

## Files touched

- `components/watch/WatchEntry.tsx` — hydration fix (placeholder + deferred hydrate)
- `lib/db/documents.ts` — added `isApprovableDocumentStatus` predicate
- `app/(authed)/ventures/[slug]/decisions/[id]/page.tsx` — replaced `isDraft` check with predicate
- `tests/lib/db/documents.test.ts` — added 6 new tests
- `.archive/handoffs/loop-1-live-verification.md` — addendum noting fixes
- `.archive/handoffs/experience-layer-phase-handoff.md` — "Resolved post-phase" section
- `.archive/handoffs/ui-fix-handoff.md` — this file

---

## Next step

Push to `main`, let Vercel deploy, then re-run the Loop 1 live verification protocol from `.archive/handoffs/loop-1-live-verification.md` against the new deploy. The questions the verification couldn't answer (Pause/Cancel mid-stream behaviour, approve action against a `reviewing` document, agent_note guard live trigger) become testable.
