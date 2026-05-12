# HANDOFF — Sprint B.4.5 + B.4.6: Modal→Action Bridge + Deferred Replay Dispatcher

**Branch:** `phase-b-overnight`
**Date:** 2026-05-12
**Status:** Complete — tsc clean, 0 ESLint errors, 242 tests passing (up from 203)
**Commits:** 4b2c9f1 → 2fa9972 (8 commits)

---

## What shipped

### 1. Migration 0015 — applied to production Supabase

Three schema changes. All applied and verified via Supabase MCP `list_tables`.

```sql
-- actions.via_modal — marks action rows re-executed from a modal approval
ALTER TABLE actions ADD COLUMN IF NOT EXISTS via_modal boolean NOT NULL DEFAULT false;

-- modal_events.payload — archetype-specific context at fire time
ALTER TABLE modal_events ADD COLUMN IF NOT EXISTS payload jsonb;

-- deferred_actions — carries full replay payload for gated tool calls
CREATE TABLE IF NOT EXISTS deferred_actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  modal_event_id  uuid        REFERENCES modal_events(id) ON DELETE CASCADE,
  action_id       uuid        REFERENCES actions(id)      ON DELETE CASCADE,
  skill_id        text        NOT NULL,
  tool            text        NOT NULL,
  params          jsonb       NOT NULL DEFAULT '{}',
  venture_id      uuid        REFERENCES ventures(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected','deferred','replayed','failed')),
  retry_at        timestamptz NOT NULL DEFAULT now(),
  replayed_at     timestamptz,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

Status flow: `pending` → `approved` (Decision/Escalation approve) → `replayed | failed`
             `pending` → `rejected` (Decision reject / Escalation reject)
             `pending` → `deferred` (Promotion "decide later", retry_at = +7d)
             `deferred` → `approved` (on next surfacing and approval)

### 2. Gateway — deferred payload on every gate

`lib/autonomy/gateway.ts` — `writeDeferredAction` helper added. Called in all three gate paths:

| Path | Archetype written | deferred_actions written |
|---|---|---|
| Guardrail breach | `escalation` | yes — with breach payload |
| Anomaly detected | `escalation` | yes — with anomaly description |
| Advise / operate gate | `decision` | yes — with skill_id + tool |

`modal_events.payload` now populated with archetype-specific JSON at fire time:
- Decision: `{"skill_id":"...","tool":"..."}`
- Escalation: `{"skill_id":"...","tool":"...","breach_type":"...","detail":"..."}`

### 3. `lib/modals/types.ts` — ModalAction discriminated union

```typescript
// Per-archetype action types — no any, compile-time exhaustive.
type DecisionAction = { archetype: "decision"; action: "approved" | "refined" | "rejected" };
type PromotionAction = { archetype: "promotion"; action: "promoted" | "keep_current" | "decide_later" };
type EscalationAction = { archetype: "escalation"; action: "approve_once" | "adjust_rule" | "rejected" | "demoted" };
// ... 5 more archetypes
type ModalAction = DecisionAction | BriefAction | InsightAction | AlertAction
                 | CompletionAction | QuestionAction | PromotionAction | EscalationAction;
```

### 4. `lib/modals/apply-action.ts` — server action

Single entry point for all modal button taps. Flow:
1. Fetch `modal_events` row, validate not already dismissed.
2. Runtime archetype↔action mismatch check.
3. Derive `skillId` from the `actions` row FK.
4. Dispatch to per-archetype handler.
5. Write `dismissed_at`, `action_taken`, `time_to_action_ms` to `modal_events`.

### 5. 8 archetype handlers (`lib/modals/handlers/`)

| Handler | DB side effects |
|---|---|
| `decision` | eval_run (approved/rejected/deferred), deferred_actions.status update |
| `escalation` | eval_run, deferred_actions.status, escalations row resolved, autonomy_levels on demote |
| `promotion` | autonomy_levels insert (on `promoted`), deferred_actions.retry_at +7d (on `decide_later`) |
| `brief` | none — telemetry only |
| `insight` | none — telemetry only |
| `alert` | none — telemetry only |
| `completion` | none — telemetry only |
| `question` | none — telemetry only (option stored via action_taken) |

### 6. `ModalQueue.tsx` frontend wiring

`dismissWithAction` now accepts `ModalAction` (typed) instead of a raw string.
`applyModalAction` called optimistically — modal dismisses immediately, server action writes async.
All 8 archetype switch cases pass compile-safe `ModalAction` discriminants.

### 7. Deferred-replay cron — `app/api/cron/deferred-replay/route.ts`

Schedule: `*/5 * * * *`. Bearer auth via `CRON_SECRET`.

Two jobs per tick:
1. **Replay** `status='approved'` rows with `retry_at <= now()` — calls `replayApprovedTool()`.
2. **Re-surface** `status='deferred'` rows with `retry_at <= now()` — writes fresh Promotion modal_events, bumps `retry_at` +7d.

### 8. Real replay dispatcher — `lib/autonomy/replay.ts`

Replaces the prior stub. Full implementation:

- **Atomic status guard** — `UPDATE WHERE status='approved'` → `'executing'`. If 0 rows returned, another cron tick already claimed the row; function exits early (concurrency-safe without SELECT FOR UPDATE).
- **Kill switch** — re-checked at replay time. Approval before kill ≠ permission after kill. Fails with `'kill_switch_engaged'`.
- **`invoke_loop` handler** — calls `runStreamingLoop` from `lib/loops/runner.ts` with a no-op `emit` callback. Loop runs fully (saves Document to DB) without streaming to anyone. Config sourced from `lib/loops/config.ts`.
- **Gate tool stubs** — `send_email`, `publish_post`, etc. return controlled `ok:false` for Phase C.
- **Audit trail** — writes new `actions` row with `via_modal=true`, `deferred_action_id`, `modal_event_id`, and original `autonomy_level` (looked up from the original actions row FK).
- **Escalation** — only on unexpected handler throws, not controlled `ok:false` returns or `tool_not_found`.
- **`tool=''`** (Promotion archetype — no tool to replay) → silently marks `'executed'`.

Also extracted `SUPPORTED_LOOPS` to `lib/loops/config.ts` (shared between invoke route and tool registry), and added `task: parsed.data.task` to gateway params so replay can re-execute with the original user prompt.

### 9. Migration 0016 — applied to production

Extends `deferred_actions` status CHECK (`'executing'`, `'executed'` added) and adds `deferred_action_id` + `modal_event_id` FK columns to `actions` for the full modal-approval→replay→action audit trail.

### 10. Test backfill — 39 new tests

| File | Tests | Coverage |
|---|---|---|
| `tests/lib/autonomy/ratchet.test.ts` | 10 | eligibility thresholds, demotion guard, maybeFirePromotionModal idempotency |
| `tests/lib/db/portfolio-audit.test.ts` | 9 | auditDateKey, computePortfolioFindings, generatePortfolioAudit idempotency + highSeverityCount |
| `tests/api/webhooks/resend-inbound.test.ts` | 13 | auth paths, venture resolution, triage routing (ok/throw/fail), event row written |
| `tests/lib/autonomy/replay.test.ts` | 9 | happy path, Promotion no-op, tool_not_found, handler throws (escalation), kill switch, concurrent claim guard, missing params, unknown loopId, autonomy_level inheritance |

**242 total** (was 203).

---

## Live verification — B.4.6 replay dispatcher (2026-05-12)

Verified against production Supabase on the `phase-b-overnight` preview deploy.
All three paths tested via `/api/test/verify-replay` (temp route, deleted before merge).

| Case | deferred_actions.id | status | error | actions.id |
|---|---|---|---|---|
| `failure` (send_email stub) | `1e7e1c33-9f16-4f6c-80e2-c873168191c8` | `failed` | `send_email replay not yet implemented` | — |
| `tool_not_found` | `2fb10539-d697-4156-ac96-b3dbe256216b` | `failed` | `tool_not_found` | — |
| `happy` (invoke_loop) | `29587746-785c-49fc-89c6-83b45f03e12e` | `executed` | null | `221c8776-533f-4ab2-82bd-97fb451e269f` |

Happy path proof:
- `actions` row `221c8776`: `via_modal=true`, `deferred_action_id=29587746`, `tool=invoke_loop`
- `loop_runs` row `8a048097`: `loop_name=01-strategy`, `status=succeeded`, tokens_in=1030 tokens_out=124, duration_ms=4788
- `documents` row `723bab12`: title="B.4.6 Verify", type=decision, status=reviewing
- Idempotency: second call returned `"row not in approved state — skipped"` on all three cases ✓

**Verdict: PASS.** The replay dispatcher is fully wired end-to-end against real Supabase + Anthropic.

---

## Operator verification

Two verification scripts. Run after pulling `phase-b-overnight`.

### Script A — Decision modal flow

```sql
-- 1. Trigger any loop that routes through the gateway (e.g. Loop 1 on Kounta).
-- 2. Verify a modal_events row was written:
SELECT id, archetype, scope_id, action_taken, payload
FROM modal_events
ORDER BY fired_at DESC LIMIT 5;

-- 3. Verify a deferred_actions row was written:
SELECT id, skill_id, tool, status, retry_at
FROM deferred_actions
ORDER BY created_at DESC LIMIT 5;

-- 4. In the browser: the Decision modal should appear. Tap Approve.
-- 5. Verify the modal was actioned:
SELECT id, action_taken, dismissed_at, time_to_action_ms
FROM modal_events
ORDER BY fired_at DESC LIMIT 3;

-- 6. Verify deferred_actions updated to approved:
SELECT id, status, replayed_at
FROM deferred_actions
ORDER BY created_at DESC LIMIT 3;

-- 7. Verify eval_run written:
SELECT skill_id, outcome, evaluated_at
FROM eval_runs
ORDER BY evaluated_at DESC LIMIT 3;
```

Expected: `modal_events.action_taken = 'approved'`, `deferred_actions.status = 'approved'`, `eval_runs.outcome = 'approved'`.

After the next cron tick (≤5 min), verify the full replay chain:

```sql
-- 8. Verify deferred_actions completed execution:
SELECT id, status, replayed_at, error
FROM deferred_actions
ORDER BY created_at DESC LIMIT 3;
-- Expected: status = 'executed', replayed_at IS NOT NULL

-- 9. Verify a new actions row was written with via_modal=true:
SELECT skill_id, tool, autonomy_level, via_modal, deferred_action_id, modal_event_id
FROM actions
WHERE via_modal = true
ORDER BY created_at DESC LIMIT 3;
-- Expected: via_modal=true, deferred_action_id and modal_event_id both set
```

### Script B — Promotion modal flow

```sql
-- 1. Manually insert 20 approved eval_runs for a skill:
INSERT INTO eval_runs (skill_id, outcome)
SELECT 'support-triage', 'approved'
FROM generate_series(1, 20);

-- 2. Call maybeFirePromotionModal (server action) or wait for next eval_run write on that skill.
-- 3. Verify promotion modal appeared:
SELECT id, archetype, scope_id, payload
FROM modal_events
WHERE archetype = 'promotion'
ORDER BY fired_at DESC LIMIT 1;

-- 4. In the browser: tap "Promote to Operate".
-- 5. Verify autonomy_levels updated:
SELECT scope_id, level, set_at
FROM autonomy_levels
WHERE scope_id = 'support-triage'
ORDER BY set_at DESC LIMIT 1;

-- Expected: level = 'operate'.
```

---

## What's outstanding (not blocking Phase B, blocking Phase C)

| Item | Location | Notes |
|---|---|---|
| Gate tool replay | `lib/autonomy/replay.ts` `TOOL_HANDLERS` | `send_email`, `publish_post` etc. return controlled `ok:false`. Phase C wires real skill invocations. |
| Skill level command palette | Phase C | Operator manual level adjustment via ⌘K. |
| Content classifier | `lib/autonomy/gateway.ts` `detectContentClassifierFire` | Real brand-voice classifier call. Phase C. |

---

## Architecture — deferred-payload pattern

```
Operator taps modal button
        │
        ▼
applyModalAction(modalEventId, action)
        │
        ├── Decision handler → deferred_actions.status = 'approved'
        │                   → eval_run written
        │
        └── Deferred-replay cron (*/5 min)
                │
                ├── SELECT deferred_actions WHERE status='approved' AND retry_at <= now()
                └── replayDeferredAction(id) → [stub] → status='failed' | status='replayed'
```

The deferred_actions row is the handoff between operator approval and actual tool execution. Once Phase C wires real handlers into `lib/modals/replay.ts`, the loop closes end-to-end.

---

## Files changed

```
supabase/migrations/0015_modal_action_bridge.sql  (new)
supabase/migrations/0016_replay_dispatcher.sql    (new — applied to production)
lib/supabase/types.ts
lib/autonomy/gateway.ts
lib/autonomy/replay.ts                            (new)
lib/loops/config.ts                               (new — SUPPORTED_LOOPS extracted)
lib/modals/types.ts                               (new)
lib/modals/apply-action.ts                        (new)
lib/modals/handlers/decision.ts                   (new)
lib/modals/handlers/escalation.ts                 (new)
lib/modals/handlers/promotion.ts                  (new)
lib/modals/handlers/brief.ts                      (new)
lib/modals/handlers/insight.ts                    (new)
lib/modals/handlers/alert.ts                      (new)
lib/modals/handlers/completion.ts                 (new)
lib/modals/handlers/question.ts                   (new)
app/api/loops/[loopId]/invoke/route.ts            (task added to gateway params)
app/api/cron/deferred-replay/route.ts             (new; updated to use replayApprovedTool)
components/atrium/ModalQueue.tsx
vercel.json
tests/lib/autonomy/ratchet.test.ts               (new)
tests/lib/autonomy/replay.test.ts                (new)
tests/lib/db/portfolio-audit.test.ts             (new)
tests/api/webhooks/resend-inbound.test.ts        (new)
ROADMAP.md
HANDOFF-B4.5.md                                  (this file)
```
