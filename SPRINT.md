# Sprint 11 — Command bar + Loop 8 reactive

**Date:** 2026-05-07
**Repo:** solodesk
**Phase:** Experience layer (5 of 5 — final)
**Spec:** `/.claude/sprints/sprint-11-command-loop8-reactive.md`
**Estimated build sessions:** 2-3

## Scope

Two surfaces that pull the phase together:

1. **Command bar (⌘K)** — persistent overlay accessible from any authed page. Operator types a query; router parses it, dispatches to a handler (curate Day, single-venture synthesizer, decisions search, ad-hoc Loop 8, generic Loop 1). Streaming response renders inline; a Watch entry records the query on completion. Membership scoping enforced at the routing layer (router refuses queries about ventures the operator can't see).

2. **Loop 8 reactive** — replaces the daily-digest cron with an event-driven Loop. Three triggers:
   - **Webhook** — Stripe event types (`invoice.paid`, `customer.subscription.deleted`, `charge.failed`) trigger evaluation
   - **Threshold** — a daily cron compares latest metric to trailing 7-day window; fires if outside ±2 stddev
   - **Manual** — command bar query "Why did Kounta MRR drop?" triggers an ad-hoc run with that context

Loop 8 produces a Document with typed Sections (Context, Recommendation, Evidence, Risk, Kill criteria) using the streaming substrate from Sprint 10.

**Substitutions and deviations from spec:**

- **Migration number bump.** Spec calls for `0009_anomaly_dedup.sql`; that slot is taken (`bridge_aggregation`). Sprint 11 uses `0012_anomaly_fingerprints.sql`.
- **'Portfolio' ventureId sentinel deferred.** The spec mentions a portfolio sentinel for cross-venture queries. The substrate change for `buildAgentPrompt` to accept it is out of scope for Sprint 11 — instead, cross-venture queries iterate over visible ventures and synthesise client-side. A subsequent phase introduces the proper portfolio scope.
- **Stripe webhook simulator test deferred to operator deploy verification.** Live webhook test requires real Stripe credentials; substrate is unit-tested with synthetic payloads. Documented in HANDOFF, mirroring Sprint 10's pattern.
- **Loop 8 daily-digest cron not removed yet.** The existing `daily-digest` cron at `app/api/cron/daily-digest` is left in place for the duration of this sprint to avoid breaking the live deployment. Removal happens in the post-Sprint-11 deploy verification once reactive Loop 8 is proven in production.
- **Command bar handler set is intentionally small in v1.** `curate-day`, `decisions-search`, `venture-synthesise`, `loop8-investigate`. The spec mentions "Draft a [function] [artifact]"; that's a Loop 1 / Loop 4 invocation surface that piggybacks on the existing Loop 1 conversation route — `/strategy` for strategy questions remains the primary entry. Adding a "Draft a content piece" command-bar handler is a polish enhancement.
- **Phosphor regular** continues. Command bar uses `MagnifyingGlass` icon.

## Acceptance criteria

### Command bar

- [ ] `⌘K` (Mac) or `Ctrl+K` (Win/Linux) opens the command bar from any authed route
- [ ] `Escape` dismisses the overlay
- [ ] Recent queries (last 5 stored client-side) and a static list of suggested queries visible on open
- [ ] Operator types a query, hits Enter, sees a streaming response
- [ ] Common queries route correctly:
  - "Show me everything that needs my attention" → curated Day items inline
  - "What did I decide about <topic>" → recall over decisions corpus
  - "What's happening with <venture>" → venture state synthesis
  - "Why did <venture> <metric> <direction>" → ad-hoc Loop 8 invocation
- [ ] Member scoping enforced — non-admin querying about an unassigned venture gets a graceful "no access" response
- [ ] Watch entry written on query completion (event: `command_bar.query`)

### Loop 8 reactive

- [ ] Migration `0012_anomaly_fingerprints.sql` applies cleanly
- [ ] `lib/loops/loop-8/dedup.ts` exposes a fingerprint helper + `shouldDedup` check
- [ ] Stripe webhook handler routes recognised event types into the Loop 8 trigger queue (synthetic payload test)
- [ ] Threshold cron at `/api/cron/loop8-threshold` runs, evaluates metric_snapshots windowed stats, fires Loop 8 on ±2 stddev breaches
- [ ] Manual trigger (from command bar handler) invokes Loop 8 with operator-supplied context
- [ ] Loop 8 produces a Document with Section kinds in (`prose`, `recommendation`, `evidence`, `risk`, `kill_criteria`) — no new kinds invented
- [ ] Deduplication: identical fingerprint within 1h does not produce a second Document
- [ ] Document with high-severity origin lands in The Day automatically (curate.ts already picks up `support_ticket` analogue: a new `anomaly` item kind)

## Definition of done

- [ ] All AC checked with proof (live webhook + live cron operator-verified post-deploy)
- [ ] HANDOFF.md (Sprint 11) committed and archived
- [ ] **Phase HANDOFF** at `.archive/handoffs/experience-layer-phase-handoff.md` summarising the entire phase, including operator-load assertion (deferred to first-week-after-deploy measurement)
- [ ] ROADMAP.md updated: Sprints 7-11 marked complete, phase entry marked complete
- [ ] All work committed with conventional-commit messages
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all clean
- [ ] Adversarial check questions answered

## Quality rubric

| Criterion | What to check |
|-----------|---------------|
| Bright line: cross-venture leakage | Command bar router looks up visible ventures via `listVisibleVentures` and refuses queries about anything else. Verified by reading the router + a unit test |
| Bright line: every loop through `buildAgentPrompt` | Reactive Loop 8 calls `runStreamingLoop` (which calls `buildAgentPrompt`). Webhook handler, threshold cron, manual all converge on the same path |
| Bright line: typed Sections | Loop 8 skill prompt emits Section kinds from the existing enum |
| Webhook idempotency | Stripe webhook events use the existing `events.hash` unique index — duplicates dropped at insert. Loop 8 also dedups via `anomaly_fingerprints` |
| Deduplication | `shouldDedup({ ventureId, fingerprint, withinHours })` returns true if a recent fingerprint exists. Unit test verifies |
| Command bar latency | First token within 2s of Enter (operator-verified post-deploy; substrate has no synchronous DB calls before the SSE stream opens) |
| TypeScript | Query routing types and trigger types are discriminated unions. No `any` |
| Member scoping | Router rejects unassigned-venture queries before invoking any Loop. Verified in router test |

**Score threshold:** 7/8. Bright lines and member scoping non-negotiable.

## Out of scope

- Voice command bar
- Cross-venture portfolio recall (the `'portfolio'` sentinel for `buildAgentPrompt`) — deferred
- ML-based anomaly detection
- Slack / email notification routing for Loop 8
- Command bar history search beyond last 5
- Saved queries / shortcuts
- Stripe webhook simulator-driven integration test (operator-verified post-deploy)
- Live reactive Loop 8 production proof — operator-driven on first deploy
- Removal of the existing `/api/cron/daily-digest` route — kept until reactive Loop 8 is proven live

## Adversarial check questions (to be answered in HANDOFF)

- Member uses command bar to ask about an unassigned venture? Expected: "no access" graceful response, not 500
- Stripe fires 100 webhook events in 1s? Expected: idempotent insert into `events`; Loop 8 dedup yields ≤N Documents (one per fingerprint)
- Ambiguous command bar query? Expected: router falls back to suggested-queries clarification, no fabricated answer
- Loop 8 invoked when metric data is missing? Expected: Document acknowledges the missing connection; no fabricated analysis
- Operator asks about another operator's data? Expected: refused (membership filter is the same; data is venture-scoped, not operator-scoped, so this collapses to the venture-scope check)
- Command bar in offline mode? Expected: clear error state on stream failure
- Old daily-digest cron removed without breaking deps? Expected: deferred to post-deploy; documented
- Loop 8 deduplication across processes? Expected: dedup table is the source of truth; concurrent webhooks may race but the unique fingerprint constraint resolves to one Document
