# SoloDesk — Roadmap

Three phases. Phase A built the substrate. Phase B adds the autonomy + modal foundation on top. Phase C productises once Phase B is mature and the productise criteria in README.md are met.

Each sprint is governed by agent-harness: SPRINT.md scope before build, HANDOFF.md at end, evaluator session before merge.

**Authoritative specs that govern every sprint:**
- `/.claude/design-system.md` — chrome visual language, type, palette, layout grammar, motion, voice.
- `/.claude/decision-document-interface.md` — Document/Section/Comment primitives, agent output contract, per-loop instantiation patterns.
- `AUTONOMY-MODEL.md` — Phase B: autonomy levels, scopes, gateway, guardrails, trust ratchet, kill switch.
- `MODAL-ARCHETYPES.md` — Phase B: the eight modal archetypes, shared properties, frequency budgets, surfacing rules.

Read all four before opening any sprint. They supersede shadcn defaults and convention.

---

## Phase A — Substrate (COMPLETE in code)

Eleven sprints. Builds the foundation that everything else stands on. Live deploy verification of Loop 8 webhooks and the threshold cron is operator-driven and outstanding.

| Sprint | Surface | Status |
|--------|---------|--------|
| 0 | Foundation — Next.js + Supabase + auth + events + dashboard shell + Kounta seeded | shipped |
| 0.5 | Memory layer — pgvector, Voyage AI, `recallContext`, `buildAgentPrompt`, COMPANY.md chunking | shipped |
| 1.0 | Design migration — Söhne + Phosphor regular + SoloDesk palette + every shadcn primitive restyled | shipped |
| 1.1 | Document substrate — `documents`, `sections`, `comments` tables, kind-dispatch, status state machine, evidence pointers | shipped |
| 1.2 | Decision document type + retrospective — `/decisions` UI, outcome tracking, Sunday retrospective digest | shipped |
| 1.3 | Connections layer — `connections`, `connection_audit`, Supabase Vault, `getConnection` as sole credential read path | shipped |
| 2 | Metrics digest + Loop scheduler (Loop 8) — scheduler substrate, four webhook integrations, daily digest Document, anomaly explainer | shipped |
| 3 | Strategy / office-hours (Loop 1) — six-question reframe, adversarial critic, Decision Document output | shipped |
| 4 | Content drafting + critic (Loop 4) — content-writer + content-critic, channel-aware, anti-pattern enforcement | shipped |
| 5 | Competitive intel scout (Loop 9) — intel-scout + intel-critic, weekly cron, Intel Digest Document with signals table | shipped |
| 6 | Support triage hybrid (Loop 6) — classifier + replier, Support Ticket Document, Triage Queue Document | shipped |
| 7 | Visual venture identity system | shipped |
| 8 | The Bridge (portfolio canvas) | shipped |
| 9 | The Watch + The Day (ambient surfaces) | shipped |
| 10 | Streaming Sections + Loop 1 conversation | shipped (live invocation operator-verified) |
| 11 | Command bar + Loop 8 reactive (CMD+K + Stripe webhook + threshold cron + manual trigger) | shipped (live webhook operator-verified) |

Phase A HANDOFFs archived under `.archive/handoffs/`. Experience-layer phase HANDOFF at `.archive/handoffs/experience-layer-phase-handoff.md`.

---

## Phase B — Autonomy + modal foundation (IN PROGRESS)

Seven sprints. Each can be stopped at and the prior work still ships value, but the full set is required for the productise call. Phase B is the work that converts SoloDesk from "substrate that captures everything" to "OS for portfolio operators with calm-first autonomy."

### Sprint B.1 — Autonomy control plane

**Sprint type:** substrate. No UI. Pure plumbing.
**Why first:** every subsequent sprint depends on the gateway being the only enforcement point. Building UI before the gateway means retrofitting later.

DOD highlights:
- Migration applies `autonomy_levels`, `guardrails`, `escalations`, `actions` tables per AUTONOMY-MODEL.md §5.
- `/lib/autonomy/gateway.ts` is the single tool-call enforcement point. Every existing Loop invocation retrofitted to route through it.
- `resolveAutonomyLevel(skill)` walks scope precedence: Operator default → Venture override → Loop override → Skill override. Most specific wins.
- `resolveGuardrails(skill)` returns the merged guardrail set for a scope.
- Kill switch contract — DB-backed bit on operator record. While killed, every action surfaces as a Decision modal. State survives process restarts. Restore is a separate explicit action.
- Hard-advise-only flag enforced — flagged scopes cannot be promoted regardless of trust ratchet.
- `actions` audit row written for every tool call regardless of level.
- Adversarial evaluator session verifies the gateway cannot be bypassed from skill code (grep test + behavioural test).
- HANDOFF documents which guardrail types are wired vs stubbed.

### Sprint B.2 — Atrium modal foundation

**Sprint type:** UI primitive + library.
**Why second:** the autonomy control plane fires Escalation and Promotion modals from day one. Without the modal substrate, those events have nowhere to surface.

DOD highlights:
- Glass modal container primitive built per MODAL-ARCHETYPES.md §2. Modal scope only — chrome rules in `/.claude/design-system.md` unaffected.
- Six core archetypes implemented as React components: Decision, Brief, Insight, Alert, Completion, Question. All action variants wired.
- Two autonomy-related archetypes implemented: Promotion, Escalation (no live trust-ratchet data yet — synthetic triggers only).
- Modal queue handles ordering, priority jumps (Escalation, Alert), persistence across sessions.
- Keyboard navigation works for all bindings: Esc, Enter, 1/2/3, Tab, →/←, ⌘E, ⌘⇧.
- `modal_events` telemetry table populated on every surfacing.
- Frequency budget alarms wired — instrument hard ceilings, alert when breached.
- Dismissal contracts honoured per archetype (Decision and Escalation non-dismissable; Esc on Escalation opens kill switch confirmation).
- Visual badge primitive (Advise = warm coral, Operate = lavender, Steward = sage) renders on every venture / loop / skill surface.
- Briefing modal displays autonomy distribution stats.
- Visual library v1 — 10-15 commissioned illustrations integrated (Brief, Question, Promotion archetypes). External dependency; brief illustrator before this sprint opens.
- Chart kit v1 — 6-7 chart types in Atrium aesthetic (Insight, Alert archetypes).
- HANDOFF documents which archetypes are fully wired vs stubbed.

### Sprint B.3 — First agent registered through the gateway

**Sprint type:** end-to-end proof on one venture.
**Why third:** prove the full path (skill registry → autonomy level → gateway → modal surface) works for one skill before scaling.

DOD highlights:
- One existing skill registered through the autonomy gateway with `level = 'advise'` and a real guardrail set. Recommended: the simplest skill on Kounta (e.g. support reply draft).
- Every tool call from that skill routes through the gateway.
- Decision modal surfaces for every action; operator approves / refines / rejects; trust ratchet *not yet active* (no eval data).
- `actions` rows accumulating; `eval_runs` populated as the substrate for Sprint B.4.
- HANDOFF documents end-to-end flow with screenshots / traces.

### Sprint B.4 — Trust ratchet + anomaly detection

**Sprint type:** behavioural logic.
**Why fourth:** Sprint B.3 generates the `eval_runs` data this sprint reads from. Building the ratchet earlier means testing against synthetic data only.

DOD highlights:
- Trust ratchet eligibility engine reads from `eval_runs`. Defaults: 20 successful Decision-modal approvals for Advise → Operate, 50 successful gate approvals for Operate → Steward.
- Promotion modal fires at next briefing when threshold met.
- Demotion on rejection threshold (>2 rejections in last 20 for Operate, >3 in last 50 for Steward).
- Operator manual demotion via command palette (one tap, instant).
- Anomaly detection rule-based v1 covers five reference cases: recipient outside historical pattern, volume spike, content classifier fire, time-of-day deviation, cross-skill correlation.
- Anomaly downgrade is single-skill, 24h, restorable.
- Escalation modal fires on every anomaly and guardrail breach with full context (action params, anomaly detail, audit trail snippet, options).

### Sprint B.5 — Loop 11 portfolio audit

**Sprint type:** cross-venture meta-loop.
**Why fifth:** required for the productise criteria. The "OS for portfolio operators" claim doesn't hold without it. Substrate (loop scheduler, recallContext, gateway) all in place.

DOD highlights:
- `portfolio-audit` skill runs against the full set of authed ventures via the existing loop scheduler — not a parallel cron.
- Output is a portfolio-scope Document with typed Sections, one per finding.
- Initial finding kinds: stale priorities (Document not updated in N days), unused capabilities (Loop never invoked on venture X in M days), missing connections (Loop enabled on a venture but no connection present), divergence (Loop 8 scoring distribution drifting across venture instances).
- Insight modal surfaces high-severity findings; routine findings roll into the Brief.
- Member scoping enforced — non-admin members see only findings for ventures they're assigned to.

### Sprint B.6 — Team inbound webhook layer

**Sprint type:** team enablement.
**Why sixth:** required for the productise criteria. Substrate (`venture_members` + role-gated visibility) shipped in Phase A; this sprint adds the actual inbound mail forwarder + Resend webhook + Support Ticket auto-creation per inbound email.

DOD highlights:
- Per-venture inbound email address (subdomain or tag-based routing).
- Resend webhook lands inbound mail in `events` with `venture_id` resolved from recipient.
- Auto-creates a Support Ticket Document (`type=support_ticket`) per the existing Sprint 6 substrate.
- Member visibility: teammates assigned to the venture see the Triage Queue Document and can work tickets; operator sees all ventures.
- Each new ticket fires a Completion or Decision modal depending on Loop 6 classification.
- One teammate working a venture's inbox end-to-end before sprint closes.

### Sprint B.7 — Operator dogfood + guardrail refinement

**Sprint type:** field validation across the live portfolio.
**Why last in Phase B:** every prior sprint hardens substrate; this one stresses it. Real operator usage across Mackays + Kounta + SoloDesk + the other ventures generates the data that tells us which guardrails need to exist that we didn't anticipate.

DOD highlights:
- All authed ventures have Phase B fully enabled: gateway routing, levels set per scope, guardrails configured, modal surfacing live.
- At least one Promotion modal has fired on real `eval_runs` data and the operator has accepted or deferred.
- At least one Escalation modal has fired on a real anomaly and the operator has triaged it.
- Guardrail catalogue expanded based on what the operator actually hits — additions documented and committed to `/.claude/guardrails/`.
- Modal frequency budgets reviewed against real data. Hard ceilings adjusted if necessary, surfacing logic fixed if breaches were the system's fault.
- Performance pass: modal latency, gateway overhead, query budgets — all within targets.
- Productise criteria checklist (README.md) reviewed honestly. Go / no-go discussion opens Phase C.

---

## Phase C — Productisation (CONDITIONAL on Phase B completion + productise criteria met)

Three workstreams, run concurrently once the productise call is made. No fixed sequence — pick the longest pole first.

### Multi-operator infrastructure

- Workspace isolation. RLS enabled on every table — the connections layer and autonomy tables go first because they're highest-stakes.
- Multi-operator auth — Tim's allowlist becomes one of many.
- Member invitation flow — admin invites teammates, role-scoped access.
- Per-workspace billing isolation.

### Billing + onboarding

- Stripe billing (decide early: route via Kounta or direct). Stripe events trigger Loop 8 on both products if routed via Kounta.
- Public signup flow with email verification.
- Onboarding wizard — operator declares ventures, connects first integration, sees first modal.
- Marketing site at `solodesk.ai` — pick one of the three produced UI directions (Constellation / Atelier / Console) and commit.

### Team-inbound at scale

- Sprint B.6 shipped one teammate working one venture's inbox. Phase C extends to N teammates per venture, role-gated visibility refined, audit trail per teammate.

---

## Phase 3 candidates (post Phase B, not gating productisation)

Considered after the productise call is made and Phase C is underway.

- **Loop 11 portfolio audit follow-ups.** Substrate shipped in B.5 (and earlier — commit `653b271` shipped initial Phase A substrate). Follow-up work is richer finding kinds and full divergence detection (Loop 8 scoring distribution drift across venture instances).
- **Sprint 1.2 phase 2** — per-Section approval refinements now that modal-archetype approval has redefined the ceremony.
- **Real Stripe webhook signature validation** — currently webhook handlers accept on shared secret; per-provider HMAC via `getConnection()` lands here.
- **MCP server exposure** (Level 6 memory) — expose `recallContext`, `actions`, `decisions` to other AI tools via MCP. Cross-tool portfolio recall.
- **Voice command bar.**
- **Cross-venture portfolio recall sentinel** for `buildAgentPrompt` — the `'portfolio'` ventureId path.
- **ML-based anomaly detection** — promote anomaly v1 (rule-based) to learned model once enough escalation data exists.

---

## Decision: productise / don't gate

The criteria are in README.md. The decision is made when the checklist is honest — not on a date. Sprint B.7 closes with the call.
