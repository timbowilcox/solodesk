# Experience layer — doc updates

Date drafted: 2026-05-07
Companion to: EXPERIENCE-LAYER-PHASE.md and sprint-7 through sprint-11 specs

This file contains surgical edits to the three existing canonical docs. Apply BEFORE Sprint 7 starts. Each edit is presented as: location → current text → replacement text. If current text is approximate, find the closest match.

---

## ROADMAP.md edits

### Edit 1 — add the experience layer phase

**Location:** After the "After Sprint 6" section, before any other post-Sprint-6 entries.

**Add this section verbatim:**

```markdown
## Experience layer phase (Sprints 7-11)

Five sprints, target 4-5 weeks. Productisation phase. Builds the surfaces that make the substrate feel like a COO rather than a wiki. See `/.claude/sprints/EXPERIENCE-LAYER-PHASE.md` for the phase overview.

| Sprint | Surface | Spec |
|--------|---------|------|
| 7 | Visual venture identity system | sprint-7-visual-identity.md |
| 8 | The Bridge (portfolio canvas) | sprint-8-bridge.md |
| 9 | The Watch + The Day (ambient surfaces) | sprint-9-watch-day.md |
| 10 | Streaming Sections + Loop 1 conversation | sprint-10-streaming-sections.md |
| 11 | Command bar + Loop 8 reactive | sprint-11-command-loop8-reactive.md |

Hard prerequisite for Nov 1 productise gate. Phase completion criteria in EXPERIENCE-LAYER-PHASE.md.
```

### Edit 2 — defer Loop 11 portfolio audit

**Location:** Wherever Loop 11 is currently mentioned (likely in "After Sprint 6" candidates from earlier AIOS handoff).

**Change:** Reposition Loop 11 to "Phase 3 candidates (post experience layer)" rather than as a Nov 1 gate item. Replace any Nov 1 gate language for Loop 11 with: "Phase 3 candidate, not gating Nov 1."

Rationale: the experience layer is the higher-leverage Nov 1 work. Portfolio audit Loop 11 is meaningful but additive and can ship after.

---

## CLAUDE.md edits

### Edit 1 — add the new bright lines (Sprint 7 prerequisite)

**Location:** In the bright-lines list (search for the existing list — likely under a heading like "Bright lines that govern everything from Sprint 1 onwards").

**Add these lines:**

```markdown
- All venture-displaying surfaces use the venture identity component system from `/components/venture/`. No inline marks, no inline state dots, no inline sparklines elsewhere.
- Loop definitions are venture-portable. A Loop is defined once and takes ventureId at runtime via buildAgentPrompt(). Venture-specific behaviour lives in venture-scoped Document context, never in the Loop definition. Cross-venture comparison of Loop outcomes must remain architecturally possible at all times.
- Internal Loop activity (agent generating, critic reviewing, Document state transitions) is observation, not communication. The Watch surfaces this as narrative without explicit operator click. External communication (customer email, vendor message, Slack outbound) still requires explicit click.
- Command bar queries enforce membership scoping at the buildAgentPrompt layer, not the client layer.
```

### Edit 2 — modify the per-Section approval rule (Sprint 10 prerequisite)

**Location:** Find the existing line that reads (approximately):
> "No Document → approved while agent_note Sections are unresolved"

**Keep this line as-is.**

Now find the line about per-Section approval state machine. It likely reads (approximately):
> "Per-Section state machine [...] approval state per Section"

**Replace with:**
> Document approval is a single operator action. Section-level state (resolved, agent_note open, etc.) is enforced at approval time — operator cannot approve while any agent_note Section is unresolved. Operator can edit any Section pre-approval. Critic comments still anchor to specific Sections with mandatory evidence pointers.

Rationale: per-Section click-to-approve stalls streaming experience every few seconds. Document-level approval with Section-level enforcement preserves the audit discipline without the ceremony.

### Edit 3 — modify the auto-send rule (Sprint 9 prerequisite)

**Location:** Find the existing line that reads (approximately):
> "No auto-send on any communication — explicit user click required."

**Replace with:**
> No auto-send on external communication (customer email, vendor messages, outbound Slack, public posts) — explicit operator click required for every external send action. Internal Loop-to-Loop and Loop-to-Document handoffs do not require operator click. Internal Loop activity surfaces in The Watch as observation, not as outbound communication.

Rationale: agent → critic handoff happening on every Section was going to require thousands of clicks. The bright line was always about external comms.

### Edit 4 — add the streaming Sections rule (Sprint 10 prerequisite)

**Location:** After the existing rule about every loop output being a Document with typed Sections.

**Add:**
> Streaming Loop output emits typed Section events. The parser is the single source of truth — Loop output that does not parse into typed Sections is rejected, not coerced.

---

## design-system.md edits

### Edit 1 — add the venture identity section (Sprint 7 prerequisite)

**Location:** New top-level section, after existing typography and color sections.

**Add:**

```markdown
## Venture identity system

Every venture has visual identity components defined in `/components/venture/`. No inline rendering of these elsewhere — surfaces import from the venture identity module.

### Venture marks

Six geometric SVG marks, one per venture, plus a generic fallback. Each mark uses `currentColor` so accent flows from parent. Defined as data in `/lib/venture/marks.ts`, not as React components.

Sizes used:
- 16px — in The Watch entries, in The Day items
- 22px — on Bridge tiles
- 34px — on Venture Bridge header

### Venture accent colors

Stored on ventures.accent_color (hex format). Six current values:
- Kounta: `#3B6D11` (forest green — financial)
- Corum: `#185FA5` (board navy — governance)
- Counsel: `#A32D2D` (heritage red — family)
- CaneMate: `#633806` (sugarcane amber — agricultural)
- RealStyler: `#993C1D` (terracotta — property)
- Realtelligence: `#2C2C2A` (print charcoal — publishing)

Accents apply to: marks, Sparklines, Watch entry dots, Day item stripes, Venture Bridge header.

Accents do not apply to: chrome, text, primary surfaces. SoloDesk's own palette governs chrome.

### Sparkline component

8-data-point line chart, ~70x18px, single stroke colored by venture accent. Used on Bridge tiles only in v1. Edge cases: flat data renders centered horizontal line; single point renders centered dot; negative values are min-max normalized.

### State dot

3 states: active (pulses 2.2s ease-in-out infinite), idle (35% opacity), quiet (20% opacity). Active state is the only animated component on the Bridge in resting state.

### Connection chip

Small mono uppercase pill, first 3 chars of provider name, 0.5px border, neutral palette. Empty connections array shows "none" chip dimmed.

### Venture stripe

Vertical 3px-wide accent bar on left edge of Day items. Full height of the item.
```

### Edit 2 — add the time-of-day chrome states (Sprint 8 prerequisite)

**Location:** After the venture identity section.

**Add:**

```markdown
## Time-of-day chrome

The Bridge frame has subtle chrome variants based on local time:

- 06:00–12:00 (morning): `--chrome-tone: warm` — slightly warmer border on the frame
- 12:00–18:00 (afternoon): `--chrome-tone: neutral` — default
- 18:00–06:00 (evening): `--chrome-tone: cool` — slightly cooler border on the frame

Implementation: CSS custom property set on root via JS, updated every minute. Single solid border-color per state — not a gradient.

This is the only chrome-level color shift in SoloDesk. It signals "the day is moving" without flashing or animating.
```

### Edit 3 — add ambient motion vocabulary (Sprint 9 prerequisite)

**Location:** New section, after time-of-day.

**Add:**

```markdown
## Ambient motion

Motion design across the experience layer follows three rules:

1. **Slow ease curves.** All transitions 250-900ms, ease-out or ease-in-out. No bouncing, no spring physics. The pacing should read as considered, not snappy.

2. **One animated element at rest.** On any view, only one component animates while idle (typically the active StateDot pulse). Multiple simultaneous animations read as glitchy.

3. **Fade-in for new content.** New Watch entries, new Sections in streaming Documents, and new Day items use 600-700ms ease-out fade-in with 3-4px translateY. Removed content fades out at 250ms ease-in (no translation).

No glow, no neon, no synthwave, no robot voices, no glitch effects, no parallax.
```

### Edit 4 — add streaming Document vocabulary (Sprint 10 prerequisite)

**Location:** Section on Document interface — likely already exists in `decision-document-interface.md`. Add this subsection there.

**Add:**

```markdown
## Streaming Sections

A Document in `state: drafting` renders Sections as they stream in from the Loop. Section appears immediately as a typed skeleton, then content streams token-by-token at 30-50 tokens/sec. State pill per Section visible during stream: drafting → ready → critic_reviewing → resolved.

Critic comments arrive after agent finishes all Sections, anchored to specific Sections with evidence pointers. Comments render as margin annotations on desktop; collapse to inline expandable on narrow viewports.

Operator can edit a Section after it streams in. Edit does not interrupt other Sections still being written. Edits are auto-saved.

Operator can pause client SSE (server completes anyway, idempotent save) or cancel the server run (kills the run, leaves Document in state: cancelled).
```

---

## Application order

Apply edits in this sequence:

1. ROADMAP.md edits — purely additive, no risk to existing flow
2. CLAUDE.md edits — three modifications + one addition. Run with diff visibility, verify nothing else accidentally changes
3. design-system.md edits — purely additive sections
4. Commit each as a separate change with clear messages:
   - "Add experience layer phase to ROADMAP"
   - "Update bright lines for streaming and ambient surfaces"
   - "Add venture identity, time-of-day, ambient motion to design system"

After commits, Sprint 7 can begin. Each subsequent sprint must verify the relevant doc edits are present in CLAUDE.md before starting (per agent-harness skill, CLAUDE.md is the initializer).

---

## Adversarial check before applying

Read each edit out loud. Ask:
- Does this soften an existing bright line in a way that allows cross-venture leakage? No.
- Does this allow an external communication to bypass operator click? No — only internal Loop activity bypasses click.
- Does this allow flat artifacts? No — typed Sections still required.
- Does this create a path for an agent to write a Document without going through buildAgentPrompt? No.
- Could a future contributor read these edits and conclude that audit discipline has been relaxed? Verify by re-reading. The discipline moves location, doesn't disappear.
