# Sprint 8 — The Bridge (portfolio canvas)

Date drafted: 2026-05-07
Phase: Experience layer (2 of 5)
Estimated build sessions: 2
Depends on: Sprint 7 (visual venture identity components)

## Position

Replaces the current `/portfolio` route — which is admin-only and primarily a list — with the Bridge. The Bridge becomes the operator's home screen.

## Rationale

The "control centre" feeling lives here. Without the Bridge, the operator opens SoloDesk and sees a list of routes, not a status of the portfolio. The Bridge surfaces what changed overnight, what's running now, and what's quiet — at a glance, no clicking.

## Scope

New route: `/` (root) becomes the Bridge for authenticated operators. Unauthenticated still shows the marketing landing page. Per-route gating uses existing membership lib.

Bridge layout:
- Top chrome: SoloDesk wordmark, Bridge / Day toggle, live clock
- Main canvas: 2-3 column responsive grid of venture tiles (auto-fit minmax 280px)
- Right rail: The Watch placeholder (Sprint 9 fills this in; Sprint 8 ships an empty styled column with a coming-soon state)

Each venture tile renders:
- Sprint 7 VentureMark + venture name + StateDot
- One vital sign string (e.g. "MRR up 4.2 percent" or "Strategy memo open")
- Sparkline (8 data points pulled from venture-specific recent metric)
- Pending count (e.g. "3 pending")
- ConnectionChip row (first 3 connection providers)
- "Last activity" timestamp (relative)

Click handler: tile → `/ventures/[slug]` (existing route — gets reworked into Venture Bridge in same sprint).

Venture Bridge (per-venture page) gets reworked in this sprint:
- Header: large VentureMark + venture name
- Function grid: 6 tiles (Strategy, Metrics, Content, Customers, Compliance, Operations)
- Each function tile: Tabler outline icon + function name + current state line
- Click handler: tile → existing per-domain views (decisions for Strategy, etc.)

Vital signs aggregation:
- Single SQL query per page load returning all visible ventures plus their derived state
- State derivation rules:
  - active: any document in `drafting` state OR any loop run in last 5 min
  - idle: documents exist but none drafting, or last loop run 5min-24hr ago
  - quiet: no activity in 24hr+
- Pending count = count of documents in pending_review or has_open_agent_notes state
- Vital sign string = derived per venture from latest meaningful event

Time-of-day chrome states:
- Morning (06:00-12:00): subtle warm tone on frame border (`--accent-morning`)
- Afternoon (12:00-18:00): neutral
- Evening (18:00-06:00): subtle cool tone on frame border (`--accent-evening`)
- Implementation: CSS custom property set on root via JS based on local time

## Acceptance criteria

- [ ] `/` renders the Bridge for authenticated users with at least one assigned venture
- [ ] Marketing landing page still renders for unauthenticated users
- [ ] Bridge shows all ventures the user has membership for (admin sees all)
- [ ] Each tile shows mark, name, vital sign, sparkline, pending count, connections, state, time
- [ ] StateDot pulses for active ventures, dim for idle, very dim for quiet
- [ ] Time-of-day states change at 06:00 and 18:00 local time
- [ ] Tile click navigates to `/ventures/[slug]` correctly
- [ ] Venture Bridge (`/ventures/[slug]`) header shows large VentureMark + name
- [ ] Venture Bridge function grid renders 6 function tiles with Tabler icons and current state
- [ ] Function tile clicks navigate to existing per-domain views without 404
- [ ] No layout shift between server render and client hydration
- [ ] Lighthouse perf ≥85 on Bridge first load

## Definition of done

- All acceptance criteria checked with proof
- Vital signs aggregation runs in single SQL query (verified via Supabase logs — no N+1)
- Bridge component lives at `/app/page.tsx` with auth-conditional render
- Venture Bridge lives at `/app/ventures/[slug]/page.tsx`
- Old `/portfolio` route either deleted or 308 redirects to `/`
- HANDOFF.md committed
- Tested with synthetic data: 1 venture, 6 ventures, 12 ventures (verify grid responsiveness)
- Tested as a member with 2 assigned ventures, verifies they only see those two

## Quality rubric (SoloDesk specific)

| Criterion | What to check |
|-----------|--------------|
| Single-query aggregation | Vital signs come from one SQL query, not per-venture roundtrips. Verify in Supabase logs |
| Membership scoping | Member with 2 assigned ventures sees exactly 2 tiles, no leakage |
| Bright line: venture isolation | Each tile's data tagged with venture_id. No render path constructs a tile from data without venture_id check |
| Component reuse | Tiles use Sprint 7 components (VentureMark, Sparkline, ConnectionChip, StateDot). No reimplementation |
| Loading state | Skeleton state visible during data fetch — no blank flash |
| Empty state | User with no assigned ventures sees a helpful empty state, not crash |
| TypeScript | No `any`. State derivation logic is typed |
| Accessibility | Tiles are keyboard reachable; aria-labels meaningful |

**Score threshold:** Must pass 7/8. Single-query aggregation and membership scoping are non-negotiable.

## Out of scope

- Real-time updates to tile state (Sprint 9 adds via Watch realtime subscription)
- Per-tile drill-down preview on hover
- Customizable tile order or pinning
- Dashboard widgets beyond the venture tiles
- The Day toggle functionality (placeholder button only, Sprint 9 wires it up)
- The Watch content (placeholder column only, Sprint 9 wires it up)

## Adversarial check questions

- What if a venture has no documents and no events? Tile shows "No activity" with a quiet StateDot
- What if a venture has 100+ documents? Pending count caps display at "99+" if needed
- What does the Bridge look like with 1 venture? With 12? Grid responsive, no awkward gaps
- What if vital signs aggregation fails (Supabase down)? Tiles show error state, not blank
- What if a member's membership is revoked mid-session? Next page load shows updated set
- Does the time-of-day state change without page refresh? Yes — interval check on the minute
- Does the function grid in Venture Bridge render for a venture with no decisions, no metrics, etc? Each tile shows quiet state
- Does the back-link from Venture Bridge return to Bridge correctly?

## Files affected

New files:
- `app/page.tsx` (replace or add Bridge as authed-user home)
- `lib/venture/state-derivation.ts` (vital signs aggregation logic)
- `lib/venture/aggregation.sql` (or as Supabase RPC)
- `components/bridge/Bridge.tsx`
- `components/bridge/VentureTile.tsx`
- `components/bridge/TimeOfDayProvider.tsx`
- `components/venture/VentureBridge.tsx`
- `components/venture/FunctionTile.tsx`

Modified files:
- `app/ventures/[slug]/page.tsx` (replace current dashboard with Venture Bridge)
- `app/portfolio/page.tsx` (delete or redirect)
- `lib/auth/guard.ts` (any auth changes)

## Dependencies on prior work

- Sprint 7 components shipped
- ventures, documents, events, connections, sections tables exist (current substrate)
- Membership lib working (Sprint 7 phase 1 of Nov 1 gate)

## Bright-line tension to resolve in this sprint

Time-of-day chrome states introduce subtle color tonality on the frame. CLAUDE.md design system currently bans gradients and warm cream tones. The morning/evening tints are not gradients (single solid border-color per state) and stay within the cooler-cream and cool-blue range. Confirm with `experience-layer-doc-updates.md` for the exact CLAUDE.md edit before building.
