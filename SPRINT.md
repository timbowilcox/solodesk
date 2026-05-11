# Sprint B.1 — Autonomy control plane

**Repo:** solodesk
**Phase:** B (autonomy + modal foundation), sprint 1 of 7
**Spec authority:** `AUTONOMY-MODEL.md` (canonical), CLAUDE.md (conventions)
**Estimated build sessions:** 2-3

## Scope

The substrate that converts SoloDesk's agent layer from "agents call tools directly through the SDK" to "every tool call routes through the autonomy gateway, which is the only enforcement point." No UI. Pure plumbing. Phase B.2 builds the modal surfaces that consume the events this sprint emits.

Four tables, one gateway, one kill switch, one audit trail. Existing Loop invocations (Loop 1 / 4 / 8) retrofitted to route through the gateway. Skills get a `level` field in frontmatter. The gateway resolves the effective level per the four-scope precedence (operator → venture → loop → skill) and enforces guardrails before delegating to the tool. Anomaly checks and hard-advise-only checks happen at the same layer.

**Substitutions and deviations from spec:**

- **Migration numbering.** Next free slot is `0013_autonomy_control_plane.sql`. The four tables (autonomy_levels, guardrails, escalations, actions) land in a single migration — they're co-dependent at the FK level.
- **Trust ratchet logic deferred to B.4.** This sprint creates the `eval_runs` table and the `actions` audit trail that the ratchet reads from, but the eligibility engine, promotion modal trigger, and demotion logic all land in B.4 against accumulated real data.
- **Modal surfaces deferred to B.2.** The gateway *records* the need for a Decision/Escalation/Promotion modal in a `modal_events` row (table created here) but the React components and queue manager land in B.2.
- **Kill switch UI keystroke deferred to B.2.** This sprint ships the DB contract and the server-side check. The `⌘⇧.` global keybinding lands when the authed layout gets the kill-switch indicator.
- **Hard-advise-only enforced at the gateway, not registration.** The spec mentions "enforced at registration" but the gateway has to check on every call anyway (a previously-non-sensitive skill could be flagged later). Gateway is the only enforcement point.
- **Guardrail catalogue v1 covers the seven types from AUTONOMY-MODEL §5.** Budget cap, communication cap, recipient allowlist, brand voice constraint, topic blocklist, time window, volume cap. Anomaly trigger spec lives in B.4.

## Acceptance criteria

### Tables and migrations

- [ ] Migration `0013_autonomy_control_plane.sql` applies cleanly
- [ ] `autonomy_levels` table: scope_type, scope_id, level, set_at, set_by, hard_advise_only — per AUTONOMY-MODEL §5 schema sketch
- [ ] `guardrails` table: scope_type, scope_id, guardrail_type, config jsonb, active, created_at
- [ ] `escalations` table: action_id, skill_id, reason, trigger_type, escalated_at, resolved_at, resolution
- [ ] `actions` table (audit trail): skill_id, venture_id, tool, params jsonb, autonomy_level, modal_surfaced bool, result jsonb, error text, duration_ms, created_at
- [ ] `eval_runs` table (substrate for B.4): action_id, skill_id, outcome enum ('approved','rejected','deferred','anomaly','breach'), notes, evaluated_at
- [ ] `modal_events` table (substrate for B.2): archetype enum (the eight kinds), scope_id, scope_type, action_id (nullable), fired_at, dismissed_at (nullable), action_taken text (nullable), time_to_action_ms int (nullable)
- [ ] `operator_kill_switch` table: operator_id PK, killed bool default false, killed_at, killed_reason text, restored_at — single-row-per-operator contract
- [ ] All tables get the standard `id uuid pk default gen_random_uuid()` (where not already a natural PK)
- [ ] Indexes: `actions(skill_id, created_at desc)`, `actions(venture_id, created_at desc)`, `eval_runs(skill_id, evaluated_at desc)`, `escalations(skill_id, escalated_at desc)`, `modal_events(scope_id, fired_at desc)`

### Gateway

- [ ] `/lib/autonomy/gateway.ts` exposes `executeToolCall({ skill, tool, params, ventureId, loopRunId })` as the single tool-call entry point
- [ ] `resolveAutonomyLevel(skill, ventureId)` walks scope precedence (operator → venture → loop → skill) and returns the effective level. Hard-advise-only flag at any scope forces `advise` regardless of lower scopes
- [ ] `resolveGuardrails(skill, ventureId)` returns the merged guardrail set across all four scopes (more-specific scopes add to less-specific, never remove)
- [ ] `checkGuardrails(tool, params, guardrails)` returns either `null` (pass) or `{ breached: GuardrailType, detail: string }`
- [ ] Detection stubs for the five anomaly cases from AUTONOMY-MODEL §7 — return `null` in v1 (B.4 wires the real detection). Stub records the call site so B.4 knows where to plug in.
- [ ] Level-based routing per AUTONOMY-MODEL §6 pseudocode:
  - `advise` → write `modal_events` row with archetype `decision`, return without invoking tool
  - `operate` + gate tool → same as advise
  - `operate` + non-gate → invoke tool, log `actions` row
  - `steward` → invoke tool, log `actions` row
- [ ] Gate-tool identification — `isGate(tool)` checks against a curated list: `send_email`, `publish_post`, `pay_invoice`, `sign_contract`, `execute_trade`, `modify_production_data`, `allocate_budget`
- [ ] Kill switch check at the top of `executeToolCall` — if `operator_kill_switch.killed = true`, force level to `advise` regardless of resolved level
- [ ] Every `executeToolCall` writes an `actions` row before returning, regardless of level or outcome (including errors)

### Skill frontmatter

- [ ] Skill loader (`/lib/skills/load.ts`) parses new frontmatter fields: `level`, `hard_advise_only`, `guardrails` (inline yaml or path to `/.claude/guardrails/<name>.yaml`)
- [ ] Existing skill files (Loop 1, Loop 4, Loop 6, Loop 8, Loop 9 skills + their critics) updated to include `level: advise` (default) and `hard_advise_only: false`
- [ ] Skill loader refuses to register a skill missing `level` or any of the existing required fields (`budget_tokens`, `budget_cents`, `counterpart`)

### Retrofit of existing Loop invocations

- [ ] Loop 1 (Strategy / office-hours) — agent invocations route through the gateway
- [ ] Loop 4 (Content) — both writer and critic invocations route through the gateway
- [ ] Loop 6 (Support) — classifier and replier invocations route through the gateway
- [ ] Loop 8 (Metrics + reactive) — investigator invocations route through the gateway (webhook, threshold cron, manual all converge on the same path per existing Sprint 11 architecture)
- [ ] Loop 9 (Intel) — scout and critic invocations route through the gateway
- [ ] `runStreamingLoop` (Sprint 10 substrate) routes its tool calls through the gateway

### Kill switch

- [ ] Server action `killAllAutonomy(reason?)` flips `operator_kill_switch.killed = true`, records timestamp + reason
- [ ] Server action `restoreAutonomy()` flips `killed = false`, records `restored_at`
- [ ] While killed, `resolveAutonomyLevel` returns `advise` for every scope
- [ ] Kill state survives process restart (DB-backed, not in-memory)
- [ ] Restore is a separate explicit action — no toggling, no auto-restore

### Hard-advise-only

- [ ] `hard_advise_only` flag on `autonomy_levels` is checked at gateway entry
- [ ] Setting a scope to `hard_advise_only=true` forces effective level to `advise` even if trust ratchet would promote (B.4 dependency: the ratchet must read this flag before firing a Promotion modal)
- [ ] Hard-advise-only at a parent scope (e.g. venture) cannot be overridden by a more-specific scope (e.g. skill) — the most-restrictive flag wins for this field

## Definition of done

- [ ] All AC checked with proof (test output, query snapshots, grep results)
- [ ] HANDOFF.md (Sprint B.1) committed
- [ ] ROADMAP.md updated — B.1 marked shipped, B.2 marked next
- [ ] All work committed with conventional-commit messages
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all clean
- [ ] Adversarial evaluator session run (separate Claude Code session, see CLAUDE.md harness rules)
- [ ] Adversarial check questions answered

## Quality rubric

| Criterion | What to check |
|-----------|---------------|
| Bright line: gateway is the only enforcement point | Grep test: no file outside `/lib/autonomy/` imports `autonomy_levels`, `guardrails`, `escalations`, or calls `resolveAutonomyLevel` directly. Skills never branch on level |
| Bright line: every tool call writes an `actions` row | Trace any retrofitted Loop invocation. Verify the row exists for both successful and erroring calls |
| Bright line: kill switch global | While `killed=true`, no tool call invokes anything. Every call surfaces a Decision modal record. Tested by flipping the bit mid-Loop |
| Bright line: cross-venture isolation preserved | The gateway never returns a level or guardrail set from a different venture's scope. Verified by adversarial test: set Venture A to Steward, Venture B to Advise, call skill on B — gateway must return Advise |
| Hard-advise-only unbypassable | Set Skill X to hard_advise_only=true at venture scope. Promote Skill X at skill scope to Steward. Effective level must be Advise. Verified by unit test |
| Audit completeness | For 50 retrofitted Loop invocations across a test run, `actions` row count = 50 exactly. No missing, no duplicates |
| Guardrail merging | Budget cap at venture scope ($500/week) + budget cap at skill scope ($100/week) → effective cap is the more restrictive ($100/week). Verified by unit test |
| TypeScript | `AutonomyLevel`, `GuardrailType`, `Scope`, `EffectiveLevel`, `KillSwitchState` are discriminated unions / branded types. No `any` in `/lib/autonomy/` |

**Score threshold:** 7/8. Bright lines non-negotiable.

## Out of scope

- Trust ratchet eligibility engine (B.4)
- Promotion modal logic (B.4 — depends on real `eval_runs` data)
- Demotion on rejection threshold (B.4)
- Anomaly detection real logic (B.4 — stubs land here, behaviour lands there)
- Modal React components (B.2 — this sprint writes `modal_events` rows but nothing renders)
- Modal queue manager (B.2)
- Visual autonomy badge (B.2)
- Kill switch global keybinding (B.2)
- Settings UI for setting levels at scopes (B.2 — command palette flow)
- Audit trail UI (later — this sprint just writes the rows)
- Per-operator boundaries within a venture (v0 keeps venture-scoped data; multi-operator workspace isolation is Phase C)
- Operator-extensible guardrail types (Phase C — v1 guardrail catalogue is fixed at the seven types from AUTONOMY-MODEL §5)
- ML-based anomaly detection (Phase 3 candidate)
- RLS on the autonomy tables (Phase C — flips on at productisation)

## Adversarial check questions (to be answered in HANDOFF)

- Skill calls a tool directly via the Anthropic SDK, bypassing the gateway? Expected: caught at code review / lint — grep test in CI fails. No runtime defence is possible if a skill author bypasses the helper; the discipline is harness-enforced.
- Two concurrent calls to the same skill at the moment of a level change? Expected: each call resolves its level at gateway entry; calls already past the resolution see the old level. Race window is microseconds; both outcomes (old vs new level) are valid.
- Kill switch flipped mid-Loop run? Expected: every tool call after the flip is re-resolved to Advise. The current Loop continues but every external action surfaces a Decision modal instead of executing. Operator can complete the Loop manually or abandon.
- Guardrail config in `guardrails.config` is malformed JSON? Expected: `checkGuardrails` treats malformed config as a breach (fail-closed). `escalations` row created with `trigger_type='config_error'`.
- A skill is registered with no `level` field? Expected: skill loader refuses to register. No silent default to `advise`; the missing field is a definition error.
- Operator sets a venture to `hard_advise_only=true` but a teammate at member role tries to promote a skill within that venture to Steward? Expected: gateway returns Advise. The teammate's promotion attempt is recorded but has no effect at the gateway. Phase C surfaces this in the audit trail UI; B.1 just enforces.
- Loop 8 reactive (Sprint 11) was fire-and-forget on Stripe webhook — does the retrofit break that? Expected: gateway is called inside `triggerLoop8FromStripe`; the fire-and-forget wrapper is preserved at the webhook handler level. Stripe still gets its 200 within milliseconds.
- An `actions` row insert fails (transient DB error)? Expected: the tool call is *not* invoked — fail-closed. Audit is the substrate for the trust ratchet; silent skips would corrupt every promotion decision downstream.
- The `runStreamingLoop` parser (Sprint 10) emits tool calls inside streamed Section events — does each one route through the gateway? Expected: yes. The streaming runner extracts the tool intent before invoking; gateway intercepts every extracted call.
- A skill's resolved level is `advise` but the operator never sees the Decision modal (B.2 not built yet) — what happens? Expected: `modal_events` row written, action *not* taken. Operator-facing this is invisible until B.2; in B.1 the row is the contract. Document this as a known temporary state in HANDOFF.
