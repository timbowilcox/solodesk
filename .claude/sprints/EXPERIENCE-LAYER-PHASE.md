# Experience Layer Phase

Date drafted: 2026-05-07
Sprints: 7 → 11 (five sprints, target 4-5 weeks)
Prerequisite: ROADMAP substrate complete (current state — Sprints 0-6 plus connections + team-inbound substrate)

## Why this phase exists

The substrate is built. The product layer is not. SoloDesk currently feels like a heavyweight wiki with credential management because every surface is operator-driven and every artifact is static. The experience layer is what makes SoloDesk feel like a COO working two rooms over rather than a structured tool you have to drive.

This phase does not add Loops beyond redefining two existing ones (Loop 1, Loop 8). It builds the four surfaces the existing Loops need to feel alive:

- **The Bridge** — portfolio canvas, all ventures at a glance with vital signs
- **The Watch** — persistent activity stream, prose narration of what SoloDesk is doing right now
- **The Day** — curated today view, the things that actually need the operator
- **The Venture Bridge** — per-venture function grid, replaces the current per-venture dashboard

Plus the connective tissue:

- **Visual venture identity system** — mark, accent, sparkline, chips per venture
- **Streaming Section generation** — Documents render Section-by-Section as agents write them
- **Cross-venture command bar** — persistent ⌘K input scoped to portfolio or current venture
- **Loop 8 redefinition** — event-driven and reactive, not just daily
- **Loop 1 redefinition** — visible conversation thread between agent, critic, and operator

## Sequence

| Sprint | Surface | Rationale for order |
|--------|---------|---------------------|
| 7 | Visual venture identity system | Foundation. Every subsequent sprint depends on these components |
| 8 | The Bridge (portfolio canvas) | Highest-leverage surface. The "control centre" feeling lives here. Uses Sprint 7 |
| 9 | The Watch + The Day (ambient surfaces) | Together they make the Bridge feel alive. Both ride the events table |
| 10 | Streaming Sections + Loop 1 as conversation | Documents come alive. Loop 1 ships as the first conversation surface |
| 11 | Command bar + Loop 8 reactive | Cross-venture intelligence. Final sprint pulls everything together |

After Sprint 11 the product is materially different — proactive surfaces, ambient activity, cross-venture command. That is the productisation story for the Nov 1 gate.

## Bright-line tensions to navigate

The existing bright lines in CLAUDE.md and decision-document-interface.md were written assuming a request-response substrate. Two need rethinking before this phase ships, captured in `experience-layer-doc-updates.md`:

1. **Per-section approval state machine** — currently every Section requires individual approval click. With streaming, this stalls the experience every few seconds. Replace with full-Document approval plus Section-level diff/comment surface.
2. **Explicit-click send on all communication** — stays for external comms (customer email, vendor Slack). For internal Documents flowing between Loops, the ceremony probably needs to relax or The Watch will be useless.

The following bright lines stay absolutely:
- No flat artifacts — every loop output is still a Document with typed Sections
- No critic ships a global review note — comments still anchor to Sections with evidence
- No Document approved while agent_note Sections are unresolved
- Cross-venture credential leakage is the bright line
- Every loop invocation goes through buildAgentPrompt()
- Every recall scoped to one venture_id

## Success criteria for the phase as a whole

The phase is successful when:

1. Opening SoloDesk in the morning shows portfolio state at a glance without clicking — The Bridge surfaces what changed overnight
2. The Watch produces ≥1 visible entry per active venture per hour during a working day, written as prose
3. The Day produces a finite curated list (15-30 items) the operator can finish — when finished, the day is closed
4. Loop 8 fires from real Stripe webhook events and produces a Document automatically
5. Loop 1 produces a streaming Document the operator can interrupt mid-stream
6. The cross-venture command bar answers "What's happening with [venture]" in <5 seconds
7. Manual operator load measurably drops — pre-phase baseline: every Document is operator-authored. Post-phase target: ≥50% of Documents originate from a Loop, operator role is approve/reject/edit

## What this phase explicitly does NOT include

- No new Loops (only redefinition of Loop 1 and Loop 8)
- No mobile-specific UI work
- No real wordmarks or photographic logos (geometric marks only)
- No voice input on the command bar
- No multi-user concurrent Document editing
- No cross-venture Loop synthesis (Loop 8 stays single-venture for now)
- No portfolio-audit Loop 11 (deferred to a later phase)

## Phase definition of done

- All five sprint HANDOFF.md files committed
- Adversarial evaluator session run on each sprint (per agent-harness skill)
- ROADMAP.md updated to reflect completed phase
- CLAUDE.md updated with new bright lines and modified ones
- design-system.md updated with new visual vocabulary
- Phase retrospective Document written into Tim's personal venture (or a portfolio-scope Document)

## Files

Sprint specs in this directory:
- `sprint-7-visual-identity.md`
- `sprint-8-bridge.md`
- `sprint-9-watch-day.md`
- `sprint-10-streaming-sections.md`
- `sprint-11-command-loop8-reactive.md`

Doc edits:
- `experience-layer-doc-updates.md` — surgical edits to ROADMAP.md, CLAUDE.md, design-system.md
