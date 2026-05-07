# Sprint 11 — Command bar + Loop 8 reactive

Date drafted: 2026-05-07
Phase: Experience layer (5 of 5 — final)
Estimated build sessions: 2-3
Depends on: Sprints 7-10

## Position

Final sprint of the experience layer. Two surfaces that pull everything together: the cross-venture command bar, which is the operator's conversational entry point, and Loop 8 redefined as event-driven and reactive — the first proactive Loop in the system.

## Rationale

The command bar is what makes "feels alive across the portfolio" possible — operator can ask a question scoped to one venture or all ventures from anywhere in the app, and the response materializes in The Watch as a live entry. Without it, the operator is still navigating to the right route to get answers.

Loop 8 reactive completes the proactive surface. Currently Loop 8 is a daily metrics digest — passive, scheduled. Reactive Loop 8 fires on real events (Stripe webhook, threshold breach, anomaly) and drops a Document automatically. This is the surface that produces value while the operator is asleep.

## Scope

### Cross-venture command bar

Persistent in chrome (top of every authed page). Triggered with `⌘K` (Mac) or `Ctrl+K` (Windows/Linux) or click on a command-bar pill in the top chrome.

Layout:
- Modal-style overlay (not actually `position: fixed` — uses normal-flow modal pattern per design system)
- Single text input, large, focus-trapped
- Below input: recent queries (last 5) and suggested queries (rotating)
- Below that: streaming response area when query is in flight

Query routing:
- Parse query → infer scope (portfolio | venture-specific | function-specific)
- Construct buildAgentPrompt call with appropriate ventureId (or "portfolio" sentinel for cross-venture)
- Stream response via SSE
- On query completion, also write a Watch entry: "Operator asked: [query]. Response delivered."

Common query patterns to support in v1:
- "What's happening with [venture]?" → multi-source synthesis: recent Documents, Watch entries, connection state
- "Show me everything that needs my attention" → curate The Day on demand
- "Why did [venture] [metric] [direction]?" → triggers ad-hoc Loop 8 on that metric
- "What did I decide about [topic]?" → recallContext over decisions corpus, scoped to visible ventures
- "Draft a [function] [artifact] for [venture]" → invokes appropriate Loop with task

Membership scoping:
- Member with 2 assigned ventures cannot query about a third venture
- Cross-venture queries return synthesized results only across visible ventures
- Verify enforcement at the buildAgentPrompt layer, not the client layer

Response surface:
- Result renders inline in command bar overlay
- Result also appears as a Watch entry (synthesized, not the full text — a summary line)
- If result references a Document, link to it inline
- Operator can dismiss command bar; result persists in Watch

### Loop 8 reactive

Replaces the current Loop 8 implementation (daily metrics digest scheduled cron).

Trigger types:
1. **Webhook** — Stripe webhook events (`invoice.paid`, `customer.subscription.deleted`, `charge.failed`) trigger Loop 8 evaluation
2. **Threshold** — daily check (cron) compares latest metric vs trailing 7-day window; fires if outside ±2 stddev
3. **Manual** — operator triggers via command bar ("Why did Kounta MRR drop?")

Loop 8 behavior on trigger:
1. Receive trigger event with metric context (venture_id, metric_type, current_value, prior_value)
2. Call `buildAgentPrompt({ skill: 'metrics_investigator', ventureId, task })` with the trigger context
3. Stream a Document of typed Sections per existing substrate
4. If anomaly is concerning (threshold breach severity high), surface in The Day automatically
5. If anomaly is informational, surface in The Watch only

Document Section structure for Loop 8 output:
- Context (what triggered this)
- Recommendation (what the operator should consider)
- Evidence (the data supporting the recommendation)
- Risk (what could be wrong with this analysis)
- Kill criteria (when this concern is no longer valid)

Deduplication:
- Multiple trigger events for the same anomaly within 1 hour collapse to single Document run
- Use `events` table fingerprint (venture_id + metric_type + day) as dedup key

### Removal

Old Loop 8 daily-digest cron is removed. Reactive Loop 8 produces equivalent or better signal without scheduled noise. Operators who liked the daily summary can ask the command bar "What changed today across the portfolio?" — this routes to the same Loop 8 in cross-venture mode.

## Acceptance criteria

### Command bar
- [ ] `⌘K` opens command bar from any authed route
- [ ] Click on chrome pill also opens command bar
- [ ] Recent queries (last 5) and suggested queries (rotating set of 6) visible on open
- [ ] Operator can type a query, hit Enter, see streaming response
- [ ] Common queries work end-to-end:
  - [ ] "What's happening with Kounta this week?" → returns synthesized state
  - [ ] "Show me everything that needs my attention" → returns curated Day items
  - [ ] "Why did Counsel's Stripe MRR drop?" → triggers Loop 8 ad-hoc
  - [ ] "What did I decide about Mercury direct API?" → returns relevant decision Documents
- [ ] Member scoping enforced — non-admin user querying about an unassigned venture gets graceful "no access" response
- [ ] Watch entry written on query completion
- [ ] Command bar dismissible with `Escape`

### Loop 8 reactive
- [ ] Stripe webhook events trigger Loop 8 evaluation (test with synthetic webhook)
- [ ] Threshold cron runs daily, fires Loop 8 if outside ±2 stddev (verify with synthetic data)
- [ ] Manual trigger via command bar invokes Loop 8 with provided context
- [ ] Loop 8 produces a Document of typed Sections (Context, Recommendation, Evidence, Risk, Kill criteria)
- [ ] High-severity anomalies surface in The Day automatically
- [ ] Informational anomalies surface in The Watch only
- [ ] Deduplication: multiple webhooks for same anomaly within 1 hour produce single Document
- [ ] Old Loop 8 daily-digest cron is removed (verify it does not fire after deployment)

## Definition of done

- All acceptance criteria checked with proof
- Stripe webhook integration tested with Stripe's webhook simulator
- Command bar works on Mac (`⌘K`), Windows (`Ctrl+K`), keyboard nav-friendly
- Loop 8 deduplication verified with synthetic burst of identical events
- All existing Loop 8 baseline tests still pass (renamed to reactive variant)
- HANDOFF.md committed
- Phase HANDOFF.md committed (Phase done — see EXPERIENCE-LAYER-PHASE.md)
- ROADMAP.md updated to mark phase complete
- Phase retrospective Document written into operator's portfolio scope

## Quality rubric (SoloDesk specific)

| Criterion | What to check |
|-----------|--------------|
| Bright line: cross-venture leakage | Command bar enforces membership scope at buildAgentPrompt layer. Test with multi-tenant scenario |
| Bright line: every loop through buildAgentPrompt | Reactive Loop 8 trigger path uses buildAgentPrompt. No parallel prompt construction |
| Bright line: typed Sections | Loop 8 output is typed Sections of the kinds in the existing enum. No new Section kinds invented |
| Webhook idempotency | Same Stripe webhook delivered twice does not produce two Documents. Verify with replay |
| Deduplication | Anomaly fingerprint dedupes within 1 hour window. Verify with synthetic burst |
| Command bar latency | First token within 2 seconds of Enter. Full response under 10 seconds for common queries |
| TypeScript | Query types and trigger types are discriminated unions. No `any` |
| Member scoping | Non-admin cannot query unassigned venture. Verify both UI gating and server-side enforcement |

**Score threshold:** Must pass 7/8. The three bright-line criteria and member scoping are non-negotiable.

## Out of scope

- Voice command bar
- Loop 8 cross-venture synthesis (single venture only — but command bar can ask about portfolio in synthesizer mode)
- Custom anomaly detection rules per venture (uses ±2 stddev rule for v1)
- ML-based anomaly detection
- Slack/email notification routing for Loop 8 outputs (everything stays in-app)
- Command bar history search beyond last 5
- Saved queries / shortcuts

## Adversarial check questions

- What if a member uses the command bar to ask about a venture they cannot see? Returns "I don't have access to that venture for you" — does not 500
- What if Stripe webhook fires 100 events in 1 second? Loop 8 deduplicates and produces ≤N Documents (one per anomaly fingerprint)
- What if the command bar query is ambiguous ("show me the thing")? Falls back to suggested queries with prompt for clarification — no fabricated answer
- What if the command bar is asked about a venture by a misspelled name? Fuzzy match to nearest visible venture or asks for clarification
- What if Loop 8 ad-hoc is invoked and the metric data is missing (connection broken)? Loop 8 produces a Document acknowledging missing data, doesn't fabricate analysis
- What if the operator asks a question that would require reading another operator's data? Refuses, returns scope-limited response
- Does the command bar work when offline (network drops)? Shows clear error state, retry button, doesn't crash
- Does removing the old daily-digest cron break any existing scheduled job dependencies? Verify with cron logs
- Does the Watch entry written on query completion respect membership? A member querying their venture writes a Watch entry visible only in their scope — admins see it too if it's a shared venture

## Files affected

New files:
- `components/chrome/CommandBar.tsx`
- `components/chrome/CommandBarOverlay.tsx`
- `lib/command-bar/router.ts` (parses query, infers scope, routes to handler)
- `lib/command-bar/handlers/` (one handler per query pattern: synthesize, curate-day, decisions, draft, etc.)
- `app/api/command-bar/route.ts` (SSE endpoint)
- `lib/loops/loop-8/reactive.ts` (replaces existing daily implementation)
- `lib/loops/loop-8/dedup.ts` (anomaly fingerprint + dedup window)
- `app/api/webhooks/stripe/route.ts` (extends existing webhook handler with Loop 8 trigger)

Modified files:
- `app/layout.tsx` or chrome equivalent (mount CommandBar globally)
- `lib/agent/buildAgentPrompt.ts` (add 'portfolio' ventureId sentinel for cross-venture queries)
- `lib/loops/loop-8/index.ts` (re-export reactive variant)
- `supabase/migrations/0009_anomaly_dedup.sql` (anomaly_fingerprints table)

Removed:
- Old Loop 8 daily-digest cron registration

Tests:
- `lib/command-bar/router.test.ts`
- `lib/loops/loop-8/dedup.test.ts`
- `lib/loops/loop-8/reactive.test.ts`

## Dependencies on prior work

- Sprints 7-10 complete
- Stripe webhook endpoint exists (current substrate)
- buildAgentPrompt() supports streaming mode (Sprint 10)
- recallContext() works across visible ventures (current substrate)
- Watch and Day surfaces functional (Sprint 9)

## Phase completion checklist (run at end of this sprint)

- [ ] All five sprint HANDOFF.md files committed and merged
- [ ] Adversarial evaluator session run on each sprint, scores ≥7/8 on each rubric
- [ ] ROADMAP.md updated: Sprints 7-11 marked complete, phase entry marked complete
- [ ] CLAUDE.md updated with all new and modified bright lines
- [ ] design-system.md updated with venture identity vocabulary, Bridge layout, time-of-day chrome
- [ ] Phase retrospective Document written into operator's portfolio scope
- [ ] Demo recording committed: end-to-end flow from cold open through command bar to Document approval
- [ ] Manual operator load measurement: count Documents originating from Loops vs operator-authored across the prior week. Target: ≥50% from Loops.

If phase completion checklist passes, the experience layer is done and the Nov 1 productise gate is genuinely defensible.
