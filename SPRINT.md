# Sprint 7 — Visual venture identity system

**Date:** 2026-05-07
**Repo:** solodesk
**Phase:** Experience layer (1 of 5)
**Spec:** `/.claude/sprints/sprint-7-visual-identity.md`
**Estimated build sessions:** 1-2

## Scope

First sprint of the experience layer. Foundation for Sprints 8-11 — every subsequent surface (Bridge, Watch, Day, Venture Bridge) consumes the same component library. Builds it once to prevent skin-twice rework.

Schema migration adds `accent_color` (hex) + `mark_slug` (enum) to `ventures`, backfills existing rows. Component library at `/components/venture/` ships five pure presentational components (`VentureMark`, `Sparkline`, `ConnectionChip`, `StateDot`, `VentureStripe`) consuming static SVG mark data from `/lib/venture/marks.ts`. Showcase route at `/admin/identity-preview` (admin-only) renders all six ventures × all five components in light + dark mode for visual reference + manual smoke. Existing `/portfolio` and `/ventures` routes refactored to consume the new components.

**Migration number deviation from spec:** spec calls for `0006_venture_identity.sql`, but 0006 was used by `portfolio_documents` (Loop 11) and 0007 by `venture_members` (team inbound substrate). This sprint uses `0008_venture_identity.sql`. Path also adapted from `/app/admin/...` → `/app/(authed)/admin/...` to match the existing route group convention.

## Acceptance criteria

- [ ] Migration `0008_venture_identity.sql` applies cleanly via Supabase MCP, no errors
- [ ] All six ventures (kounta, corum, counsel, canemate, realstyler, realtelligence) have non-null `accent_color` and `mark_slug` after migration (backfill defaults applied to any pre-existing rows; full set seeded on dev)
- [ ] Each of six ventures has a distinct mark visibly different at 16px, 22px, and 34px sizes
- [ ] `Sparkline` renders 8 data points without flicker, handles flat data, single-point arrays, and negative values
- [ ] `ConnectionChip` shows first 3 chars of provider name in mono uppercase
- [ ] `StateDot` has three states: active (pulses 2.2s ease-in-out infinite), idle (35% opacity), quiet (20% opacity)
- [ ] Showcase page `/admin/identity-preview` renders all six ventures with all components
- [ ] Showcase page renders correctly in dark mode
- [ ] All five components have TypeScript prop types, no `any`
- [ ] Lighthouse a11y ≥95 on `/admin/identity-preview` (operator-driven; documented in HANDOFF if unverifiable in headless run)

## Definition of done

- [ ] All acceptance criteria checked with proof (test output / screenshot / SQL row)
- [ ] Migration `0008` applied to dev Supabase
- [ ] Components exported from `/components/venture/index.ts`
- [ ] `/admin/identity-preview` reachable for admin role only via `requireAdminContext`
- [ ] `/portfolio` and `/ventures` routes use new components
- [ ] HANDOFF.md committed (root + archive)
- [ ] All work committed with conventional-commit messages
- [ ] Tests added for `Sparkline` edge cases (flat data, single point, negative values, all-zero)
- [ ] Adversarial check questions from spec answered in HANDOFF
- [ ] `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` clean, `pnpm build` clean

## Quality rubric

| Criterion | What to check |
|-----------|---------------|
| Component purity | All five components are pure presentational. No fetch, no Supabase calls, no router access. Data passed via props |
| Dark mode | Accent colors visible in both light and dark mode without media-query overrides. Test on showcase page |
| Bright line: venture isolation | Components do not query data. Cannot leak across ventures by construction |
| TypeScript | No `any`. All props strongly typed. No `ts-ignore` |
| Migration safety | `0008` is reversible. Down migration restores prior state. No data loss on rollback |
| File structure | Marks live in `/lib/venture/marks.ts` as a data record, not as one component per mark |
| Mark legibility | Each mark renders identifiably at 16px (smallest used size in The Watch entries) |
| No emoji or icon font in marks | Marks are inline SVG, no Tabler or Lucide |

**Score threshold:** Must pass 7/8. Component purity and venture isolation are non-negotiable.

## Out of scope

- Real wordmarks or photographic logos (geometric marks only for v1)
- Animation beyond the pulse on `StateDot`
- Per-venture theme systems beyond `accent_color` (no per-venture fonts, layouts, etc.)
- Storybook setup (use the admin route as a simple showcase)
- Per-venture custom mark uploading (admin can change `accent_color` via SQL only in v1)

## Adversarial check questions (to be answered in HANDOFF)

- Does dark mode work? Are accent colors readable on both light and dark backgrounds?
- What happens if a venture has no `mark_slug`? Falls back to generic mark with neutral accent
- What happens if connections array is empty? `ConnectionChip` shows "none" dimmed, not crashed
- Does `Sparkline` handle a single data point without crashing? Renders a single dot at center
- Does `Sparkline` handle all-zero data without rendering a flat line at the bottom? Renders centered horizontally
- Does `Sparkline` handle negative values? Min-max normalization clamps to viewbox
- Are component file sizes reasonable? Each <150 LOC excluding tests
- Does the showcase page work for an admin who has no assigned ventures? Yes — admin sees all
- Are `accent_color` values constrained to valid hex? Yes — DB CHECK constraint
