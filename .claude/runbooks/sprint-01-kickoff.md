# Sprint 1 Kickoff Runbook

Read this before starting Sprint 1. Sprint 1 is three sub-sprints: design migration, Document substrate, Decision document type. They must be done in that order because the Document UI depends on the design tokens being in place.

---

## Required reading before starting

In this order:

1. `/CLAUDE.md` — initialiser, including the new design and document anti-patterns
2. `/.claude/design-system.md` — the visual + interaction spec, authoritative
3. `/.claude/decision-document-interface.md` — the Document/Section/Comment substrate spec
4. `/ROADMAP.md` Sprint 1 section — high-level scope
5. `/SPRINT.md` — current sprint detail (will be replaced from ROADMAP for this sprint)

If you find yourself making a styling decision not covered in `/.claude/design-system.md`, stop and ask. Don't fall back to shadcn or AI-startup defaults.

---

## Pre-build prep (Tim's responsibility)

Before opening the build session:

- [ ] **Decide on Söhne licensing.** Either purchase the web licence (~$600/yr from Klim) or commit to using Inter for v0. This must be locked before Sprint 1 begins — switching mid-sprint means re-auditing every page.
- [ ] **Confirm the Prussian-blue accent decision** stands. If you've changed your mind, update `/.claude/design-system.md` first — don't let the build session re-decide it.
- [ ] **Confirm Sprint 0 deploy verification is complete** and the evaluator session passed Sprint 0 with a score ≥ 7. Sprint 1 starts on a verified-deployed base.
- [ ] **Confirm Sprint 0.5 (memory layer) is complete and evaluator-passed.** The Document substrate's section embeddings depend on the recall + buildAgentPrompt helpers from 0.5.

---

## Order of operations within Sprint 1

### Sprint 1.0 — Design migration (half session)

This is a non-additive sprint — no new features, just bringing the Sprint 0 codebase in line with `/.claude/design-system.md`.

1. Install Söhne (or Inter via next/font as fallback)
2. Remove Geist from package.json and any imports
3. Replace Tailwind v4 `@theme` block with the SoloDesk palette
4. Install `@phosphor-icons/react`, remove `lucide-react`
5. Audit every existing page: rewrite component styles to match the spec
6. Replace any avatar/initials components with three-letter mono tags
7. Replace empty-state copy ("No events yet" → "No events.") and remove illustrations/icons from empty states
8. Add `prefers-reduced-motion` support
9. Run Lighthouse Accessibility — target ≥ 95
10. Capture screenshots of every page for the HANDOFF (before/after if Sprint 0 screenshots exist)

**Stop here, commit, push.** Don't proceed to Sprint 1.1 in the same session — fresh context for the substrate work.

### Sprint 1.1 — Document substrate

11. Migration `0003_documents.sql` — `documents`, `sections`, `comments` tables. Embeddings on sections (Sprint 0.5 conventions apply).
12. Section-kind component dispatch — `<Section>` renders the right child by `section.kind`. Initial kinds for v1: `prose`, `recommendation`, `alternatives`, `kill_criteria`, `evidence`, `risk`, `agent_note`, `comment_thread`.
13. Per-Section status state machine in the data layer.
14. Comment model with required evidence pointer (Zod-enforced).
15. Document layout component: 60px margin / content / 240px comments. Section markers in mono uppercase in left margin per the mockup.
16. Server actions for approve, revise, dismiss-comment, add-comment, accept-comment-suggestion. Each logs to `loop_runs`.
17. Helper that writes to existing `decisions` table when a Decision Document is fully approved (backwards-compatible with Sprint 0 schema).

**Stop here, commit, push.** Fresh context for the Decision-type sprint.

### Sprint 1.2 — Decision document type + retrospective

18. `/ventures/[slug]/decisions` Table view (the Table primitive — keyboard nav, default filter)
19. `/ventures/[slug]/decisions/new` creates a Decision Document
20. `/ventures/[slug]/decisions/[id]` — full Document view per the mockup
21. Retrospective — `/decisions?retro=true` showing decisions with empty outcomes
22. Outcome notes embedding into `memories` (Sprint 0.5 dependency)
23. Weekly Sunday cron creates a retrospective Document

---

## Hot tips and gotchas

- **The 60px left margin for section markers is load-bearing.** Don't optimise it away on narrow screens. On mobile (<640px), section markers move to inline above the section as 11px mono captions instead — that's the only acceptable variant.
- **Tabular figures matter.** `font-feature-settings: "tnum"` on every numeric column. Enabling at the body level globally is wrong — it affects body prose where proportional figures look better.
- **Curly quotes in user-facing copy.** Set up an ESLint rule or Prettier plugin to flag straight quotes in JSX strings — easier than catching them in review.
- **Three-letter author tags.** `tim`, `crt` (any critic), `agt` (any non-critic agent), `sys` (system events). Tooltip on hover shows the full agent name. Don't add new tags without updating `/.claude/design-system.md`.
- **The accent colour is precious.** Don't sprinkle Prussian blue. Active sidebar item, focused input bottom border, page-title underline rule, links in body prose, single-pixel rules under section headings — that's it. If you're using it for a tenth purpose, you've crossed a line.
- **Dark mode comes after light mode.** Don't try to ship both at once. Sprint 1 ships light only; dark mode lands in a small dedicated sprint after Sprint 6.

---

## Anti-patterns to watch for during Sprint 1

When reviewing the build session's output, scan for these:

- Any `border-radius` value other than `0`, `4px`, or `6px` → violation
- Any `box-shadow` other than the focus ring on inputs → violation
- Any colour token outside the SoloDesk palette → violation
- Any icon on a button → violation
- Any emoji anywhere outside user-generated content → violation
- Any "Welcome back, Tim!" or motivational copy → violation
- Any avatar circle → violation
- Any Lucide import → violation
- Any Geist reference → violation
- Any rounded card with `bg-white` and a soft shadow → multiple violations

---

## When Sprint 1 is done

Three sub-handoffs (one per sub-sprint) are acceptable, or one combined handoff at the end. The combined version is preferred because the design migration alone isn't a useful artifact to evaluate independently.

Evaluator session prompt is the standard adversarial review template — read CLAUDE.md, ROADMAP, SPRINT, design-system, decision-document-interface, HANDOFF, then verify every acceptance criterion plus a thorough sweep of the design anti-patterns above.