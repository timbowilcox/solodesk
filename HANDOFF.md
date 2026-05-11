# HANDOFF — Sprint B.1: Autonomy Control Plane

**Branch:** `phase-b-overnight`
**Status:** Complete — tsc clean, 0 ESLint errors, 203 tests passing, build green

---

## What shipped

### Database — migration 0013_autonomy_control_plane.sql

Seven new tables, applied to Supabase production (ap-southeast-2):

| Table | Purpose |
|---|---|
| `autonomy_levels` | Scope-level autonomy settings (operator/venture/loop/skill) |
| `guardrails` | Declarative constraints per scope |
| `actions` | Audit trail — written BEFORE every tool call (fail-closed) |
| `escalations` | Gateway escalation records |
| `eval_runs` | Substrate for B.4 trust ratchet |
| `modal_events` | Modal surfacing telemetry (substrate for B.2) |
| `operator_kill_switch` | Single-row-per-operator global kill switch |

`ensure_kill_switch_row(p_operator_id uuid)` plpgsql helper added.

### Code — `/lib/autonomy/`

- **`types.ts`** — All shared types: `AutonomyLevel`, `ScopeType`, `GuardrailType`, `ModalArchetype`, `EscalationTrigger`, `EvalOutcome`, `SkillDef`, `EffectiveLevel`, `Guardrail`, `GuardrailBreach`, `ToolCallInput`, `ToolCallResult`, `KillSwitchState`

- **`gateway.ts`** — Main enforcement point. `executeToolCall()` is the single entry for all tool calls. Scope precedence: skill(0) > loop(1) > venture(2) > operator(3). Five anomaly detection stubs wired for B.4. Fail-closed on audit row insert error. All gate tools (send_email, publish_post, pay_invoice, sign_contract, execute_trade, modify_production_data, allocate_budget) require operate_gate modal even at operate level.

- **`skills-registry.ts`** — Runtime registry of 9 skills at `operate` level. `getSkillDef()` falls back to advise for unknown skills.

- **`kill-switch.ts`** — Server actions: `killAllAutonomy()`, `restoreAutonomy()`, `getKillSwitchState()`. All use `requireUserContext()`.

- **`index.ts`** — Barrel export.

### Code — `/lib/skills/load.ts`

Parses SKILL.md frontmatter and registers skills into the gateway's skills-registry. Validates required fields; throws on missing `level`.

### SKILL.md frontmatter updates (8 files)

All existing skills updated with `level: operate` and `hard_advise_only: false`:
`office-hours`, `adversarial-strategy`, `content-writer`, `content-critic`, `support-triage`, `support-replier`, `intel-scout`, `intel-critic`

### DB types — `/lib/supabase/types.ts`

Seven new table Row/Insert/Update type alias sets + seven `Database.public.Tables` entries. `ensure_kill_switch_row` added to `Database.public.Functions`.

### Retrofit — invoke route

`app/api/loops/[loopId]/invoke/route.ts` now calls `executeToolCall()` before opening the SSE stream. At advise level: returns 202 `{ gated: true, reason, actionId, modalEventId }`. At operate level with non-gate tool: proceeds with `runStreamingLoop`.

### Retrofit — Loop 8 reactive

`lib/loops/loop-8/reactive.ts` calls `executeToolCall()` before `runStreamingLoop`. Gated result returns `{ ok: false, error: "gated: ..." }`.

### Tests — `tests/lib/autonomy/gateway.test.ts`

30 unit tests covering:
- `isGate` pure function
- `checkGuardrails` all 7 guardrail types (budget_cap, recipient_allowlist, topic_blocklist, time_window, and stubs)
- `resolveAutonomyLevel` scope precedence (skill > venture, operator global apply, cross-venture isolation, hard_advise_only override)
- `checkKillSwitch` v0 single-operator mode
- `executeToolCall` routing decisions (operate+non-gate executes, kill switch gates, advise gates, operate+gate gates, guardrail breach gates, fail-closed on DB error)

---

## Decisions made (unattended)

See `DECISIONS-UNATTENDED.md`. Key:

- **B.1-D1:** All 9 existing skills registered at `operate` (not `advise`) so the system continues functioning before B.2 modal UI ships.
- **B.1-D2:** Gateway injected at invoke-API layer, not inside `runStreamingLoop`, to avoid row cleanup on gate results.
- **B.1-D3:** Kill switch v0 checks any `killed=true` row (no operatorId threading needed in single-operator mode).

---

## Blockers inherited

See `BLOCKERS.md`:
- B.2: Visual library commission and Söhne font licence (non-blocking for substrate)
- B.6: DNS routing for inbound email; Resend webhook secret

---

## What's next

**Sprint B.2:** Atrium modal foundation — glass modal container, 8 archetype components, modal queue, keyboard navigation, modal_events telemetry, frequency budget alarms, ⌘⇧. kill switch keybinding.
