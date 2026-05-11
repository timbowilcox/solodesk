# MODAL-ARCHETYPES.md

**Status:** v1.0
**Owner:** Tim Wilcox
**Supersedes:** No prior modal spec
**Related:** `DESIGN-LANGUAGE.md` (Atrium), `AUTONOMY-MODEL.md`, `CLAUDE.md`, `SPRINT.md`

---

## 1. Purpose

The Atrium design language puts modals at the centre of the operator experience. Background execution runs ambiently; the system only interrupts the operator's calm with modals worth their attention.

This document defines the eight modal archetypes, the visual and behavioural patterns shared across them, and the rules for when each fires.

If a system event doesn't fit one of these archetypes, the answer is almost always *don't surface it*. New archetypes require explicit addition to this document, not ad-hoc surfacing.

---

## 2. Shared properties

### Visual

- **Container:** glass card primitive (12–16px backdrop blur, 70% white overlay, 1px 8% border).
- **Default size:** 480×640 portrait at default zoom; expands to 720×800 on detail.
- **Position:** centred horizontally, 12vh from top. Floats over the Bridge.
- **Backdrop:** Bridge dims to 30% opacity behind modal. Click backdrop to dismiss (if dismissable).
- **Corners:** 20px radius (modal is a more pronounced surface than a card).
- **Shadow:** soft warm-tinted, 24px blur, 8px y-offset, 12% opacity.

### Structure

Every modal follows the same four-part structure:

```
┌─────────────────────────────────┐
│  [Visual hero]                  │  ← top third, edge-to-edge
│                                 │
├─────────────────────────────────┤
│  Headline (8–12 words)          │  ← editorial typeface
│  Context (one sentence)         │  ← body
├─────────────────────────────────┤
│  [Body — varies by archetype]   │  ← middle, scrollable if long
├─────────────────────────────────┤
│  [Action bar — 1–3 buttons]     │  ← bottom, sticky
└─────────────────────────────────┘
```

The visual hero is non-negotiable. Every modal carries one. See `DESIGN-LANGUAGE.md` for the visual library strategy.

### Motion

- **Entry:** 240ms ease-out, scale from 96% with fade-in. Backdrop fades simultaneously.
- **Exit:** 200ms ease-in, fade-out. No scale-down (feels nervous).
- **Hero load:** if visual is generated, show ambient shimmer until ready, max 600ms before falling back to library asset.

### Stack behavior

- Multiple modals never display simultaneously. They queue.
- Queue indicator: small pill in top-right of current modal showing "+3 more" if queue non-empty.
- Operator can tab through queue with `→` / `←` keys.
- High-priority modals (Escalation, Alert) jump the queue.
- Queue persists across sessions until cleared.

### Keyboard navigation

- `Esc` — dismiss (if dismissable)
- `Enter` — primary action
- `1` / `2` / `3` — action shortcuts (1 = primary, 2 = secondary, 3 = tertiary)
- `Tab` — cycle through interactive elements
- `→` / `←` — next/previous modal in queue
- `⌘ E` — expand to detail view (where supported)
- `⌘ ⇧ .` — kill switch (always available, even inside a modal)

### Telemetry

Every modal surfacing writes a row to `modal_events`:

- archetype, scope_id, fired_at, dismissed_at, action_taken, time_to_action_ms.

This data feeds the trust ratchet, the briefing rollups, and future evals on whether modal surfacing thresholds need tuning.

---

## 3. The eight archetypes

### Archetype 1: Decision

**Purpose:** ask the operator to approve, refine, or reject a proposed action.

**Trigger conditions:**

- Skill at Advise level proposes any action.
- Skill at Operate level proposes a gate action (publish, send, pay, sign, etc.).
- Skill at Steward level proposes a first-of-kind action (per AUTONOMY-MODEL §9).

**Visual hero:** rendered preview of the actual artefact at full fidelity.

- LinkedIn post → renders as it will appear on LinkedIn.
- Email → renders with subject line, recipient, formatted body.
- Image → full-size preview.
- Decision (e.g. budget allocation) → small chart showing the change.

**Headline pattern:** "Approve [artefact] for [venture]?"
Example: "Approve this LinkedIn post for Mackays?"

**Context line:** one sentence on why the system is proposing this *now*.
Example: "Triggered by your most recent harvest milestone."

**Body:** brief justification (2–3 lines), reference chips for inputs, agent attribution badge.

**Action bar:** Approve · Refine · Reject. Refine opens a chat surface inline. Reject prompts for one-line reason (used for trust ratchet feedback).

**Dismiss:** non-dismissable — must take an action. Esc keystroke does nothing.

**Telemetry priority:** every Decision modal feeds the trust ratchet. Approval count, rejection count, time-to-action all matter.

---

### Archetype 2: Brief

**Purpose:** chief-of-staff briefing on what changed and what's queued.

**Trigger conditions:**

- Daily, at operator's morning hour (default 06:00 local, configurable).
- Weekly digest on Sundays.
- On-demand via "Brief me" command.

**Visual hero:** editorial illustration from library, themed to the period (morning, evening, weekly). Not data-visual.

**Headline pattern:** "Your [period] brief"
Example: "Your morning brief"

**Context line:** the single most important item in one sentence.
Example: "Three things to look at, plus 12 actions taken overnight."

**Body:**

- 3–5 highlighted items (each a one-liner, expandable to canvas).
- Autonomy distribution stats: "47 autonomous · 8 approved · 1 escalated · 0 anomalies."
- Cross-venture pattern call-out if any (links to Insight modal).
- Queue summary: "4 decisions waiting."

**Action bar:** Open queue · Mark read · Dismiss.

**Dismiss:** dismissable. Esc closes. State persisted (won't re-fire same brief).

---

### Archetype 3: Insight

**Purpose:** surface a pattern or correlation the system detected.

**Trigger conditions:**

- Cross-venture pattern detected (e.g. same external system affecting multiple ventures).
- Trend crossing significance threshold (e.g. metric moving >2 SD from rolling mean).
- Operator-defined "watch" condition met.

**Visual hero:** chart rendered live in Atrium aesthetic. Always data-driven for this archetype.

**Headline pattern:** "[Insight summary in one phrase]"
Example: "Three ventures lost Stripe payments this morning"

**Context line:** what was observed and what it might mean.
Example: "Mackays, Kounta, and blart all saw failures within a 22-minute window."

**Body:**

- Chart (the hero), labelled with detected pattern.
- 2–3 sentences interpreting the pattern.
- Recommended actions (links to Decision modals if any are queued).
- Reference chips to underlying ventures/loops/skills.

**Action bar:** Take action · Snooze · Dismiss. "Take action" opens the recommended Decision modal. "Snooze" suppresses re-fire of same pattern for 24h.

**Dismiss:** dismissable.

---

### Archetype 4: Alert

**Purpose:** surface a threshold breach or risk crossing.

**Trigger conditions:**

- Numeric threshold crossed (cash runway, budget cap, conversion rate floor, etc.).
- External risk detected (compliance deadline approaching, contract expiry, etc.).
- Guardrail breach that doesn't escalate but warrants attention.

**Visual hero:** chart or gauge showing the metric and the threshold. Always data-driven.

**Headline pattern:** "[Metric] crossed [threshold] for [scope]"
Example: "Kounta runway crossed 4 months"

**Context line:** what triggered the alert and what changed.
Example: "Down from 5.2 months in the prior reporting period — driven by the new Sydney hire."

**Body:**

- Chart with threshold line clearly marked.
- 1–2 sentences on the cause.
- Recommended actions (often: open a planning loop, re-run forecast, open a Decision modal to authorise spend cut, etc.).

**Action bar:** Take action · Acknowledge. Acknowledge logs the alert as seen but takes no action.

**Visual treatment:** subtly more urgent than Insight — warm coral accent on the headline, slight pulse on hero on entry. Not red, not loud.

**Dismiss:** semi-dismissable. Esc acknowledges (logs as seen) rather than ignoring.

---

### Archetype 5: Completion

**Purpose:** notify the operator that a piece of work is delivered.

**Trigger conditions:**

- A Steward-level skill completes a substantial artefact (board pack, briefing doc, report, etc.).
- A multi-step workflow finishes.
- A long-running loop run completes.

**Visual hero:** thumbnail of the actual deliverable. Document cover, image, video poster, etc.

**Headline pattern:** "[Artefact] is ready for [venture/scope]"
Example: "Q1 board pack for Mackay Estates is ready"

**Context line:** what it is and what to do with it.
Example: "Drafted overnight, ready for your review ahead of the next board meeting."

**Body:**

- 2–3 sentence summary of the artefact contents.
- Reference chips to source data, related artefacts.
- "Open on canvas" prompt (primary action expands the artefact full-size).

**Action bar:** Open on canvas · Send to … · Dismiss.

**Dismiss:** dismissable. Stays in the queue until acted on or explicitly cleared.

---

### Archetype 6: Question

**Purpose:** chief of staff needs operator input to proceed.

**Trigger conditions:**

- A skill encounters a fork it cannot resolve from context (e.g. "Do you want this draft to lead with revenue or with team growth?").
- A skill needs a piece of information not in memory (e.g. "What's your target close date for the Connor offer?").
- A Promotion or anomaly handling decision requires non-binary input.

**Visual hero:** illustration from library themed "thinking" or "fork" — abstract but warm. Not data-visual.

**Headline pattern:** "[Question in one sentence]"
Example: "Lead the Mackays release with the IQF launch or the new export deal?"

**Context line:** why the system can't decide alone.
Example: "Both are strong but the angles compete — your call shapes the next three posts."

**Body:**

- Question text, slightly larger than body type.
- 2–4 answer options as cards, each with a short description and (if applicable) a small preview of what each path produces.
- Free-text option for "something else" — opens chat surface inline.

**Action bar:** Pick option (varies) · Defer.

**Dismiss:** Defer pushes to next briefing. Esc = defer.

---

### Archetype 7: Promotion

**Purpose:** celebrate trust earned, ask for autonomy opt-in.

**Trigger conditions:**

- A skill reaches a trust ratchet threshold (per AUTONOMY-MODEL §4).
- Operator hasn't explicitly opted out of promotion modals for this skill.

**Visual hero:** editorial illustration themed "milestone." Should *feel* like an achievement — warm, not transactional. Library asset, not generated.

**Headline pattern:** "[Skill] is ready for [next level]"
Example: "Mackays content drafting is ready for Steward"

**Context line:** what the skill has earned and what changes if approved.
Example: "47 of your last 50 drafts approved with no rejections — promote to autonomous?"

**Body:**

- Trust score visualisation: small bar showing position on the ratchet (e.g. "47 of 50 toward Steward").
- 2–3 examples of recent successful runs (artefact thumbnails).
- Plain-language explanation of what changes at the new level: which gates remain, which become silent, what guardrails apply.
- Reminder of the kill switch and per-skill demote keystroke.

**Action bar:** Promote · Keep at [current level] · Decide later.

**Dismiss:** "Decide later" defers for 7 days. Esc = decide later.

**Visual treatment:** slightly more celebratory than other archetypes — sage accent (Steward colour) on the headline, subtle glow on the hero.

---

### Archetype 8: Escalation

**Purpose:** surface an anomaly or guardrail breach for an autonomous skill.

**Trigger conditions:**

- Anomaly detected during a Steward or Operate skill run (per AUTONOMY-MODEL §7).
- Guardrail breach (budget, comms, voice classifier, etc.).
- External system reports unusual response affecting an autonomous skill.

**Visual hero:** depends on subtype:

- Anomaly → small chart or diff showing what was unusual.
- Guardrail breach → clear visual of the rule and what was attempted.
- Classifier fail → side-by-side of the artefact and the brand voice reference.

**Headline pattern:** "[Skill] paused — [reason]"
Example: "Mackays content pause — recipient outside historical pattern"

**Context line:** what the skill was about to do and why the system stopped.
Example: "About to email a contact never seen before. Stopped and downgraded for 24 hours."

**Body:**

- Full action context: what tool, what params, what was the trigger.
- The anomaly detail (chart, diff, or rule).
- Audit trail snippet: last 3–5 actions of this skill for context.
- Operator's options laid out clearly: approve once, approve and adjust the rule, reject, demote permanently.

**Action bar:** Approve once · Adjust rule · Reject · Demote.

**Visual treatment:** most prominent of any archetype. Warm coral border on the modal itself (not just accent). Pulses gently on entry. Bypasses queue and surfaces immediately.

**Dismiss:** non-dismissable. Esc opens the kill switch confirmation rather than dismissing.

**Telemetry priority:** every escalation feeds anomaly model retraining (Sprint 5+) and the audit trail.

---

## 4. Modal frequency budget

A core principle of Atrium: modal scarcity. The system *must not* surface so many modals that they feel like notifications. Target rates for a typical operator running 3–5 ventures:

| Archetype | Target rate | Hard ceiling |
|---|---|---|
| Decision | 5–15/day | 30/day |
| Brief | 1–2/day | 3/day |
| Insight | 1–3/week | 7/week |
| Alert | 1–5/week | 10/week |
| Completion | 1–5/day | 15/day |
| Question | 1–3/week | 7/week |
| Promotion | <1/week | 3/week |
| Escalation | <1/week | (no ceiling — surface every one) |

If the system breaches a hard ceiling for any archetype other than Escalation, the *system* is wrong, not the operator. The fix is in surfacing logic, not in operator tolerance.

---

## 5. The "no archetype fits" rule

If a system event doesn't fit one of these eight, the default is *don't surface it*. Log it, store it, make it queryable in the audit trail — but don't pull the operator out of calm for it.

The modal list is intentionally bounded. New archetypes require:

1. A clear failure of all eight existing archetypes to handle the event.
2. A target frequency budget.
3. Visual hero design and library assets commissioned.
4. Update to this document with full spec.
5. Implementation in Sprint plan.

---

## 6. Acceptance criteria

For Sprint 2 to be considered done on the modal dimension:

- [ ] Glass modal container primitive built and styled per shared properties
- [ ] Six core archetypes (Decision, Brief, Insight, Alert, Completion, Question) implemented as React components with all action variants
- [ ] Two autonomy-related archetypes (Promotion, Escalation) implemented
- [ ] Modal queue system handles ordering, priority jumps, persistence
- [ ] Keyboard navigation works for all bindings listed in shared properties
- [ ] Visual library v1 (10–15 commissioned illustrations) integrated
- [ ] Chart kit v1 (6–7 chart types in Atrium aesthetic) integrated
- [ ] `modal_events` telemetry table populated on every surfacing
- [ ] Frequency budget alarms wired (instrument hard ceilings, alert when breached)
- [ ] Dismissal/non-dismissal contracts honoured per archetype
- [ ] HANDOFF.md documents which archetypes are fully wired vs stubbed

---

## 7. Open questions (for evaluator pass)

- Should the modal queue surface as a small persistent indicator on the Bridge, or only in the modal-active state? (Lean: persistent at Bridge top-right when non-empty.)
- Should Question modals support voice input for free-text "something else"? (Lean: defer to v2.)
- Is the frequency budget per-operator-per-period or should it be self-adjusting based on operator behaviour? (Lean: per-operator-per-period in v1, self-adjusting in v2.)
- How does the modal system behave on mobile? (Out of scope for Sprint 2 — desktop-first. Mobile is a separate design pass.)
- Should Escalation modals be sendable to a third party (e.g. "ask Connor about this")? (Lean: defer to multi-operator phase, post-launch.)

---

## Definition of done for this document

- [x] Shared visual, structural, motion, stack, and keyboard properties defined
- [x] Eight archetypes specified with trigger, visual, structure, action, dismiss
- [x] Frequency budget defined per archetype
- [x] "No archetype fits" governance rule established
- [x] Acceptance criteria for Sprint 2 implementation
- [x] Open questions for evaluator
