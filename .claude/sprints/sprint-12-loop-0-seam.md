# Sprint 12 (proposal) — Loop 0 dispatch seam

Status: **proposal only — not scheduled.** Filed at the close of the experience-layer phase to capture audit findings while the substrate is fresh. Implement only if and when Loop 0 (portfolio-level orchestrator) is greenlit.

Date drafted: 2026-05-07
Trigger context: Phase HANDOFF audit pass. The phase shipped Loop 8 reactive (3 trigger paths) and the cross-venture command bar; both are venture-scoped today. Loop 0 (portfolio audit / cross-venture orchestrator) is deferred to a later phase per `EXPERIENCE-LAYER-PHASE.md`. Before tldraw work begins it is worth recording where Loop 0 should plug in so the seam is not retro-fitted under pressure.

---

## Current state — where the trigger-to-Loop dispatch happens

### Loop 8 reactive (`lib/loops/loop-8/reactive.ts`)

Three external trigger paths, three adapter functions, one funnel:

| Trigger | Adapter | Caller |
|---|---|---|
| Stripe webhook | `triggerLoop8FromStripe()` ([triggers.ts:28](lib/loops/loop-8/triggers.ts:28)) | `app/api/webhooks/[source]/route.ts:83` |
| Threshold cron | `triggerLoop8FromThreshold()` ([triggers.ts:53](lib/loops/loop-8/triggers.ts:53)) | `app/api/cron/loop8-threshold/route.ts:84` |
| Manual / command bar | `triggerLoop8FromManual()` ([triggers.ts:83](lib/loops/loop-8/triggers.ts:83)) | `app/api/command-bar/route.ts:230` |

All three adapters converge on [`triggerLoop8()` in reactive.ts:58](lib/loops/loop-8/reactive.ts:58). That function:
1. Computes a fingerprint (`ventureId` + `metricKind`) and dedups.
2. Calls `runStreamingLoop()` with `loopName: "08-metrics-investigator"` **hardcoded** ([reactive.ts:84](lib/loops/loop-8/reactive.ts:84)).
3. Records the fingerprint with the resulting `documentId`.

The trigger envelope passed in (`Loop8TriggerInput`) carries `source`, `ventureId`, `metricKind`, `title`, `task`, `payload` — already normalised across the three sources.

### Command bar (`lib/command-bar/router.ts`)

Router is pure. [`routeCommand()` (router.ts:55)](lib/command-bar/router.ts:55) takes `{ query, visibleVentures }` and returns a typed `CommandIntent`:

- `curate_day`
- `decisions_search` (single venture or null)
- `venture_synthesise` (single venture)
- `loop8_investigate` (single venture)
- `no_access`
- `clarify`

Intent dispatch happens in the route handler at [`app/api/command-bar/route.ts:121` (`dispatch()` switch)](app/api/command-bar/route.ts:121). Each `intent.kind` binds 1:1 to a hardcoded handler — `loadDayItems` / `recallContext` / Supabase query / `triggerLoop8FromManual`.

The router does not invoke Loops; the route handler does. The router *is* a seam for command-bar input classification.

---

## Is there a clean interception point for Loop 0?

**Half yes, half no.**

### Where the seam already exists

**`triggerLoop8()` is a narrow funnel** for a single Loop. The function comment at [reactive.ts:3-14](lib/loops/loop-8/reactive.ts:3) explicitly calls this out: *"single entry point for all three trigger types"*. The trigger envelope is normalised. The dedup happens once. If you wanted to log every Loop 8 invocation, this is the one place to do it — and Loop 0 could observe here.

**`routeCommand()` is a pure intent router.** It returns a typed union. A future Loop 0 entry could expand the intent union with cross-venture intents (`portfolio_synthesise`, `cross_venture_correlate`) and the dispatch switch would gain one or two new branches.

### Where the seam does not exist

**The trigger adapters jump directly from external signal to "invoke Loop 8."** `triggerLoop8FromStripe` decides on its own that a Stripe webhook means Loop 8 — there is no router function that says *"given this signal envelope, decide which Loop(s) to fire."* Loop 0 cannot intercept between "Stripe paid invoice on Kounta" and "fire Loop 8 on Kounta" without rewriting `triggerLoop8FromStripe`.

**`triggerLoop8()` is hardcoded to one Loop.** The `loopName: "08-metrics-investigator"` and `LOOP8_INVESTIGATOR_SKILL_PROMPT` at [reactive.ts:84-89](lib/loops/loop-8/reactive.ts:84) are fixed. The function shape is right, but the body commits to Loop 8 immediately.

**The command-bar dispatch switch lives in the route file.** It is not extracted into a testable, replaceable layer. A Loop 0 that wanted to override or augment dispatch would have to fork the route handler.

So: the *plumbing* is clean (one funnel per surface). The *routing decision* is hardcoded inline.

---

## Minimal refactor proposal

Two surgical changes. No new abstractions, no new layers, current behaviour preserved exactly.

### Change 1 — generalise `triggerLoop8` into `dispatchTrigger`

New file: `lib/loops/dispatcher.ts`. One exported function, one type.

```ts
export type TriggerInput = {
  source: AnomalyFingerprintSource;
  ventureId: string;
  metricKind: string;
  title: string;
  task: string;
  payload?: Json;
  /** Hardcoded today; Loop 0 overrides later. */
  targetLoop?: { loopId: string; loopName: string; skillPrompt: string; budgetTokens: number; budgetCents: number };
};

export type TriggerResult =
  | { ok: true; documentId: string; runId: string; deduped: false }
  | { ok: true; deduped: true }
  | { ok: false; error: string };

export async function dispatchTrigger(input: TriggerInput): Promise<TriggerResult> {
  // Default target = Loop 8 (preserves current behaviour exactly).
  const target = input.targetLoop ?? LOOP8_TARGET;
  // ... fingerprint + dedup + runStreamingLoop with target.* ...
}
```

`reactive.ts` becomes a 5-line wrapper:

```ts
export const triggerLoop8 = (input: Loop8TriggerInput): Promise<Loop8TriggerResult> =>
  dispatchTrigger({ ...input, targetLoop: LOOP8_TARGET });
```

The three adapters in `triggers.ts` keep calling `triggerLoop8` — zero change to webhook / cron / command-bar callers.

**Loop 0 plug-in point:** future Loop 0 replaces `dispatchTrigger`'s body to consult a portfolio orchestrator before choosing `target`. The orchestrator can fan out (fire Loop 8 on Kounta + Loop 4 content brief on Counsel for the same Stripe event), suppress (Loop 0 already saw this signal cluster across the portfolio), or upgrade (escalate from Loop 8 to a portfolio-audit Loop 11). No caller changes.

### Change 2 — extract the command-bar dispatch switch

Move the `dispatch()` body from `app/api/command-bar/route.ts` into `lib/command-bar/dispatcher.ts`. Same signature:

```ts
export async function dispatchCommand(
  intent: CommandIntent,
  send: (frame: CommandBarFrame) => void,
  user: UserContext,
): Promise<void>
```

The route handler becomes a thin SSE shell that calls `routeCommand()` then `dispatchCommand()`. Behaviour identical.

**Loop 0 plug-in point:** the `CommandIntent` union grows new variants (`portfolio_synthesise`, etc.) when Loop 0 ships; `dispatchCommand` gains new switch arms. Routing logic stays in `routeCommand()` — Loop 0 contributes a second router (`routePortfolioCommand()`) whose output is merged into the same intent union, or replaces `routeCommand()` entirely with a portfolio-aware version.

---

## Why this is the minimum

- No new abstraction layer (no "command bus", no "orchestrator interface", no plugin registry).
- One new file per change, one moved function per change.
- All three Loop 8 callers untouched.
- Command-bar route handler shrinks; nothing renamed at the public API.
- Tests already in place (`tests/lib/loops/loop-8/dedup.test.ts`, `tests/lib/command-bar/router.test.ts`) keep passing without modification.

The refactor does not introduce Loop 0. It introduces the *line in the sand* where Loop 0 will plug in. The current substrate has the right shape; it just commits to specific Loops too early.

---

## What this proposal explicitly does NOT include

- Loop 0 itself (orchestrator logic, fan-out semantics, cross-venture aggregation).
- Cross-venture intent classification in `routeCommand()`.
- Portfolio-scoped `recallContext()` (separate concern, captured in phase HANDOFF as deferred).
- Any change to the dedup / fingerprint logic — Loop 0 may need its own dedup layer; that is a separate decision.
- Any change to `runStreamingLoop` — the runner is correctly Loop-agnostic today.

---

## Trigger to schedule this sprint

Schedule when **any** of the following becomes true:

1. A second Loop wants to fire reactively on the same trigger sources (Stripe webhook should fire both Loop 8 metrics-investigator AND Loop 4 content-impact). Today this requires forking `triggerLoop8FromStripe`.
2. The command bar grows a cross-venture query the router cannot classify with the current single-venture `CommandIntent` union.
3. Loop 11 (portfolio audit) is greenlit — Loop 11 is the first Loop that fundamentally needs to operate above the venture boundary and observe other Loops' outputs.

Until then this proposal sits on the shelf. The current single-venture shape is correct for everything that has shipped.

---

## Estimated effort

Half-day to a day, single session. Two files moved, two files created, both heavily tested at the boundaries that already exist. No migration. No data shape changes. No bright-line tensions.
