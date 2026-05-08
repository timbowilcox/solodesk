# Loop 1 Live Verification — Mixed result

**Date:** 2026-05-08
**Operator-attempted on:** `app.solodesk.ai`
**Deploy verified:** `solodesk-8wcsjgbfz-tims-projects-ebc6d301.vercel.app` (Ready, Production, built from `origin/main` HEAD `51ff9024`)
**Status:** **CONDITIONAL PASS / FINDINGS BLOCK FULL CLOSURE.** Server-side substrate verified end-to-end against live Anthropic API for two complete runs. Two real client-side substrate defects found (one of which prevents Pause/Cancel testing). Two run-time gates couldn't be exercised. Phase 3 should NOT begin until these are addressed.
**Author:** Claude (Opus 4.7) under Tim's harness, live-verification directive (re-attempt after the prior `BLOCKED — deploy is 27 commits behind` report; deploy is now caught up).

---

## TL;DR

| Item | Status |
|---|---|
| Bridge renders at `/` | PASS |
| `/ventures/kounta/strategy` route | PASS |
| Loop 1 invokes against real Anthropic | PASS — 2 runs succeeded |
| Document persists with 5 typed Sections | PASS |
| Section ordering correct (recommendation → alternatives → kill_criteria → evidence → risk) | PASS |
| Critic comment with evidence pointer on a Section | PASS — 1 of 2 runs (agent's choice; prompt makes it optional) |
| The Watch surfaces full event sequence | PASS |
| `agent_note` Section produced by Loop 1 | NOT OBSERVED — neither run emitted one |
| Approve a Loop-generated Document via UI | **FAIL** — no approve form rendered for `status='reviewing'` |
| Pause button visible during streaming | **FAIL** — never rendered in deployed DOM |
| Cancel button visible during streaming | **FAIL** — never rendered in deployed DOM |
| `agent_note` enforcement guard live test | NOT EXECUTABLE — no agent_note Sections produced AND approve UI gap |

Two complete runs against real Anthropic API. ~$0.10-0.20 spend. Server-side runner, parser, persistence, event emission, Watch narration all behave correctly. **Two specific UI gaps prevent full directive completion.**

---

## What was verified end-to-end (substrate level, against live deploy)

### Run 1 — Mercury vs MCP OAuth (the prescribed reproducibility question)

- **Question:** *"Should Kounta prioritize Mercury direct API integration or MCP OAuth flow first, given Q4 distribution goals?"*
- **`loop_runs.id`:** `1a67a3b1-b89c-48ec-b50c-fba7f7cfba05`
- **`documents.id`:** `a53db150-6714-48e1-b1ca-b7f46037c422`
- **Final status:** `loop_runs.status='succeeded'`, `documents.status='reviewing'`
- **Tokens:** 1035 in / 855 out
- **Total duration:** 21,856 ms
- **Sections produced (5, in order):** recommendation, alternatives, kill_criteria, evidence, risk
- **Critic comments:** 0 (agent chose not to emit `###comment:` directives)
- **Section content quality:** falsifiable kill criteria with dates ("by 2025-12-15", "by 2026-02-01" — wrong year, but that's a model artifact, not a substrate issue), 3-alternative comparison with explicit rejection reasons, 3 numbered evidence citations, 1 risk + mitigation paragraph

### Run 2 — Native mobile vs web-only (a "Pause-test" attempt that completed before I could click Pause)

- **Question:** *"Pause-test run: should Kounta build a native mobile app or stay web-only through Q1?"*
- **`loop_runs.id`:** `c5c331f9-3138-4b34-83b3-1cd747b5d666`
- **`documents.id`:** `15e718c1-6d26-404f-a2be-b0bf2ba1c87f`
- **Final status:** `succeeded` / `reviewing`
- **Tokens:** 1023 in / 669 out
- **Total duration:** 14,788 ms
- **Sections produced (5):** recommendation, alternatives, kill_criteria, evidence, risk
- **Critic comments:** 1, anchored to `evidence` Section
  - `comments.author = 'agent:critic'`
  - `comments.evidence = [{"ref": "external:none", "kind": "agent_note", "label": "external:none"}]`
  - Body: *"Evidence section is thin because the prompt supplied no venture context; in a real run this recommendation should not ship without at least one citation from COMPANY.md or recall."*
  - **This positively verifies the bright line that critic comments anchor to specific Sections with evidence pointers.**

### Timing data (recovered from `events` table — server-side timestamps)

The user's directive asked for "Time to first Section (target <2s)" and "Time per Section (target 2-5s each)". The deployed UI didn't let me capture these client-side (see Pause/Cancel finding below), but server-emitted events give exact numbers:

**Run 2 (the more representative case):**

| Event | t = ms from `loop.invoked` |
|---|---|
| loop.invoked | 0 |
| document.created | +22 ms |
| section_streamed: recommendation | +4,443 ms — **time to first Section: 4.4 s** (target: <2 s — **MISS, mild**) |
| section_streamed: alternatives | +7,136 ms (Δ 2.7 s) |
| section_streamed: kill_criteria | +10,224 ms (Δ 3.1 s) |
| section_streamed: evidence | +11,429 ms (Δ 1.2 s) |
| section_streamed: risk | +13,663 ms (Δ 2.2 s) |
| agent_note.opened (critic) | +14,663 ms (Δ 1.0 s — critic comment fires after risk) |
| loop.succeeded | +14,764 ms |

Per-Section deltas of 1.2–3.1 s land within the 2–5 s target. Time-to-first-Section of 4.4 s is over the <2 s target. **The miss is consistent with Anthropic's normal latency for the first content-block-delta**; the runner does not introduce the latency.

Run 1 was slower (~3.7 s/Section avg); Anthropic latency varies.

### The Watch — surfaced correctly

After each run, the right-rail Watch showed (newest top → oldest bottom):

- "Strategy completed in Kounta." (loop.succeeded)
- "Risk section ready in Kounta." (section_streamed: risk)
- "Evidence section ready in Kounta." (section_streamed: evidence)
- "Kill_criteria section ready in Kounta." (section_streamed: kill_criteria)
- "Alternatives section ready in Kounta." (section_streamed: alternatives)
- "Recommendation section ready in Kounta." (section_streamed: recommendation)
- "Drafting decision in Kounta." (document.created)
- "Watching Kounta strategy." (loop.invoked)

The narrative ordering matches the protocol. Per-venture filter holds (only Kounta entries on `/ventures/kounta/strategy`).

### Section persistence and shape

`SELECT … FROM sections JOIN comments` returned exactly the typed shape expected:

- 5 Sections per Document, ord 0–4, kinds in `(recommendation, alternatives, kill_criteria, evidence, risk)` — all values inside the `SectionKind` enum.
- `sections.status = 'draft'` for every Section (the runner does not touch section status; it only flips `documents.status` to `reviewing` on success). The `approveDecisionDocument` function is what flips sections to `approved` — and the section status is what its agent_note guard reads.
- Critic comment for Run 2 was inserted into `comments` with `author='agent:critic'` and `evidence` jsonb containing the structured pointer.

---

## What FAILED to verify (substrate defects)

### FAIL #1 — Pause/Cancel buttons never render in the deployed UI

Source code at [components/document/StreamingDocument.tsx:215-232](components/document/StreamingDocument.tsx) gates Pause/Cancel on `isStreaming = streamRequest && !status && !error`. During the streaming window of either run (~14–22 s of `status === null`), these buttons should be in the DOM. They are not.

**Evidence:**
- Two real streaming runs of 14.8 s and 21.9 s respectively.
- A `MutationObserver` on `document.body` with `subtree:true, childList:true` was active throughout. Captured: only `Sign out` and `Send`. Never observed `Pause`, `Cancel`, or `Resume`.
- A 100 ms-interval poll for any button containing `/Pause|Cancel|Resume/` in textContent over a 30 s window covering an entire streaming run: 0 finds.
- Post-run `body.innerHTML` search: `Pause` count = 3 (all from my prompt text "Pause-test …"), `Cancel` count = 0.

**Root cause (high confidence):** the browser console shows a single `Minified React error #418` (`Hydration failed because the server rendered HTML didn't match the client`). This is thrown during ConversationThread/StreamingDocument mount. React's recovery from a hydration mismatch triggers a client-side re-render that, in this codebase, evidently elides or never re-mounts the conditional `isStreaming` block.

The hydration mismatch likely originates in either `LiveClock` (the chrome's HH:MM clock that intentionally renders `--:--` server-side per Sprint 8 HANDOFF — line 267 of sprint-8-handoff.md flagged this as "a one-frame visible swap"; on streaming pages it appears to escalate to a hard hydration error) or in `TimeOfDayProvider` (which writes inline style on `<html>` based on local hour). In production, this manifests as Pause/Cancel never rendering.

**Impact:**
- **Pause test (run 2 in directive): NOT EXECUTABLE.** Button doesn't exist to click.
- **Cancel test (run 3 in directive): NOT EXECUTABLE.** Button doesn't exist to click.
- **Live verification of "User can pause client SSE without affecting server run" and "User can cancel server run cleanly" cannot proceed against the deployed app.**
- Sprint 10 unit-tests for runner cancellation polling still hold; the *server-side* cancellation primitive (`requestCancel` → `loop_runs.cancel_requested_at`) is unaffected. The bug is purely UI rendering.

### FAIL #2 — Loop-generated Documents have no Approve UI path

`approveDecisionDocument` (post phase-fix, with the agent_note guard) is a real, deployed function. Its only caller, `approveDecisionDocumentAction`, is wired up at [app/(authed)/ventures/[slug]/decisions/actions.ts:108](app/(authed)/ventures/[slug]/decisions/actions.ts:108). But the page that renders the form, [app/(authed)/ventures/[slug]/decisions/[id]/page.tsx:79](app/(authed)/ventures/[slug]/decisions/[id]/page.tsx:79), gates the form on `const isDraft = ctx.document.status === "draft"`.

Loop 1's runner sets `documents.status = 'reviewing'` on success ([lib/loops/runner.ts:255](lib/loops/runner.ts:255)). **Therefore Loop-generated Documents render the detail page WITHOUT an approve button.**

**Evidence:**
- `find("approve button")` against the rendered detail page for `a53db150…`: "There are no approve, accept, or finalize buttons visible on this page."
- DOM scan: zero buttons matching `/approv|accept|finaliz|publish|commit/i`.
- Document body search confirms: status badge says `REVIEW`, no approve form anywhere.

**Impact:**
- **Live test of the agent_note enforcement guard (the explicit phase-fix deliverable): NOT EXECUTABLE.** Even if a run had produced agent_notes, there is no UI path to trigger `approveDecisionDocument`.
- The directive's fallback ("If the run produced no agent_notes, … approve the Document directly") also cannot be done.

### Side-effect: Run 3 (multi-region long-prompt) fetch never reached the server

`loop_runs` shows zero rows for Run 3, despite the form submit completing (operator message persisted to thread). The server-side `runStreamingLoop` was never entered. This is a downstream effect of FAIL #1: after the React #418 hydration error, the ConversationThread state is in a degraded mode where `setLiveDoc` calls don't actually mount the StreamingDocument's useEffect (or it never fires fetch). The subsequent operator messages persist via the form action, but the SSE invocation does not.

This is an issue but is downstream of FAIL #1 — fixing the hydration error likely resolves it.

---

## Was tested but not directive-required

### agent_note Sections never emitted

Neither Run 1 nor Run 2 produced a Section of `kind='agent_note'`. Loop 1's prompt at [lib/loops/skills/loop1-strategy.ts:42](lib/loops/skills/loop1-strategy.ts:42) lists `agent_note` as an allowed Section kind, but the prompt's example block only demonstrates `recommendation` / `alternatives` / `kill_criteria` / `evidence` / `risk`. The agent treated `agent_note` as a permitted-but-unused option.

This means **the agent_note enforcement guard cannot be exercised live until either (a) Loop 1's prompt encourages emitting agent_note Sections in elicitation contexts, or (b) some other Loop produces an agent_note Section.** The unit tests added in the phase-fix sprint already verify the guard's logic in isolation.

Important nuance: the `agent_note.opened` event-type fires for **critic comments** (see [runner.ts:394-402](lib/loops/runner.ts:394)), not for agent_note Sections. The events table contains `agent_note.opened` for Run 2's critic comment, but the comment is rendered as a row in the `comments` table anchored to the `evidence` Section — not as a `kind='agent_note'` Section. The guard is unrelated to comments.

### `setSectionStatus` dead-code reachability

The latent-risk observation from the re-evaluation pass remains: [`setSectionStatus`](lib/db/documents.ts:294) is exported with zero callers and bypasses the agent_note guard. Not exercised here.

---

## Spend incurred

Two completed Loop 1 runs against Anthropic Opus 4.7:

| Run | Tokens in | Tokens out | Approx cost |
|---|---|---|---|
| Run 1 | 1035 | 855 | ~$0.08 |
| Run 2 | 1023 | 669 | ~$0.07 |
| **Total** | **2058** | **1524** | **~$0.15** |

(Opus pricing: $15/MTok in, $75/MTok out — approx.)

Run 3 produced zero spend (never reached server).

No Document state was modified beyond the two natural Loop runs. No approval was performed.

---

## Verdict against the original directive

| Directive item | Result |
|---|---|
| Prerequisite: Bridge renders, ANTHROPIC_API_KEY set | PASS |
| 1. Invoke Loop 1 with the exact reproducibility question | PASS (`a53db150…`) |
| 2a. Time to first Section <2s | MISS (~4.4 s; bound by Anthropic, not substrate) |
| 2b. Time per Section 2–5 s each | PASS (1.2–3.1 s) |
| 2c. All expected Section kinds appear | PASS (5/5 in correct order, both runs) |
| 2d. Critic engages after agent finishes | PARTIAL — Run 2 only; agent's prompted choice |
| 2e. Critic comments anchor to Sections with evidence pointers | PASS (Run 2's comment on `evidence` with structured `evidence` pointer) |
| 2f. Critic produces agent_note Sections, unresolved by default | NOT OBSERVED |
| 2g. The Watch surfaces the run | PASS |
| 3. Test agent_note enforcement guard | **NOT EXECUTABLE** (no agent_note Sections + approve UI gap) |
| 4a. Pause mid-stream | **NOT EXECUTABLE** (button never renders) |
| 4b. Cancel mid-stream | **NOT EXECUTABLE** (button never renders) |
| 5. If anything fails: capture failure mode + file findings | DONE — this document |
| 6. If all passes: append to phase HANDOFF and commit | NOT APPLICABLE |

---

## Required fixes before re-attempt

1. **Hydration error #418** in the strategy page tree. Likely candidate: `LiveClock` and/or `TimeOfDayProvider`. Reproduce locally with `pnpm build && pnpm start` and look at the React dev console for the unminified hydration warning. Fixing this likely also fixes Run-3-style "second submit fails to invoke server" cascades.

2. **Approve UI for `status='reviewing'`.** Either:
   - Lift the `isDraft` gate to `isDraftOrReviewing` in [decisions/[id]/page.tsx:79](app/(authed)/ventures/[slug]/decisions/[id]/page.tsx:79), OR
   - Have the runner land Documents in `status='draft'` instead of `'reviewing'` (changes the Sprint 10 lifecycle semantic — Section 5 of runner.ts:255), OR
   - Build a separate approve surface inside the StreamingDocument / inline Document view that handles `'reviewing'`.

   Whichever path is taken, the agent_note guard's live verification depends on this.

3. **Encourage `agent_note` Section emission in Loop 1's prompt** (or accept that the guard is unreachable in normal operation and document that). The prompt currently lists `agent_note` as allowed but never demonstrates when to use it. If `agent_note` is the elicitation primitive for "agent has a sub-question for the operator", the prompt should describe that contract explicitly.

4. **Streaming runner unit tests** with a mocked Anthropic SDK (currently flagged as deferred follow-up). The Pause/Cancel UI bug would have been caught by an integration test that mounts StreamingDocument with a mocked stream and asserts the buttons are present during the streaming window.

---

## Recommendation

Phase 3 (tldraw) is **NOT ready** to begin until at minimum FAIL #1 (hydration error / Pause-Cancel UI) and FAIL #2 (approve UI for reviewing Loop docs) are addressed.

**Substrate is sound.** Server-side Loop 1 works exactly as Sprint 10 designed — parser, runner, persistence, eventing, Watch narration, comment anchoring with evidence pointers all behave correctly against live Anthropic. The two failures are UI-layer, but they make the **operator-facing experience materially incomplete** — the operator can't pause, can't cancel, and can't approve a Loop-generated decision without leaving the app and editing the database.

The original phase HANDOFF can correctly say "Loop 1 verified server-side end-to-end, two UI gaps surfaced and filed as required-before-Phase-3 fixes."

---

## Appendix — exact identifiers for follow-up debugging

```
Run 1 loop_runs.id:    1a67a3b1-b89c-48ec-b50c-fba7f7cfba05
Run 1 documents.id:    a53db150-6714-48e1-b1ca-b7f46037c422
Run 1 URL:             https://app.solodesk.ai/ventures/kounta/decisions/a53db150-6714-48e1-b1ca-b7f46037c422

Run 2 loop_runs.id:    c5c331f9-3138-4b34-83b3-1cd747b5d666
Run 2 documents.id:    15e718c1-6d26-404f-a2be-b0bf2ba1c87f
Run 2 critic comment:  comments.id = a12e9c5d-99d1-4487-9e8d-4b5a32394d16
                       on sections.id = 8488806e-a2a0-4b71-9363-0f1f0661ddfd (kind=evidence)

React error:           #418 (https://react.dev/errors/418) from chunk 0b-q_-_8~kej6.js

Production deployment: solodesk-8wcsjgbfz-tims-projects-ebc6d301.vercel.app
                       built from origin/main HEAD 51ff9024
```

---

## Addendum — UI defects fixed (2026-05-08, post-verification)

UI-fix sprint addressed both FAILs. Detail in `.archive/handoffs/ui-fix-handoff.md`. Summary:

- **FAIL #1 (hydration mismatch / Pause-Cancel never renders).** Actual source was **not** `LiveClock` or `TimeOfDayProvider` (those only render inside `Bridge.tsx` on `/`, never on `/ventures/<slug>/strategy`). Source was `WatchEntry.formatTimestamp` — uses `getHours()`/`getMinutes()`, server (Vercel UTC) and client (operator local TZ) diverged on every event row, producing the React #418. Fix: same placeholder-then-hydrate pattern that `LiveClock` already uses; render `--:--` server-side, swap to local time after mount via deferred `setState`. With the hydration error gone, `StreamingDocument`'s conditional Pause/Cancel block should mount as designed (no code change needed in `StreamingDocument.tsx`).
- **FAIL #2 (no approve form for `status='reviewing'`).** Lifted the gate at [decisions/[id]/page.tsx:79](app/(authed)/ventures/[slug]/decisions/[id]/page.tsx:79) via a new `isApprovableDocumentStatus(status)` predicate exported from `lib/db/documents.ts` that returns true for both `draft` and `reviewing` and false for everything else. Agent_note enforcement is unchanged — the guard reads section state, not document.status, and a new test exercises the guard against a `status='reviewing'` document mock.

**Re-verification needed against live deploy.** This sprint cannot exercise the deployed UI directly (no env vars in the worktree); build / typecheck / lint / 174-test suite all clean. Items still requiring live exercise on the next deploy:

- `/ventures/kounta/strategy` renders without React #418 in the browser console.
- During a streaming Loop 1 run, Pause and Cancel buttons appear in the DOM (and Pause-then-Resume / Cancel both behave per Sprint 10 spec).
- A Loop-generated Document at `/ventures/<slug>/decisions/<id>` (status='reviewing') renders the approve form, and clicking Approve calls `approveDecisionDocumentAction` and returns the agent_note guard error when applicable.
- The "Run 3 fetch never reached the server" cascade (the side-effect of FAIL #1) should be gone — second-submit invocations should now reach the runner.
