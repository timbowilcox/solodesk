# Sprint 7 — Visual venture identity system

Date drafted: 2026-05-07
Phase: Experience layer (1 of 5)
Estimated build sessions: 1-2

## Position

First sprint of the experience layer. Foundation for Sprints 8-11. No surface in this phase ships without these components.

## Rationale

Every subsequent surface — Bridge, Watch, Day, Venture Bridge — uses per-venture visual identity. Building it once as a component library prevents skin-twice rework. Without it Sprint 8 either ships skinned wrong and gets redone, or ships ugly and the Bridge demo loses force.

## Scope

Schema migration `0006_venture_identity.sql`:
- Add `accent_color` (text, hex format like `#3B6D11`) to ventures table
- Add `mark_slug` (text enum: kounta|corum|counsel|canemate|realstyler|realtelligence|generic) to ventures table
- Backfill existing ventures rows with appropriate values

Component library at `/components/venture/`:
- `VentureMark` — renders the SVG mark for a given slug at given size
- `Sparkline` — renders an 8-point line chart with given color
- `ConnectionChip` — renders a connection provider as a small mono uppercase pill
- `StateDot` — renders active|idle|quiet status dot with optional pulse
- `VentureStripe` — renders a vertical accent stripe in the venture's accent color

Static module `/lib/venture/marks.ts`:
- Six SVG mark definitions as data, not React components
- Generic fallback mark
- Each mark uses `currentColor` so accent flows from parent

Showcase route `/admin/identity-preview`:
- Admin-only (hub_admin or platform admin)
- Renders all six ventures with all five components in light + dark mode
- Used as visual reference and as a manual smoke test for future changes

Apply identity components to existing routes where they replace placeholder UI:
- `/portfolio` venture list
- `/ventures` listing

## Acceptance criteria

- [ ] Migration 0006 applies cleanly via Supabase MCP, no errors
- [ ] All six existing/queued ventures (kounta, corum, counsel, canemate, realstyler, realtelligence) have non-null accent_color and mark_slug after migration
- [ ] Each of six ventures has a distinct mark visibly different at 16px, 22px, and 34px sizes
- [ ] Sparkline component renders 8 data points without flicker, handles flat data, single-point arrays, and negative values
- [ ] ConnectionChip shows first 3 chars of provider name in mono uppercase
- [ ] StateDot has three states: active (pulses 2.2s ease-in-out infinite), idle (35% opacity), quiet (20% opacity)
- [ ] Showcase page `/admin/identity-preview` renders all six ventures with all components
- [ ] Showcase page renders correctly in dark mode
- [ ] All five components have TypeScript prop types, no `any`
- [ ] Lighthouse a11y ≥95 on `/admin/identity-preview`

## Definition of done

- All acceptance criteria checked with proof (screenshots committed to `.archive/screenshots/sprint-7/`)
- Migration 0006 applied to dev Supabase
- Components exported from `/components/venture/index.ts`
- `/admin/identity-preview` reachable for hub_admin role only (uses existing requireVentureAccess pattern adapted for admin)
- `/portfolio` and `/ventures` routes use new components (replace any inline mark/dot code)
- HANDOFF.md committed in repo root
- All work committed with conventional-commit messages
- Tests added for sparkline edge cases (flat data, single point, negative values, all-zero)

## Quality rubric (SoloDesk specific)

| Criterion | What to check |
|-----------|--------------|
| Component purity | All five components are pure presentational. No fetch, no Supabase calls, no router access. Data passed via props |
| Dark mode | Accent colors visible in both light and dark mode without media-query overrides. Test on showcase page |
| Bright line: venture isolation | Components do not query data. Cannot leak across ventures by construction |
| TypeScript | No `any`. All props strongly typed. No `ts-ignore` |
| Migration safety | 0006 is reversible. Down migration restores prior state. No data loss on rollback |
| File structure | Marks live in `/lib/venture/marks.ts` as a data record, not as one component per mark |
| Mark legibility | Each mark renders identifiably at 16px (smallest used size in The Watch entries) |
| No emoji or icon font in marks | Marks are inline SVG, no Tabler or Lucide |

**Score threshold:** Must pass 7/8. Component purity and venture isolation are non-negotiable.

## Out of scope

- Real wordmarks or photographic logos (geometric marks only for v1)
- Animation beyond the pulse on StateDot
- Per-venture theme systems beyond accent_color (no per-venture fonts, layouts, etc.)
- Storybook setup (use the admin route as a simple showcase)
- Per-venture custom mark uploading (admin can change accent_color via SQL only in v1)

## Adversarial check questions

Before declaring done, the evaluator session must verify:

- Does dark mode work? Are accent colors readable on both light and dark backgrounds?
- What happens if a venture has no mark_slug? Falls back to generic mark with neutral gray accent
- What happens if connections array is empty? ConnectionChip shows "none" dimmed, not crashed
- Does Sparkline handle a single data point without crashing? Renders a single dot at center
- Does Sparkline handle all-zero data without rendering a flat line at the bottom? Renders centered horizontally
- Does Sparkline handle negative values? Min-max normalization clamps to viewbox
- Are component file sizes reasonable? Each <150 LOC excluding tests
- Does the showcase page work for an admin who has no assigned ventures? Yes — admin sees all
- Are accent_color values constrained to valid hex? Yes — DB CHECK constraint or app-layer validation

## Files affected

New files:
- `supabase/migrations/0006_venture_identity.sql`
- `lib/venture/marks.ts`
- `components/venture/VentureMark.tsx`
- `components/venture/Sparkline.tsx`
- `components/venture/ConnectionChip.tsx`
- `components/venture/StateDot.tsx`
- `components/venture/VentureStripe.tsx`
- `components/venture/index.ts`
- `app/admin/identity-preview/page.tsx`

Modified files:
- `app/portfolio/page.tsx` (use new components)
- `app/ventures/page.tsx` (use new components)
- `lib/auth/guard.ts` (add `requireAdmin` if not present)

## Dependencies on prior work

- ventures table exists (Sprint 0)
- requireVentureAccess pattern exists (Sprint 7 phase 1 of Nov 1 gate work)
- Tailwind + design tokens exist (Sprint 1.0)
