# AUTONOMY-MODEL.md

**Status:** v1.0
**Owner:** Tim Wilcox
**Supersedes:** No prior autonomy spec
**Related:** `CLAUDE.md`, `SPRINT.md`, `DESIGN-LANGUAGE.md`, `MODAL-ARCHETYPES.md`, `0003_mcp_registry.sql` (planned), `0006_autonomy.sql` (planned)

---

## 1. Purpose

SoloDesk is an OS for portfolio operators. A single operator runs many ventures, each with many loops, each with many skills. Some work demands operator judgment on every step; some doesn't. Without a model for *how much autonomy each unit of work has*, the system collapses into one of two failure modes:

- **All-manual** — every action surfaces for approval; the operator becomes the bottleneck and the system is no faster than doing it by hand.
- **All-autonomous** — the system acts freely; mistakes compound, brand voice drifts, money leaks, trust dies.

The autonomy model is the contract that lets the system run as much as it can without exceeding the operator's trust at any given moment, and lets that trust be earned over time.

---

## 2. The three levels

### Advise

System proposes, operator decides every meaningful step. Modal-heavy. Decisions surface in real time via the Decision modal archetype.

- **Modal behavior:** every action that would change external state surfaces a Decision modal. Approve / Refine / Reject.
- **Use when:** new skills, untrusted ventures, high-stakes work, brand-defining moments, sensitive comms.
- **Throughput:** low.
- **Default for:** all newly-registered skills, all newly-onboarded ventures, all skills tagged `sensitive` or `brand-defining`.

### Operate

System drafts and executes reversible work silently, pauses at gates for approval. Modals fire only at externally-visible or fiscally-consequential gates. Internal drafts, research, and analysis happen ambiently and roll up into the daily/weekly Brief modal.

- **Modal behavior:** Decision modal at gates only. Brief modal summarises everything else.
- **Gates:** sending email, publishing post, paying invoice, signing contract, executing trade, modifying production data, allocating budget over $X (configurable per scope).
- **Use when:** operator trusts the skill's quality but wants oversight on external/irreversible actions.
- **Throughput:** medium-high.
- **Promoted from Advise after:** 20 successful Decision-modal approvals (configurable).

### Steward

System owns the outcome within guardrails. Surfaces only exceptions, anomalies, and routine summaries. The chief of staff is running the function on the operator's behalf.

- **Modal behavior:** Escalation modal on anomaly only. Brief modal for routine rollup.
- **Use when:** mature, high-volume, well-evaluated skills; low-consequence per action; full audit trail and reversibility built in.
- **Throughput:** high.
- **Promoted from Operate after:** 50 successful gate approvals at Operate (configurable).

---

## 3. The four scopes (override precedence)

Autonomy is set at four scopes. Each overrides the one above. Most specific wins.

```
Operator default   →   Venture override   →   Loop override   →   Skill override
       ↓                       ↓                      ↓                   ↓
   (broadest)                                                       (most specific)
```

**Operator default** — baseline across the entire portfolio. Most operators will set this to Operate. New operators default to Advise.

**Venture override** — per-venture. Mackays may sit at Advise, blart.ai may sit at Steward, Kounta may sit at Operate. Reflects the operator's risk profile per venture.

**Loop override** — per loop within a venture. Within Mackays, the metrics loop may run Steward (low stakes, high volume) while the sales loop runs Advise (relationship-defining).

**Skill override** — per skill within a loop. Within Mackays content loop, drafting may run Steward, publishing may run Operate. This is the most-used scope in practice.

**Hard-coded overrides** — certain skills are flagged `advise-only` and cannot be promoted regardless of trust ratchet. See section 9.

---

## 4. Trust ratchet

Skills earn autonomy. Operators don't grant it speculatively.

### Eligibility thresholds (defaults, configurable per scope)

| Promotion | Required successful runs | Failure tolerance |
|---|---|---|
| Advise → Operate | 20 successful Decision-modal approvals | <2 rejections in last 20 |
| Operate → Steward | 50 successful gate approvals | <3 rejections in last 50 |

### Promotion flow

1. Skill accumulates run history in `eval_runs` table (Sprint 1.5).
2. On reaching threshold, system fires a Promotion modal at next briefing.
3. Operator approves once. Skill autonomy level updated in `autonomy_levels`.
4. New level takes effect on next run.

### Demotion flow

Three triggers for demotion:

- **Operator manual demotion** — one tap in command palette. Instant.
- **Anomaly downgrade** — automatic, single-skill, surfaces Escalation modal. See section 7.
- **Failure threshold breach** — if rejections in recent window exceed tolerance, auto-demote one level and notify.

Demotion is always one level at a time. Operator can manually drop further.

---

## 5. Guardrails

Every Operate and Steward skill runs inside hard limits expressed declaratively in the registry. Guardrails are enforced at the gateway layer (Sprint 1.5), not in skill code. A skill cannot disable its own guardrails.

### Guardrail types

- **Budget cap** — `max_spend_per_period` (e.g. $500/week). Violation triggers Escalation modal.
- **Communication cap** — `max_messages_per_recipient_per_period` (e.g. 1 email per contact per 24h).
- **Recipient allowlist** — `allowed_recipients` array. Autonomous email only goes to known contacts.
- **Brand voice constraint** — every published artefact passes a brand-voice classifier; failures escalate.
- **Topic blocklist** — `forbidden_topics` array. Any artefact mentioning a blocked topic escalates.
- **Time window** — `allowed_hours` (e.g. no autonomous publishing 22:00–06:00 local).
- **Volume cap** — `max_actions_per_period` (e.g. no more than 10 autonomous publishes per day).
- **Anomaly trigger** — see section 7.

### Schema sketch

```sql
-- 0006_autonomy.sql
CREATE TABLE autonomy_levels (
  id uuid PRIMARY KEY,
  scope_type text CHECK (scope_type IN ('operator', 'venture', 'loop', 'skill')),
  scope_id uuid NOT NULL,
  level text CHECK (level IN ('advise', 'operate', 'steward')),
  set_at timestamptz NOT NULL DEFAULT now(),
  set_by uuid REFERENCES auth.users(id),
  hard_advise_only boolean DEFAULT false
);

CREATE TABLE guardrails (
  id uuid PRIMARY KEY,
  scope_type text NOT NULL,
  scope_id uuid NOT NULL,
  guardrail_type text NOT NULL,
  config jsonb NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE escalations (
  id uuid PRIMARY KEY,
  action_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  reason text NOT NULL,
  trigger_type text NOT NULL, -- 'guardrail_breach', 'anomaly', 'classifier_fail'
  escalated_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolution text -- 'approved', 'rejected', 'demoted'
);
```

---

## 6. Gateway enforcement (Sprint 1.5)

Every tool call routed through the MCP gateway is checked against the autonomy level for the calling skill *before* execution.

### Pseudocode

```typescript
async function executeToolCall(skill: Skill, tool: Tool, params: ToolParams) {
  const level = resolveAutonomyLevel(skill); // walks scope precedence
  const guardrails = resolveGuardrails(skill);

  // 1. Hard guardrail check (always, every level)
  const breach = checkGuardrails(tool, params, guardrails);
  if (breach) {
    return escalate(skill, tool, params, breach);
  }

  // 2. Anomaly check (always, every level)
  if (detectAnomaly(skill, tool, params)) {
    return escalateAndDowngrade(skill, tool, params);
  }

  // 3. Level-based routing
  switch (level) {
    case 'advise':
      return surfaceDecisionModal(skill, tool, params);

    case 'operate':
      if (isGate(tool)) {
        return surfaceDecisionModal(skill, tool, params);
      }
      return executeAndLog(tool, params);

    case 'steward':
      return executeAndLog(tool, params);
  }
}
```

The gateway is the *only* place autonomy is enforced. Skill code never checks its own level. This keeps enforcement uniform, auditable, and impossible to bypass from inside a skill.

---

## 7. Anomaly handling

The system never barrels through weirdness just because the level allows it. Strange context downgrades the *single skill* to Advise for that surface only; the rest of the system stays at the operator's chosen level.

### What counts as an anomaly

- Recipient outside historical pattern (e.g. emailing someone the skill has never emailed before, when the skill normally emails a known list)
- Volume spike (e.g. skill that normally posts 1/day suddenly wants to post 10)
- Content classifier fires (brand voice drift, off-topic, sensitive language)
- External system reports unusual response (rate limit, auth challenge, error rate spike)
- Time-of-day deviation (skill normally runs business hours suddenly running at 3am)
- Cross-skill correlation (multiple skills hitting the same external system simultaneously, suggesting cascade)

### Behavior on anomaly

1. Action is paused, not executed.
2. `escalations` row created.
3. Escalation modal surfaces immediately (does not wait for next briefing).
4. The skill is downgraded one level for 24 hours, automatically. Operator can extend or restore.
5. Briefing modal next morning includes the escalation in autonomy stats.

---

## 8. Kill switch

One keystroke (`⌘ ⇧ .` proposed) pauses all autonomy across the portfolio. Drops every venture/loop/skill to Advise instantly.

- Kill switch state is stored on the operator record, not per-scope. One bit, global.
- While killed: no autonomous execution. All actions surface as Decision modals.
- Briefing modal at top of Bridge explains the killed state and what's queued.
- Restore is a separate explicit action (no toggling).
- Kill switch state is logged with timestamp and reason (operator can attach a note).

This is the trust contract. The operator must know they can stop the system at any moment with no friction.

---

## 9. Hard exclusions (advise-only categories)

Certain work is *never* eligible for autonomy regardless of trust ratchet. Encoded as `hard_advise_only = true` on the relevant scope.

### Default exclusions

- **Sensitive personal/family matters** — Aberdair Aviation comms, family-financial situations, anything involving non-portfolio family members.
- **HR-sensitive work** — compensation modeling, terminations, performance management, anything involving an individual employee's record.
- **Board-level comms** — Mackays board pack content, NED communications, statutory filings.
- **Legal-sensitive** — contracts being negotiated, disputes, regulatory submissions.
- **First-of-kind actions** — any action a skill has never executed before, even if the skill is at Steward, runs at Advise once.

### Operator-extensible

Operators can flag any scope as `advise-only` via the command palette. The flag is sticky and survives promotion eligibility checks.

---

## 10. UX manifestation

Cross-references `MODAL-ARCHETYPES.md`.

- **Visual badge** — small dot or chip on every skill/loop/venture surface, color-keyed by level (Advise = warm coral, Operate = lavender, Steward = sage).
- **Briefing modal** rolls up the autonomy distribution for the period: "47 actions taken autonomously, 8 needed your approval, 1 escalated, 0 anomalies."
- **Settings live in the command palette** — three keystrokes to change a scope's level. No dedicated settings page.
- **Promotion modal** (archetype 7) — celebrates trust earned, asks for opt-in.
- **Escalation modal** (archetype 8) — surfaces anomalies and guardrail breaches with full context.
- **Kill switch** — keystroke binding always active, even from inside any modal.

---

## 11. Audit trail

Every action at every level is logged. The operator can query the audit trail at any time via the command palette.

- Every tool call writes a row to `actions` (planned table) with skill_id, tool, params, autonomy_level, modal_surfaced (bool), result, timestamp.
- Audit queryable via natural language ("show me everything Mackays content loop did in the last reporting period") or filters.
- Audit is also the substrate for the trust ratchet — promotion eligibility reads from `actions` history.
- Memory layer (Sprint 0.5, pgvector) embeds action descriptions for semantic queries on the audit trail.

---

## 12. Rollout sequence

| Sprint | Scope |
|---|---|
| 1.5 (control plane) | `autonomy_levels`, `guardrails`, `escalations` tables. Gateway enforcement layer. Kill-switch contract. |
| 2 (Atrium foundation) | Visual badge primitive. Briefing modal autonomy stats section. Kill-switch keystroke binding. |
| 3 (first agent) | First skill registered with autonomy level. Default Advise. Trust ratchet *not yet active* (pre-eval data). |
| 4 (skills mature) | Trust ratchet logic. Promotion modal. Anomaly detection downgrade behavior. |
| 5+ | Refinement of guardrail types based on real operator usage. |

---

## 13. Acceptance criteria

For Sprint 1.5 to be considered done on the autonomy dimension:

- [ ] Three tables migrated and tested (`autonomy_levels`, `guardrails`, `escalations`)
- [ ] Gateway enforces autonomy on every tool call (verified by adversarial evaluator)
- [ ] Kill switch contract stub exists; keystroke binding deferred to Sprint 2
- [ ] Hard-advise-only flag works and cannot be bypassed
- [ ] Audit trail row written for every tool call regardless of level
- [ ] HANDOFF.md documents what's live, what's stubbed, what's deferred

For Sprint 2 to be considered done:

- [ ] Visual badge component renders correctly across three levels
- [ ] Briefing modal displays autonomy distribution
- [ ] Kill switch keystroke works globally and persists state
- [ ] Settings flow in command palette can set level at all four scopes
- [ ] Hard-advise-only override surfaceable in settings

For Sprint 4 to be considered done on the autonomy dimension:

- [ ] Trust ratchet evaluates promotion eligibility correctly against `eval_runs`
- [ ] Promotion modal fires when threshold met
- [ ] Demotion on rejection threshold works
- [ ] Anomaly detection identifies five reference cases (manually constructed)
- [ ] Anomaly downgrade is single-skill, time-bounded, restorable

---

## 14. Open questions (for evaluator pass)

- Should guardrail type catalogue be extensible by operators, or fixed in core? (Lean: fixed in v1, operator-extensible in v2.)
- Should the trust ratchet thresholds be adjustable per-skill or only globally? (Lean: global default + per-skill override available but discouraged.)
- Should anomaly detection use a separate eval model or be rule-based at first? (Lean: rule-based v1, learned v2.)
- Does kill switch survive process restarts? Yes — state in DB, not memory. Confirm in implementation.
- Should the briefing surface "trust score" per skill (e.g. 23 of 50 toward Steward)? (Lean: yes, in Sprint 4. Motivating moment for the operator.)

---

## Definition of done for this document

- [x] Three levels defined with modal behavior, use cases, defaults
- [x] Four scopes defined with override precedence
- [x] Trust ratchet defined with thresholds and flow
- [x] Guardrail catalogue defined with schema sketch
- [x] Gateway enforcement contract defined with pseudocode
- [x] Anomaly handling defined with downgrade behavior
- [x] Kill switch contract defined
- [x] Hard exclusions defined with default list
- [x] UX manifestation cross-referenced
- [x] Audit trail integration defined
- [x] Rollout sequence per sprint
- [x] Acceptance criteria per sprint
- [x] Open questions for evaluator
