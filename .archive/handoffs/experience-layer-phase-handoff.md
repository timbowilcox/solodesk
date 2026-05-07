# Phase HANDOFF — Experience layer (Sprints 7-11)

**Date:** 2026-05-07
**Repo:** `solodesk`
**Branch:** `main` at `581aa9f` (ROADMAP close)
**Phase span:** Sprints 7 → 11
**Author:** Claude (Opus 4.7) under Tim's harness, marathon directive

This HANDOFF closes the experience-layer phase. It is deliberately written to separate **paper state** ("the code exists") from **verified state** ("the behaviour has been observed working") so the next phase is not built on optimism.

Per-sprint detail in:

- `.archive/handoffs/sprint-7-handoff.md` — Visual venture identity
- `.archive/handoffs/sprint-8-handoff.md` — The Bridge
- `.archive/handoffs/sprint-9-handoff.md` — The Watch + The Day
- `.archive/handoffs/sprint-10-handoff.md` — Streaming Sections + Loop 1
- `.archive/handoffs/sprint-11-handoff.md` — Command bar + Loop 8 reactive

---

## What shipped (substrate built — paper state)

Five sprints, single marathon session. The code is committed, the migrations are applied, the routes are registered. No claim is made here that any of it has been exercised end-to-end against real external services.

### Migrations applied

| # | File | Sprint | Purpose |
|---|---|---|---|
| 0008 | `0008_venture_identity.sql` | 7 | venture mark / accent / sparkline columns |
| 0009 | `0009_bridge_aggregation.sql` | 8 | `bridge_tiles` SQL function for single-roundtrip portfolio query |
| 0010 | `0010_day_dismissals.sql` | 9 | `day_item_dismissals` table |
| 0011 | `0011_streaming_sections.sql` | 10 | `documents.status` enum extended (`drafting`, `cancelled`, `drafting_orphaned`); `loop_threads` + `loop_thread_messages` |
| 0012 | `0012_anomaly_fingerprints.sql` | 11 | `anomaly_fingerprints` table; `AnomalyFingerprintSource` type |

Five migrations, applied to project `bahocpuzgrdtcrulicqz` via Supabase MCP.

### Routes registered (visible in `pnpm build` output, sprint-introduced)

- `/` — Bridge (replaced legacy dashboard; `/dashboard` 308s here)
- `/day` — The Day curated list
- `/ventures/[slug]/strategy` — Loop 1 conversation surface
- `/api/loops/[loopId]/invoke` — streaming Loop SSE endpoint
- `/api/loops/runs/[runId]/cancel` — cancellation handle
- `/api/command-bar` — command-bar SSE endpoint
- `/api/cron/loop8-threshold` — Loop 8 threshold cron entry
- `/api/webhooks/[source]` — extended with Loop 8 fire-and-forget on `source=stripe`

### Test files added (substrate)

17 test files total in repo, 153 tests passing. New in this phase:

- `tests/components/venture/sparkline.test.tsx`
- `tests/lib/venture/state-derivation.test.ts`
- `tests/lib/venture/bridge-db.test.ts`
- `tests/lib/watch/narrate.test.ts`
- `tests/lib/day/curate.test.ts`
- `tests/lib/loops/parser.test.ts`
- `tests/lib/command-bar/router.test.ts`
- `tests/lib/loops/loop-8/dedup.test.ts`

### Substrate modules added

`lib/venture/marks`, `lib/venture/state-derivation`, `lib/db/bridge`, `lib/db/venture-bridge`, `lib/db/day`, `lib/db/threads`, `lib/watch/narrate`, `lib/watch/realtime`, `lib/day/curate`, `lib/loops/parser`, `lib/loops/runner`, `lib/loops/skills/*`, `lib/loops/loop-8/{reactive,triggers,dedup}`, `lib/command-bar/router`.

### Components added (sprint-introduced)

VentureMark, Sparkline, StateDot, ConnectionChip, VentureStripe, FunctionTile, VentureBridge, Bridge, VentureTile, TimeOfDayProvider, LiveClock, BridgeDayToggle, Watch, WatchEntry, Day, DayItem, StreamingDocument, StreamingSection, ConversationThread, MessageBubble, CommandBar.

---

## What is verified (observed working at HANDOFF time)

Every claim in this section was observed running on commit `581aa9f` immediately before HANDOFF. No claim was made by extrapolation from sprint-level rubrics.

| Gate | Command | Result | Run at HANDOFF time |
|---|---|---|---|
| Type check | `pnpm typecheck` (`tsc --noEmit`) | exit 0, no output | yes |
| Lint | `pnpm lint` (`eslint .`) | exit 0, no errors | yes |
| Unit tests | `pnpm test --run` (`vitest run`) | **17 files passed, 153 tests passed**, 1.18s | yes |
| Production build | `pnpm build` | exit 0, all routes compiled, middleware bundled | yes |

Bright lines verified by code inspection (not just rubric scoring):

- Every Loop trigger funnels through `runStreamingLoop()` which calls `buildAgentPrompt()` once. No parallel prompt path exists in the repo (`lib/loops/runner.ts:1-80`).
- Loop 8 reactive trigger envelope carries `ventureId` non-null end-to-end; the three adapters in `lib/loops/loop-8/triggers.ts` all require it (lines 28, 53, 83).
- Command-bar router resolves venture names only against the caller-supplied `visibleVentures` list (`lib/command-bar/router.ts:141-165`); never widens.
- Streaming parser rejects unknown section kinds and comments missing `section=`/`ref=` — covered by the parser test suite (`tests/lib/loops/parser.test.ts`).

That is the totality of what is verified.

---

## What is NOT verified (explicit gaps)

These items are substrate-built but have not been exercised against the real external surface they exist to integrate with. Listing them so the next operator does not assume they work.

### 1. Loop 1 end-to-end with the real Anthropic API

**Status:** substrate built, no live invocation yet.

The streaming runner (`lib/loops/runner.ts`), the SSE endpoint (`/api/loops/[loopId]/invoke`), the parser (`lib/loops/parser.ts`), the StreamingDocument component, the conversation thread persistence (`loop_threads` + `loop_thread_messages`), and the Loop 1 strategy skill prompt are all in place. The parser is heavily tested in isolation against synthetic streamed tokens.

**Not exercised:** the Anthropic SDK has not been called with the real Loop 1 system prompt streaming through the parser into a live Document with token-by-token persistence. The prompt could under-specify the `###section`/`###comment` protocol and cause `parser_error` → `drafting_orphaned` on first real run. Or the system prompt could over-specify and the model could refuse to produce the expected sections.

The substrate cannot verify itself here — it requires a live Anthropic call.

### 2. Loop 8 reactive end-to-end with a real Stripe webhook

**Status:** substrate built, no synthetic webhook fired yet.

The webhook route (`/api/webhooks/[source]/route.ts`), the Stripe adapter (`triggerLoop8FromStripe`), the dedup layer (`lib/loops/loop-8/dedup.ts` with the SHA-256 fingerprint and 1h window), and the Loop 8 investigator skill prompt are all in place. The dedup logic is unit-tested in isolation (`tests/lib/loops/loop-8/dedup.test.ts`).

**Not exercised:** no webhook (real or simulator) has been delivered to the deployed URL. The webhook signature path currently authenticates on `WEBHOOK_SECRET` shared-token, not Stripe HMAC (already documented as Phase 3 debt in ROADMAP.md:251). The `venture` query-param resolution path has not been exercised against a real Stripe payload shape. The fire-and-forget `void triggerLoop8FromStripe(...)` invocation is not tested under load — it could swallow errors silently.

The dedup unit tests prove the fingerprint logic; they do not prove that the webhook → Loop 8 chain holds end-to-end.

### 3. Operator-load measurement (the Nov 1 gate criterion)

**Status:** currently uncomputable, meaningful only after one week of production runs.

The Nov 1 gate criterion is *"≥50% of Documents originate from a Loop"* (per `EXPERIENCE-LAYER-PHASE.md` success criterion 7). Today every Document in the database was operator-authored during the build session — the ratio is 0%. There is no way to compute the gate metric until the deployed instance has been used for a working week with both Loop 1 strategy invocations and Loop 8 reactive triggers in normal operator flow.

The measurement query is straightforward (`select loop_name, count(*) from documents where created_at > now() - interval '7 days' group by loop_name`) and can be run on demand once data exists. It is not running today; it cannot be running today.

---

## Exact next step

**Two debug sessions, post-deploy, in this order.**

1. **Loop 1 live invocation debug session.** Deploy the current branch to `app.solodesk.ai`. Open `/ventures/<some-slug>/strategy`. Type a real strategy question. Watch the SSE stream. If the parser fires `parser_error`, capture the raw Anthropic output, tighten the system prompt, redeploy, retry. Iterate until one full Loop 1 run lands a Document with all expected Section kinds in `status='reviewing'`. Document the final prompt revision in a follow-up commit.

2. **Stripe webhook simulation debug session.** Use the Stripe CLI (`stripe trigger invoice.payment_succeeded`) or a hand-crafted curl against `app.solodesk.ai/api/webhooks/stripe?venture=<slug>` with the matching `WEBHOOK_SECRET` header. Verify a Loop 8 Document lands in `documents` with the expected fingerprint row in `anomaly_fingerprints`. Re-trigger with the same payload, verify dedup fires (no second Document, fingerprint row idempotent). Cancel a streaming Loop 8 run via `/api/loops/runs/<runId>/cancel`, verify `status='cancelled'`.

Both sessions should produce a short addendum to this HANDOFF documenting the verified live behaviour and any prompt or wiring changes that landed.

Only after both addenda exist should the operator-load measurement begin (it needs a week of post-deploy operator activity, which the two debug sessions establish baseline for).

---

## Known debt

- **Loop-0 dispatch seam** — audit ran at HANDOFF time. Findings filed at `.claude/sprints/sprint-12-loop-0-seam.md`. Summary: `triggerLoop8()` is a single funnel for Loop 8 specifically (loopName hardcoded); `routeCommand()` is a clean pure-function seam for command-bar input but the dispatch switch is inlined in the route handler. A future Loop 0 (portfolio orchestrator) cannot intercept either dispatch path without either rewriting the trigger adapters or forking the route handler. Sprint 12 proposal documents a minimal two-file refactor that introduces the seam without changing current behaviour. Not scheduled. Trigger conditions for scheduling listed in the proposal.
- **Cross-venture portfolio recall sentinel** for `buildAgentPrompt()` — command-bar `decisions_search` currently requires a venture name. Cross-venture sentinel deferred (noted in `app/api/command-bar/route.ts:152-157`).
- **SSE checkpoint/replay endpoint** — Sprint 10 spec mentioned per-run checkpoint stream. Page reload reads partial Document from DB instead. Sufficient until invocation rates climb.
- **Streaming runner with mocked Anthropic SDK in tests** — parser is heavily tested; runner orchestration is not. Mocked Anthropic fixtures would add coverage for marginal benefit; deferred.
- **Severity-based routing for Loop 8** — every Loop 8 Document goes to the standard reviewing path. Severity scoring lives in the agent's output, not the routing layer.
- **Old `/api/cron/daily-digest` cron** — kept until Loop 8 reactive is proven live (see "Exact next step"). Remove after debug session 2 produces a verified Loop 8 Document from a real webhook.
- **Stripe HMAC signature validation** — webhook auth is shared-secret today (`WEBHOOK_SECRET` header). Per-provider HMAC via `getConnection()` is queued for Phase 3 per ROADMAP.md:251.
- **Lighthouse a11y measurement on Bridge / Day / Strategy** — operator-driven on deployed instance, not part of the build session.

---

## Bright lines preserved

The phase preserved the bright lines listed in CLAUDE.md without exception. Audit by inspection:

- Cross-venture isolation: `bridge_tiles` filters at SQL layer; `loadDayItems`, `listEventsForVentures`, command-bar router, Loop 8 trigger envelope all carry `ventureId` non-null.
- `buildAgentPrompt()` single funnel: every Loop invocation routes through `runStreamingLoop` → `buildAgentPrompt`; no parallel path exists.
- Typed Sections: parser enforces; Loop 1 and Loop 8 system prompts both restrict output to enum kinds.
- Comments anchor to Sections with evidence pointers: parser rejects globals.
- No flat artifacts: every Loop output is a Document.
- No external auto-send: Watch is read-only, Day dismissal is operator click, command-bar Loop 8 invocation is operator-initiated, Loop 1 send is operator click.
- Internal Loop activity is observation: runner emits Watch events for section closure / agent-to-critic handoff without operator click (per Phase 0 CLAUDE.md edit).
- Document approval is single operator action with Section-state enforcement at approval time (per Phase 0 CLAUDE.md edit).
- Visual rules: no emoji, no gradients, no shadows, square corners, Phosphor regular icons only, Inter font (Söhne deferred).

---

## Recommendation

**Phase 3 (tldraw) is ready to scope but should not begin until the two debug sessions above have produced verified evidence that Loop 1 and Loop 8 reactive work end-to-end on the deployed instance.**
