# HANDOFF — Phase B: Autonomy + Modal Foundation (overnight build)

**Branch:** `phase-b-overnight`
**Status:** Complete — tsc clean, 0 ESLint errors, 203 tests passing, build green
**Commits:** Sprint B.1 through B.6 committed (6 sprint commits)

---

## Operator dogfood checklist (do this first)

These are the manual steps Tim needs to take before Phase B is considered live.
Do them in order. Each one has a verification signal.

### 1. Apply migration 0013 (autonomy control plane)

Already done: `0013_autonomy_control_plane.sql` was applied in the B.1 session.
Verify: `supabase migration list` — should show 0013 as applied.

### 2. Apply migration 0014 (venture support_email)

```sql
-- In Supabase dashboard SQL Editor or via supabase CLI:
alter table ventures add column if not exists support_email text unique;
```

Verify: `select id, slug, support_email from ventures limit 5;`

### 3. Seed the kill switch row

The gateway requires one `operator_kill_switch` row per operator.

```sql
-- Replace with your actual user UUID from auth.users:
select ensure_kill_switch_row('<your-user-uuid>');
```

Verify: `select * from operator_kill_switch;` — one row with `killed = false`.

### 4. Test the kill switch keyboard shortcut (browser)

1. Log in to `app.solodesk.ai`
2. Press Cmd+Shift+. (period)
3. Expected: Atrium escalation modal appears (or browser console shows the server action fired)
4. Confirm: `select killed, killed_at from operator_kill_switch;` — should be `true`
5. Restore: `update operator_kill_switch set killed = false, killed_at = null, killed_reason = null;`

### 5. Set RESEND_INBOUND_SECRET env var

Generate a strong random string and add it to Vercel env vars (all environments):
```
RESEND_INBOUND_SECRET=<random-64-char-string>
```

### 6. Set a venture's support_email and test inbound triage (curl)

```sql
update ventures set support_email = 'support@kounta.inbound.solodesk.ai' where slug = 'kounta';
```

```bash
curl -X POST https://app.solodesk.ai/api/webhooks/resend-inbound \
  -H "Authorization: Bearer $RESEND_INBOUND_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "data": {
      "from": "customer@example.com",
      "to": ["support@kounta.inbound.solodesk.ai"],
      "subject": "Cannot log in",
      "text": "I have been trying to log in for 30 minutes and getting an error."
    }
  }'
```

Expected: `{"status":"ok","classification":"bug","urgency":"high","documentId":"..."}`

Check: the new Document should appear in `/ventures/kounta/support`.

### 7. Verify gateway audit trail fires on a loop run

1. Trigger any loop from the UI (e.g. Loop 1 office hours on any venture)
2. Check: `select skill_id, tool, autonomy_level, modal_surfaced, created_at from actions order by created_at desc limit 3;`
3. Expected: row with `autonomy_level = 'operate'`, `modal_surfaced = false`

### 8. Verify the trust ratchet tables exist

```sql
select count(*) from eval_runs;
select count(*) from modal_events;
select count(*) from autonomy_levels;
```

All three should exist with 0+ rows. Any error means migration 0013 wasn't applied cleanly.

### 9. Deploy branch to Vercel

```bash
git push origin phase-b-overnight
```

Then verify: the Vercel build passes and `app.solodesk.ai` is reachable.

---

## What was built — Sprint-by-Sprint

### B.1: Autonomy Control Plane

**Migration 0013** — 7 new tables:
`autonomy_levels`, `guardrails`, `actions`, `escalations`, `eval_runs`, `modal_events`, `operator_kill_switch`

**`lib/autonomy/`**
- `types.ts` — All shared autonomy types
- `gateway.ts` — `executeToolCall()`: single enforcement entry for all tool calls.
  Scope precedence: skill(0) > loop(1) > venture(2) > operator(3).
  Fail-closed on audit row insert error.
  GATE_TOOLS: send_email, publish_post, pay_invoice, sign_contract, execute_trade, modify_production_data, allocate_budget
- `skills-registry.ts` — Runtime registry of 10 skills at `operate` level
- `kill-switch.ts` — `killAllAutonomy()`, `restoreAutonomy()`, `getKillSwitchState()`
- `index.ts` — Barrel export

**Retrofits:**
- `app/api/loops/[loopId]/invoke/route.ts` — gateway check before SSE stream
- `lib/loops/loop-8/reactive.ts` — gateway check before `runStreamingLoop`

**Tests:** 30 unit tests in `tests/lib/autonomy/gateway.test.ts` (203 total)

---

### B.2: Atrium Modal Foundation

**`lib/atrium/`**
- `types.ts` — `AtriumModalEvent`, `FrequencyBudget`, `FREQUENCY_BUDGETS`, `getModalPriority`
- `telemetry.ts` — `recordModalDismiss`, `loadPendingModalQueue`, `checkFrequencyBudget`
- `kill-switch.ts` — Thin `triggerKillSwitch` server action (avoids server-only import chain into client bundle)

**`components/atrium/`**
- `ModalContainer.tsx` — Glass card: 14px backdrop-blur, 70% white overlay, 20px radius, warm shadow
- `ModalHeroPlaceholder.tsx` — Placeholder hero + SVG chart silhouette
- `ModalQueue.tsx` — Provider: loads from DB on mount, high-priority jumps front, Esc/←/→/⌘⇧.
- `AtriumProviderWrapper.tsx` — `"use client"` layout wrapper
- `archetypes/` — 8 archetype components (Decision, Brief, Insight, Alert, Completion, Question, Promotion, Escalation)

**Layout:** `app/(authed)/layout.tsx` wrapped with `<AtriumProviderWrapper>`

**Blocked:** Söhne font, illustration assets — see BLOCKERS.md.

---

### B.3: Support-Triage Gateway Integration

`lib/agents/loops/support-triage.ts` — gateway check at entry + `writeEvalRun` at exit.
`lib/autonomy/index.ts` — `writeEvalRun` exported.

---

### B.4: Trust Ratchet + Async Anomaly Detection

**`lib/autonomy/ratchet.ts`**
- `checkRatchetEligibility()` — 2 thresholds: Advise→Operate (20/2), Operate→Steward (50/3)
- `maybeFirePromotionModal()` — 7-day idempotency guard
- `checkDemotionThreshold()` — demotes skill + fires alert modal on rejection excess

**Anomaly detection** (gateway.ts) — 5 async DB-backed rules wired (detectRecipientAnomaly, detectVolumeSpike, detectContentClassifierFire stub, detectTimeOfDayDeviation, detectCrossSkillCorrelation)

**`writeEvalRun`** — triggers ratchet checks via dynamic import.

---

### B.5: Loop 11 Portfolio Audit Gateway

- `portfolio-auditor` skill registered (level: operate, budgetCents: 0)
- `fireInsightModal()` exported from gateway
- `ventureId` made optional in `ToolCallInput` (global-scope loop support)
- `loop-11-portfolio-audit` schedule retrofitted: gate check + eval_run + insight modal on high-severity findings
- `GeneratePortfolioAuditResult` extended with `highSeverityCount`

---

### B.6: Resend Inbound Email → Support Triage

**Migration 0014** — `support_email text unique` on ventures

**`app/api/webhooks/resend-inbound/route.ts`**
- Auth: Bearer `${RESEND_INBOUND_SECRET}`
- Resolves venture from recipient address via `ventures.support_email`
- Logs raw email as `events` row; calls `runSupportTriage`
- Returns 200 to Resend even on triage failure (no retry triggered)

**Blocked:** DNS MX record, Resend dashboard config — see BLOCKERS.md.

---

## Decisions made unattended

See `DECISIONS-UNATTENDED.md` for full entries. Key choices:

| ID | Decision |
|---|---|
| B.1-D1 | Existing skills at `operate` to preserve system function before modal UI |
| B.1-D2 | Gateway at invoke-API layer, not inside `runStreamingLoop` |
| B.1-D3 | Kill switch checks any `killed=true` row (v0 single-operator) |
| B.2-D1 | Recharts (already in package.json) for modal charts |
| B.3-D1 | support-triage is the first skill through the gateway |
| B.4-D1 | Trust ratchet thresholds hardcoded at defaults for B.4 |
| B.5-D1 | Portfolio audit via existing loop scheduler, not a new cron |
| B.6-D1 | `support_email` column for venture resolution |

---

## Blockers requiring Tim action

| Sprint | Blocker | Tim action |
|---|---|---|
| B.2 | Söhne font licence | Purchase from Klim Type Foundry; install woff2 to `/public/fonts/` |
| B.2 | Atrium hero illustrations | Brief illustrator using MODAL-ARCHETYPES.md spec |
| B.6 | DNS inbound email MX | Add MX record for inbound domain; configure Resend webhook URL |
| B.6 | RESEND_INBOUND_SECRET | Set in Vercel env vars; obtain from Resend dashboard |

---

## What's next (Phase C)

1. **Modal → action bridge** — Approve/Reject/Promote write back to DB
2. **Skill level UI** — Command palette to adjust autonomy level per skill
3. **Content classifier** — Real anomaly detection for topic_blocklist (currently stub)
4. **Söhne + illustration assets** — once licensed/commissioned
