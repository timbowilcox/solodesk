# Sprint 8 — The Bridge (portfolio canvas)

**Date:** 2026-05-07
**Repo:** solodesk
**Phase:** Experience layer (2 of 5)
**Spec:** `/.claude/sprints/sprint-8-bridge.md`
**Estimated build sessions:** 2

## Scope

The Bridge becomes the operator's home screen — `/` for authenticated operators on `app.solodesk.ai`. Replaces the current `/dashboard` events surface as the landing experience. Surfaces what changed overnight, what's running now, and what's quiet — at a glance, no clicking.

Two surfaces in this sprint:

1. **The Bridge** (`/`) — portfolio canvas. 2-3 column responsive grid of venture tiles (auto-fit minmax 280px). Each tile renders Sprint 7 components (`VentureMark`, `StateDot`, `Sparkline`, `ConnectionChip`) plus venture name, vital sign string, pending count, last activity. Right rail = The Watch placeholder (Sprint 9 fills in). Top chrome = SoloDesk wordmark, Bridge / Day toggle (Day disabled until Sprint 9), live clock. Time-of-day chrome variant set via `TimeOfDayProvider` injecting `--chrome-tone` on `<html>` every minute.

2. **The Venture Bridge** (`/ventures/[slug]`) — per-venture canvas. Header = large `VentureMark` + venture name. 6-tile function grid: Strategy, Metrics, Content, Customers, Compliance, Operations. Each `FunctionTile` = Phosphor regular icon + function name + current state line. Click handler = existing per-domain views (Strategy → `/decisions`, Metrics → `/digests`, Content → `/content`, Customers → `/support`, Compliance → `/settings/connections`, Operations → `/memories`).

**Substitutions and deviations from spec (ratified by Tim 2026-05-07):**

- **Tabler icons → Phosphor regular weight.** Spec says "Tabler outline icon" on FunctionTile. CLAUDE.md hard-prohibits Lucide and (by the same reasoning) Tabler — Phosphor regular weight is the only sanctioned icon set. Substituted across this sprint and the rest of the experience-layer phase. Documented in HANDOFF.
- **Migration number bump.** Spec calls for `0007_bridge_aggregation.sql`; that slot is taken by `venture_members`. This sprint uses `0009_bridge_aggregation.sql`.
- **`documents.status='drafting'` not yet a state.** Spec uses `drafting` to derive the `active` StateDot. Sprint 10 introduces it (streaming Sections). For Sprint 8, derive `active` from `loop_runs` activity in the last 5 minutes only. Documented in state-derivation lib comment.
- **App-domain `/` is now the Bridge.** Existing `/dashboard` becomes a 308 redirect to `/`. The `/` → `/dashboard` redirect in `proxy.ts` is removed.

## Acceptance criteria

- [ ] Migration `0009_bridge_aggregation.sql` applies cleanly via Supabase MCP, no errors
- [ ] `bridge_tiles(p_user_id uuid, p_is_admin boolean)` Postgres function returns one row per visible venture in a single roundtrip
- [ ] `/` renders the Bridge for authenticated users with at least one assigned venture
- [ ] Marketing landing page still renders for unauthenticated users on `solodesk.ai`
- [ ] Bridge shows all ventures the user has membership for (admin sees all six)
- [ ] Each tile renders mark, name, vital sign, sparkline, pending count, connections, StateDot, last-activity timestamp
- [ ] StateDot pulses for `active` ventures, dim for `idle`, very dim for `quiet`
- [ ] Time-of-day chrome state changes at 06:00 / 12:00 / 18:00 local time and updates without page refresh (interval check on the minute)
- [ ] Tile click navigates to `/ventures/[slug]`
- [ ] Venture Bridge (`/ventures/[slug]`) header shows large `VentureMark` (34px) + venture name
- [ ] Venture Bridge function grid renders 6 `FunctionTile`s with Phosphor icons and per-domain state line
- [ ] Function tile clicks navigate to existing per-domain views without 404
- [ ] `/dashboard` returns 308 to `/`
- [ ] No layout shift between server render and client hydration on the Bridge
- [ ] Member with 2 assigned ventures sees exactly 2 tiles, no leakage from other ventures

## Definition of done

- [ ] All acceptance criteria checked with proof
- [ ] Vital signs aggregation runs in a single SQL query (RPC `bridge_tiles`) — no per-venture roundtrips
- [ ] Bridge component lives at `/app/(authed)/page.tsx` with auth-conditional render
- [ ] Venture Bridge lives at `/app/(authed)/ventures/[slug]/page.tsx`
- [ ] `/dashboard` 308 redirects to `/`
- [ ] `/portfolio` retained (unaffected by this sprint — admin diagnostic surface)
- [ ] HANDOFF.md committed to root and `.archive/handoffs/sprint-8-handoff.md`
- [ ] Tested with synthetic data: derivation lib unit tests cover 1 venture / many ventures / empty / error states
- [ ] All work committed with conventional-commit messages
- [ ] `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` clean, `pnpm build` clean
- [ ] Adversarial check questions answered in HANDOFF

## Quality rubric

| Criterion | What to check |
|-----------|---------------|
| Single-query aggregation | Vital signs come from one SQL roundtrip via `bridge_tiles` RPC, not per-venture queries. Verified by reading the call site |
| Membership scoping | Member with 2 assigned ventures sees exactly 2 tiles. Admin flag opens the gate; the function takes `p_user_id` + `p_is_admin` and filters at the SQL layer, not the client |
| Bright line: venture isolation | Each tile's data tagged with `venture_id`. No render path constructs a tile from data without `venture_id` check. Function returns rows keyed by venture_id |
| Component reuse | Tiles use Sprint 7 components (`VentureMark`, `Sparkline`, `ConnectionChip`, `StateDot`, `VentureStripe`). No reimplementation, no inline marks |
| Loading state | Server render fully populated — no client skeleton flash. (Server component, no useEffect-driven fetches.) |
| Empty state | User with no assigned ventures sees a helpful empty state, not crash |
| TypeScript | No `any`. State derivation logic is fully typed. RPC return type asserted at the boundary |
| Icon set | All FunctionTile icons are Phosphor regular weight, never Tabler/Lucide |

**Score threshold:** Must pass 7/8. Single-query aggregation, membership scoping, and venture isolation are non-negotiable.

## Out of scope

- Real-time updates to tile state (Sprint 9 adds via Watch realtime subscription)
- Per-tile drill-down preview on hover
- Customizable tile order or pinning
- Dashboard widgets beyond venture tiles
- The Day toggle wiring (placeholder button only — disabled, Sprint 9 wires it up)
- The Watch column content (placeholder column only — Sprint 9 wires it up)
- `documents.status='drafting'` driven activity (Sprint 10)
- `/portfolio` redesign (out of scope; admin diagnostic surface unchanged)

## Adversarial check questions (to be answered in HANDOFF)

- What if a venture has no documents and no events? Expected: tile shows "No activity" with a quiet StateDot
- What if a venture has 100+ pending documents? Expected: pending count caps display at "99+"
- What does the Bridge look like with 1 venture? With 12? Expected: grid responsive via auto-fit minmax(280px), no awkward gaps
- What if the `bridge_tiles` RPC fails? Expected: page renders error state, not a crash
- What if a member's membership is revoked mid-session? Expected: next page load shows updated tile set
- Does the time-of-day state change without page refresh? Expected: yes — interval check on the minute via `TimeOfDayProvider`
- Does the Venture Bridge function grid render for a venture with no decisions, no metrics, etc? Expected: each tile shows quiet state with neutral copy
- Does the back-link from Venture Bridge return to the Bridge correctly?
- Does the `/dashboard` 308 redirect preserve query strings?
- Does `getConnection` ever appear in the tile render path? Expected: no — the Bridge surfaces a count via the RPC, never decrypted vault data
