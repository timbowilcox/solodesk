# Loop Chains

Loops never call each other directly (Barry's caution: direct chains bloat context and break debugging). They communicate through **artifacts** — one loop writes a row, another loop reads rows on its own cadence.

## Active chains

### `support → strategy`
- **From:** Loop 6 (support triage) when `classification = 'feature_request'`
- **Mechanism:** support-triage writes `decisions` row with `status = 'proposed'`, `generator_agent = 'support-triage'`
- **Picked up by:** Loop 1 (strategy) on next manual office-hours run, or weekly Friday review
- **Sprint introduced:** 6

### `metrics → strategy`
- **From:** Loop 8 (metrics) when an anomaly persists ≥ 7 days with `status = 'open'`
- **Mechanism:** metrics-rollup creates `decisions` row referencing the anomaly
- **Picked up by:** Loop 1 (strategy)
- **Sprint introduced:** 2 (creation), 3 (consumption)

### `intel → strategy`
- **From:** Loop 9 (intel) when `intel-critic` flags severity = `high`
- **Mechanism:** intel-critic creates `decisions` row with `generator_agent = 'intel-critic'`
- **Picked up by:** Loop 1 (strategy)
- **Sprint introduced:** 5

### `content → metrics`
- **From:** Loop 4 (content) when an artifact is `published`
- **Mechanism:** content publisher writes a `events` row with `type = 'content_published'`
- **Picked up by:** Loop 8 (metrics) — engagement metrics tied back via downstream Resend / Plausible webhooks
- **Sprint introduced:** 4

### `decisions → engineering` (external)
- **From:** Loop 1 (strategy) when `decisions.status = 'approved'` and decision implies a build
- **Mechanism:** No automation. Tim manually opens a Claude Code session in the relevant venture's repo with the decision content as the spec input.
- **Why no automation:** the build sessions live outside Skipper (in Kounta repo, mm-hub repo, etc). Skipper records the decision; it doesn't drive the build.

## Anti-chain rules

- No agent invokes another agent inline. Always artifact-mediated.
- No chain skips human approval where one is mandated. Human approval gates are non-bypassable.
- Chain depth max 2. If a chain wants to go A → B → C → D, redesign it.
- Every chain logged in `loop_runs.trigger` as `chained:<source-loop>`.

## Visualisation

```
                    ┌─────────────┐
                    │  HUMAN (Tim)│
                    └──────┬──────┘
                           │ approve / kill / spec
                           ▼
   ┌────────┐         ┌─────────┐         ┌────────┐
   │ Loop 9 │────────▶│ Loop 1  │◀────────│ Loop 8 │
   │ Intel  │         │Strategy │         │Metrics │
   └────────┘         └────┬────┘         └────────┘
                           │
                           │ (manual: open Claude Code)
                           ▼
                    ┌─────────────┐
                    │ Loop 2      │
                    │ Build/Ship  │  (in venture repo, not Skipper)
                    └──────┬──────┘
                           │
                           ▼
   ┌────────┐         ┌─────────┐
   │ Loop 6 │────────▶│ Loop 4  │
   │Support │         │ Content │
   └────────┘         └─────────┘
```
