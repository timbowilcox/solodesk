# Experience-layer phase — deferred Sprint 11 AC

Filed: 2026-05-07 (phase-fix sprint).
Source: post-phase evaluator pass found three Sprint 11 acceptance criteria that the substrate doesn't meet. None are bright-line violations; each is a UX/scope gap. Logged here so future sprints can pick them up cleanly.

---

## 1. `no_access` response wording

- **File:** `lib/command-bar/router.ts`
- **Lines:** 141-165 (`resolveVenture` helper)
- **Spec reference:** `.claude/sprints/sprint-11-command-loop8-reactive.md` AC line 97 — "Member scoping enforced — non-admin user querying about an unassigned venture gets graceful 'no access' response"
- **Current behaviour:** `resolveVenture` returns `null` for any name not in `visibleVentures`, and the router falls through to `{ kind: "clarify", reason: "which venture is X?" }`. The `CommandIntent` type defines a `no_access` variant ([router.ts:38-40](../../lib/command-bar/router.ts:38)) but the function never returns it.
- **Why deferred:** minor UX gap. Functionally correct — no data leakage from the inaccessible venture, just slightly less helpful messaging. The existing `clarify` response is still graceful.
- **One-sentence fix:** load all ventures (admin-bypass-friendly query), pass both `visible` and `all` to the router, and have `resolveVenture` return `"no_access"` when the name matches an entry in `all` but not `visible`; thread that through `dispatch()` to emit a "I don't have access to that venture" frame.

---

## 2. `venture_synthesise` is counts-only, no multi-source synthesis

- **File:** `app/api/command-bar/route.ts`
- **Lines:** 184-223 (the `venture_synthesise` dispatch case)
- **Spec reference:** `.claude/sprints/sprint-11-command-loop8-reactive.md` line 38 — `"What's happening with [venture]?" → multi-source synthesis: recent Documents, Watch entries, connection state`
- **Current behaviour:** two parallel SQL queries (last 10 events + 5 pending docs), emits one text frame with the counts and one link frame per pending doc. No Watch entries pulled, no connection state, no LLM synthesis.
- **Why deferred:** the surface works; it answers the literal question with verified data. The spec wanted a richer synthesised narrative; v1's "5 events, 2 pending documents" is functional and zero-cost. Polish-pass material.
- **One-sentence fix:** add a `triggerLoopForSynthesis()` adapter that calls `runStreamingLoop` with a new `loop-synth` skill prompt and the per-venture context, then stream the result through the existing SSE frame consumer; budget ~5k tokens / 10c per query.

---

## 3. Severity-based routing absent on Loop 8 Documents

- **File:** `lib/day/curate.ts`
- **Lines:** entire file — Day curation treats every Loop 8 Document as `kind='document'` regardless of the agent's severity assessment.
- **Spec reference:** `.claude/sprints/sprint-11-command-loop8-reactive.md` AC line 106-107 — "High-severity anomalies surface in The Day automatically; informational anomalies surface in The Watch only"
- **Current behaviour:** every Loop 8 Document lands in `documents` with `status='reviewing'`; The Day picks it up as a pending document. The Watch separately observes the `loop.invoked` / `document.section_streamed` events. There is no severity branch — informational and high-severity Documents both surface in both places.
- **Why deferred:** behaviour is acceptable default. The operator sees every Loop 8 Document in The Day, which is the correct behaviour for high-severity. The "informational only in The Watch" filtering is a noise-reduction polish that requires the agent to emit a structured severity signal (currently severity lives in the `risk` Section's `severity` field but isn't surfaced at Document level).
- **One-sentence fix:** add a `severity` column to `documents` (or read from the `risk` Section's content) and have `curate.ts` filter out `severity='low'` Loop 8 Documents from The Day items — they remain visible in The Watch via `document.created` event narration.

---

## How these get scheduled

These three items can be picked up in a single follow-up sprint, or each tackled standalone. None depend on Phase 3 (tldraw); none block Phase 3. They are independent of the two operator-driven debug sessions (Loop 1 live, Stripe webhook live) called out in the phase HANDOFF.
