# QA Report — Experience-layer phase (Sprints 7-11)

**Date:** 2026-05-07
**Evaluator:** Claude (Opus 4.7), fresh adversarial pass per Tim's harness
**Subject HEAD:** `91a6233`
**Verdict:** **phase FAILS** — one CLAUDE.md bright-line claimed-met-but-not-enforced; one Sprint 11 acceptance criterion has no working substrate on deploy; multiple smaller AC gaps and inflated test counts.

---

## Build gates (verified live on HEAD `91a6233`)

| Gate | Result |
|---|---|
| `pnpm typecheck` (`tsc --noEmit`) | exit 0 |
| `pnpm lint` (`eslint .`) | exit 0 |
| `pnpm test --run` (`vitest run`) | **17 files / 153 tests passed** |
| `pnpm build` | exit 0, all routes compiled |

Phase HANDOFF's verified-state table is accurate. Build gates pass.

---

## Cross-cutting bright-line verifications (the four explicit ones)

### 1. "Loops are venture-portable" — PASS

Verified by reading `lib/loops/skills/loop1-strategy.ts` and `lib/loops/skills/loop8-investigator.ts`. Both say "one venture" and contain zero venture-name branches. Venture-specific context flows in via `buildAgentPrompt()`'s recall layer. No `if (ventureId === 'kounta')` anywhere in the new Loop code.

### 2. "Every loop through `buildAgentPrompt`" — PASS

Verified by grep: every file that calls `client.messages.create` or `client.messages.stream` has a `buildAgentPrompt` call earlier in the same function — `lib/loops/runner.ts:160` (streaming) and `lib/agents/anthropic.ts:112` (which only takes pre-composed `systemPrompt` + `userMessage` from callers, all of which use `buildAgentPrompt`). The command-bar route handler does NOT construct prompts itself; its only Loop-invoking branch (`loop8_investigate`) routes through `triggerLoop8FromManual` → `triggerLoop8` → `runStreamingLoop` → `buildAgentPrompt`. Bright line holds.

### 3. Cross-venture credential / data leakage in command bar — PASS in substance

`app/api/command-bar/route.ts:57` computes `visibleVentures` by filtering `listVentures()` against the user's `venture_members` rows BEFORE calling `routeCommand`. The router's `resolveVenture` (`router.ts:141`) only matches against the supplied `visible` array, so an unassigned venture name resolves to `null` → `clarify`. Each dispatch branch (`decisions_search`, `venture_synthesise`, `loop8_investigate`) only operates on a resolved (visible) `intent.venture.ventureId`. A non-admin querying about an unassigned venture receives no data from it.

**However** the `router.test.ts:73-79` confirms unknown name → `clarify`, not the explicit `no_access` response Sprint 11's AC required. Functionally equivalent on the leakage axis; UX wording differs from spec.

### 4. Per-Section approval relaxation preserving the agent_note unresolved rule — **FAIL**

This is the critical finding. CLAUDE.md states (verbatim):

> "No Document flips to `approved` while it has unresolved `agent_note` Sections."
> "Document approval is a single operator action. Section-level state (resolved, agent_note open, etc.) is enforced at approval time — operator cannot approve while any `agent_note` Section is unresolved."

`approveDecisionDocument` in `lib/db/documents.ts:331-395` does NOT enforce this:

```ts
// Bulk-approve sections
await supabase
  .from("sections")
  .update({ status: "approved" })
  .eq("document_id", opts.documentId)
  .neq("status", "rejected");
```

It bulk-flips every non-rejected Section — including agent_notes — to `approved`. There is no check that any `agent_note` is resolved (`decision` non-empty), no early return, no failure mode for unresolved agent_notes.

Loop 1's prompt at `loop1-strategy.ts:42` lists `agent_note` as an allowed Section kind. The runner at `runner.ts:451` creates agent_note content with `decision: ""` (the unresolved state). If any approval path runs on such a Document, the bright line is silently violated.

The Sprint 10 HANDOFF claims:
> "Document approval is a single operator action — Section-level state is enforced at approval time (existing logic in `approveDecisionDocument`)"

The Phase HANDOFF claims:
> "Document approval is single operator action with Section-state enforcement at approval time"

Both claims are **false at the substrate level**. UI gating (the approve button only renders when `status='draft'`, `decisions/[id]/page.tsx:79`) means a Loop-generated Document in `reviewing` status currently has no UI path to approval — but the function is callable, the bright line says "enforced at approval time", and the function has no enforcement. This is a substrate fail, not a UI fail.

---

## Per-sprint verdicts

### Sprint 7 — Visual venture identity — **PASS** (7.5/8 per its rubric)

- All 9 testable AC verified in code; Lighthouse a11y appropriately deferred.
- Migration 0008 applied; 8 sparkline tests pass.
- Component purity verified by grep — no fetch / Supabase / router imports in `components/venture/`.
- `accent_color` DB CHECK constraint present.
- Score 7.5/8 per the spec's rubric (dark-mode contrast partial, decorative-only).

### Sprint 8 — The Bridge — **PASS** (8/8 per its rubric)

- `bridge_tiles` membership filter verified at SQL layer (`0009_bridge_aggregation.sql:56-66`).
- Single-roundtrip verified (28 + 5 tests on state-derivation + bridge-db).
- Phosphor substitution documented and applied (`/dist/ssr/` import path).
- Lighthouse perf appropriately deferred.

### Sprint 9 — The Watch + The Day — **PASS** (8/8 per its rubric, 1 minor)

- 32 new tests pass (narrate=19 actual vs HANDOFF's 18, curate=13 vs HANDOFF's 14 — net adds up).
- `loadDayItems` venture filter verified.
- `day_item_dismissals` keys on `user_id`; action reads userId from `requireUserContext()`, never from form input.
- AC "burst of >5 events in 1s batch-renders" is **not actually unit-tested** — HANDOFF says "tested via the unit test's logical equivalent" but no throttle test exists. Throttle code path is straight-line, but the AC asks for a verified burst test. Minor.

### Sprint 10 — Streaming Sections + Loop 1 — **FAIL** (would be 7/8 but for the bright-line violation)

- 14 parser tests pass (matches HANDOFF claim).
- `runStreamingLoop` calls `buildAgentPrompt` once at `runner.ts:160` — bright line holds for prompt construction.
- Parser rejects unknown kinds, missing `section=`/`ref=` — bright lines hold for typed Sections and anchored comments.
- **Critical: agent_note approval enforcement absent (see #4 above).** The Sprint 10 rubric "Bright line: comments anchored to Sections with evidence" passes (parser enforces), but the unstated companion bright line "no approval through unresolved agent_note" — claimed by the HANDOFF as "enforced at approval time (existing logic in approveDecisionDocument)" — is unfounded. Phase 0 modified CLAUDE.md to move this enforcement to approval time precisely so this sprint could relax per-Section ceremony; the relaxation was made without the approval-time enforcement being added.
- Live Loop 1 invocation not exercised. HANDOFF flags as operator-driven; phase HANDOFF lists as not-verified. Acceptable.
- AC "User can edit a streamed Section after it completes without affecting other Sections" is met only via existing Document edit pages, not in-stream. Documented deviation.

### Sprint 11 — Command bar + Loop 8 reactive — **FAIL** (would be 7/8; multiple AC unmet)

Code-quality items pass:
- `triggerLoop8` is a clean single funnel; dedup unique-constraint correct.
- 5 dedup tests pass; 16 router tests pass (HANDOFF claims 18, actual 16 by `test()` count — overstated).
- Member scoping correct in substance.

But several AC are unmet on substrate:
- **Threshold cron is not registered.** `vercel.json` has crons for `embeddings`, `daily-digest`, `portfolio-audit` — **no entry for `loop8-threshold`**. AC: "Threshold cron runs daily." HANDOFF claims registration is "left for the operator deploy (the Vercel CLI registers the cron once the route is live)" — that is incorrect; Vercel crons are declared in vercel.json, not via the CLI. The route exists but will never fire on deploy.
- **Old daily-digest cron NOT removed.** Sprint 11 AC: "Old Loop 8 daily-digest cron is removed". Still in vercel.json, route still exists. HANDOFF documents deferral as debt.
- **`no_access` intent is dead code.** Sprint 11 AC requires "graceful 'no access' response". Router returns `clarify` ("which venture is X?") instead. Type carries `no_access` shape; `resolveVenture` never returns it.
- **`venture_synthesise` has no LLM path.** Sprint 11 spec line 38: "multi-source synthesis: recent Documents, Watch entries, connection state". Implementation pulls counts of events + pending docs only. No Watch entries, no connection state, no synthesis. HANDOFF documents the reduction.
- **Severity-based routing absent.** Sprint 11 AC: "High-severity anomalies surface in The Day automatically; informational anomalies surface in The Watch only". Implementation: all Loop 8 Documents land in The Day via `curate.ts` `kind='document'`. No severity branch.
- **Live Stripe webhook simulator NOT exercised.** AC: "Stripe webhook events trigger Loop 8 evaluation (test with synthetic webhook)". Not done; HANDOFF flags as operator-driven.

The Phase Completion checklist at the bottom of sprint-11 spec further fails:
- "Adversarial evaluator session run on each sprint, scores ≥7/8 on each rubric" — only running now, after marathon completion; per-sprint adversarial sessions did not run between sprints.
- "Demo recording committed" — not committed.
- "Manual operator load measurement" — phase HANDOFF correctly flags as uncomputable until 1 week post-deploy.

---

## Phase HANDOFF audit

Phase HANDOFF is mostly accurate but has two specific defects given the findings above:

1. **"Bright lines preserved" section claims Section-state enforcement at approval time.** This is false — see #4. The bullet should be retracted or qualified.
2. **"Recommendation" — "Phase 3 (tldraw) ready to scope".** It is **not** ready to scope until the agent_note enforcement bright-line is fixed. That fix is a one-function patch (add a guard before the bulk update), but it must land before any further work treats the bright line as held.

Other Phase HANDOFF claims hold:
- The "What is verified" table is accurate to live build gates.
- The "What is NOT verified" list correctly enumerates Loop 1 live, Stripe webhook live, operator-load metric.
- The Loop-0 seam debt entry is accurate.

---

## Summary

| Sprint | Verdict | Score | Reasons |
|---|---|---|---|
| 7 | PASS | 7.5/8 | Lighthouse a11y deferred (acceptable per spec); dark-mode contrast partial. |
| 8 | PASS | 8/8 | Single-query aggregation verified; membership at SQL layer. |
| 9 | PASS | 8/8 (minor) | Per-file test counts off by 1 each direction; throttle AC unit-tested only as a code-path read. |
| 10 | **FAIL** | 7/8 (rubric) but BRIGHT LINE VIOLATION | `approveDecisionDocument` does not enforce agent_note resolution; HANDOFF claims it does. |
| 11 | **FAIL** | 7/8 (rubric) but MULTIPLE AC UNMET | threshold cron not registered in vercel.json; old daily-digest not removed; no_access dead code; venture_synthesise no LLM; severity routing absent. |

**Phase-level: FAIL.** Sprint 10's bright-line violation is the disqualifier — the rule about "no approval through unresolved agent_notes" is not just an aspirational AC, it is in CLAUDE.md as a hard prohibition. The Phase HANDOFF claims it is enforced; it is not. Sprint 11's threshold-cron-not-registered means a major shipped feature ("threshold-driven Loop 8 fires daily") will silently not work on deploy. Both are substrate-level, not paper-only.

**Required to pass:**

1. Add a guard at the top of `approveDecisionDocument` that selects `sections` for the document with `kind='agent_note'` and validates `decision` is non-empty (or status is `approved`/`dismissed`). Return `{ ok: false, error: "X agent_notes unresolved" }` if any fail. Add a unit test.
2. Add `{ "path": "/api/cron/loop8-threshold", "schedule": "..." }` to `vercel.json`.
3. Update Phase HANDOFF and Sprint 10 / Sprint 11 HANDOFFs to retract the false enforcement claim and the false cron-registration claim respectively. Re-score those sprints honestly.

Until those three land, do not start Phase 3 (tldraw). The two debug sessions also remain prerequisite as the Phase HANDOFF already notes — but they cannot validate a bright line the substrate violates.
