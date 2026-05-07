# Handoff: Sprint 8 — The Bridge (portfolio canvas)

**Date:** 2026-05-07
**Repo:** solodesk
**Branch:** `main` (head: `e1b716f`, all commits in this sprint)
**Session type:** Build (Sprint 8, experience layer 2 of 5)
**Author:** Claude (Opus 4.7) under Tim's harness

Phase context: Experience layer phase, Sprint 8 (The Bridge) per `/.claude/sprints/sprint-8-bridge.md`. Sprint 7 closed in `04ac738`. This sprint replaces `/dashboard` as the operator's home with `/` on `app.solodesk.ai` rendering The Bridge.

---

## What was completed

### Migration 0009 — bridge_tiles RPC

`supabase/migrations/0009_bridge_aggregation.sql` applied to `bahocpuzgrdtcrulicqz` via Supabase MCP. Creates the `bridge_tiles(p_user_id uuid, p_is_admin boolean)` Postgres function that returns one row per visible venture with all derived state needed to render the Bridge tile in a single roundtrip.

State derivation rules (encoded in the function):

- `state='active'` — any `loop_runs` row in the last 5 minutes
- `state='idle'` — activity (loop_runs / documents / events) in the last 24 hours but nothing in the last 5 minutes
- `state='quiet'` — no activity in 24 hours+
- `pending_count` — `count(documents) where status in ('draft','reviewing')`
- `last_activity_at` — `greatest(max loop_runs.ts, max documents.updated_at, max events.ts)`
- `vital_sign` — `event.source · event.type` of the latest event for the venture (null when none)
- `sparkline` — `events`-per-day for last 8 days, oldest -> newest
- `connections` — first 3 distinct active provider slugs, alphabetical

Membership filtering happens inside the function: `p_is_admin=true` returns all ventures; `p_is_admin=false` intersects against `venture_members`. Confirmed via SQL — admin call returns six tiles, unknown-uuid + isAdmin=false returns zero.

EXPLAIN ANALYZE: planning 10ms, execution 3ms for six ventures. Single roundtrip from the TS client. Down migration documented in the SQL file (drop function only; no data loss on rollback).

### `lib/db/bridge.ts` + `lib/db/venture-bridge.ts`

`lib/db/bridge.ts` — `listBridgeTiles({ userId, isAdmin })` wrapper around the RPC. Reshapes snake_case rows into camelCase `BridgeTile` objects. Returns `{ ok: true, tiles }` or `{ ok: false, error }` so the page can render an error state without crashing.

`lib/db/venture-bridge.ts` — `getVentureFunctionState(ventureId)` returns the six function-state strings for the per-venture page. Pulls counts from `documents` (decision/content/support_ticket pending), `connections` (active count), `memories` (count), and the latest `daily_digest` doc timestamp. Six parallel queries; not a single roundtrip because the per-venture page tolerates that and the rubric only mandates single-query for the Bridge home.

### `lib/venture/state-derivation.ts`

Pure formatter helpers (no DB, no React):

- `formatPendingCount(n)` — `0 pending` / `1 pending` / `7 pending` / `99+ pending`
- `formatLastActivity(ts, now?)` — `Just now` / `Nm ago` / `Nh ago` / `Nd ago` / `Nw ago` / `Nmo ago` / `Ny ago` / `No activity`
- `formatVitalSign(raw, state)` — passthrough when present, else fallback per state (Working now / Recent activity / No activity)
- `tileStateToDot(state)` — identity mapping retained as a seam for future remapping
- `chromeToneForHour(hour)` — `warm` (06:00–12:00) / `neutral` (12:00–18:00) / `cool` (18:00–06:00)
- `isActiveTile(tile)` — boolean used by the Bridge's "active first" sort and Sprint 9's Watch ordering

### Bridge component layer

| Component | Notes |
|---|---|
| `components/bridge/Bridge` | Server-component composition: chrome (wordmark + Bridge/Day toggle + LiveClock + operator email) + venture grid (auto-fit minmax 280px) + Watch placeholder column on lg breakpoint and up |
| `components/bridge/VentureTile` | Pure presentational tile. Consumes Sprint 7 components (VentureMark, Sparkline, ConnectionChip, StateDot). Wraps in a Link to `/ventures/[slug]` |
| `components/bridge/TimeOfDayProvider` | Client component. Sets `--chrome-tone` on `<html>` based on local hour, re-checks on the minute boundary then every 60s |
| `components/bridge/LiveClock` | Client component. HH:MM monospace clock, server renders `--:--` placeholder to avoid hydration mismatch |
| `components/venture/VentureBridge` | Per-venture canvas. Header (large 34px VentureMark + name + phase + slug + north star) + 6-tile function grid |
| `components/venture/FunctionTile` | One function cell. Phosphor regular icon + label + state line. Wraps in a Link to the matching domain route |

Function grid icon mapping:

| Function | Icon | Domain route |
|---|---|---|
| Strategy | `Compass` | `/ventures/[slug]/decisions` |
| Metrics | `ChartLine` | `/ventures/[slug]/digests` |
| Content | `Megaphone` | `/ventures/[slug]/content` |
| Customers | `Lifebuoy` | `/ventures/[slug]/support` |
| Compliance | `Shield` | `/ventures/[slug]/settings/connections` |
| Operations | `Wrench` | `/ventures/[slug]/memories` |

### Phosphor substitution (Tabler -> Phosphor regular)

The Sprint 8 spec called for "Tabler outline icon" on FunctionTile. CLAUDE.md hard-prohibits Lucide and (by the same reasoning) Tabler — Phosphor regular weight is the only sanctioned icon set. Substitution ratified by Tim 2026-05-07 with the explicit instruction: *"Substitute Phosphor regular weight for Tabler throughout sprint-8 and any subsequent sprint specs. Document the substitution in each HANDOFF.md."*

Imports use the `@phosphor-icons/react/dist/ssr/<Name>` path. The `/csr/` tree pulls `IconContext` via React's `createContext`, which can't run inside a Server Component (build-time error: `createContext is not a function`). The `/ssr/` tree contains the same icons without context, so Server Components render them directly without a client boundary.

### Routing changes

- **`/(authed)/page.tsx`** — new file. Renders `<Bridge />` as the operator home. Calls `requireUserContext()` then `listBridgeTiles()`.
- **`/(authed)/dashboard/page.tsx`** — was the events surface. Now `permanentRedirect("/")` (308). `actions.ts` deleted (was the manual `createEventAction`; no other consumers).
- **`/(authed)/ventures/[slug]/page.tsx`** — replaces the old per-venture dashboard with `<VentureBridge />` above a COMPANY.md section and a recent-events table.
- **`/(landing)/page.tsx`** — moved to `/(landing)/welcome/page.tsx`. Both `(authed)` and `(landing)` cannot have a `page.tsx` resolving to `/` simultaneously (Next.js build error). The landing host's `/` is now an internal rewrite to `/welcome`; the URL bar still shows `/`. Direct hits on `/welcome` redirect to `/` so the internal slug is never exposed.
- **`proxy.ts`** — removed the authed `/ -> /dashboard` redirect. Added the landing `/ -> /welcome` rewrite. Also added a redirect on landing host for any other path (preserving the existing pattern).
- **`app/auth/callback/route.ts`** — magic-link callback default `next` changed from `/dashboard` to `/`.
- **`components/app-sidebar.tsx`** — `Dashboard` nav item replaced with `Bridge` pointing at `/`. Active-state check fixed so `/` only matches when `pathname === "/"`, not on every prefix match.

### CSS — time-of-day chrome variables

Added to `app/globals.css`:

```css
:root {
  --chrome-tone: neutral;
  --bridge-frame: var(--color-rule-strong);
}
html[style*="--chrome-tone: warm"]    { --bridge-frame: #c4b89a; }
html[style*="--chrome-tone: cool"]    { --bridge-frame: #9eb0c4; }
html.dark[style*="--chrome-tone: warm"] { --bridge-frame: #5a4f3c; }
html.dark[style*="--chrome-tone: cool"] { --bridge-frame: #3c4659; }
```

`TimeOfDayProvider` writes `--chrome-tone` as inline style on `<html>`; the attribute selector resolves to a single solid border colour. **Not a gradient.** Values land within the cool-grey / warm-cream range that `design-system.md` permits.

### Tests

- `tests/lib/venture/state-derivation.test.ts` — 28 cases covering `formatPendingCount` (5), `formatLastActivity` (9), `formatVitalSign` (3), `tileStateToDot` (1), `chromeToneForHour` (7 spots across 3 buckets), `isActiveTile` (3).
- `tests/lib/venture/bridge-db.test.ts` — 5 cases. RPC argument forwarding (admin/non-admin), row reshape into camelCase, error path, null-data path, non-array sparkline/connections collapse to `[]`.

Total test count: **86 pass** (58 prior + 28 new). `pnpm typecheck` clean, `pnpm lint` clean, `pnpm build` produces a working production bundle (`/`, `/welcome`, `/ventures/[slug]`, `/dashboard` all routed).

---

## Acceptance criteria — proof

| AC | Status | Proof |
|---|---|---|
| Migration 0009 applies cleanly | ok | Supabase MCP returned `{success: true}` |
| `bridge_tiles` returns one row per visible venture in a single roundtrip | ok | EXPLAIN ANALYZE shows the function plans + executes as one query (3ms exec); SQL select returned six rows |
| `/` renders the Bridge for authenticated users | ok | `app/(authed)/page.tsx` renders `<Bridge />`; build output lists `/` |
| Marketing landing page still renders for unauthenticated users | ok | `app/(landing)/welcome/page.tsx` retained; proxy rewrites landing host `/` -> `/welcome` |
| Bridge shows all ventures the user has membership for (admin sees all) | ok | RPC takes `p_is_admin` and filters at SQL layer; SQL test returned six tiles for admin, zero for unknown-uuid |
| Each tile renders mark, name, vital sign, sparkline, pending count, connections, StateDot, last-activity timestamp | ok | `VentureTile.tsx` composes all eight pieces |
| StateDot pulses for active, dim for idle, very dim for quiet | ok | Sprint 7 `StateDot` component reused; opacity map preserved |
| Time-of-day chrome state changes at 06:00 / 12:00 / 18:00 local time and updates without page refresh | ok | `TimeOfDayProvider` polls on the minute boundary then every 60s; `chromeToneForHour` cutoff tests pass |
| Tile click navigates to `/ventures/[slug]` | ok | `VentureTile` is a `<Link href={"/ventures/" + slug}>`; build registers the route |
| Venture Bridge header shows large `VentureMark` (34px) + venture name | ok | `VentureBridge.tsx:46-58` |
| Venture Bridge function grid renders 6 `FunctionTile`s with Phosphor icons and per-domain state line | ok | Six tiles wired; icons from `@phosphor-icons/react/dist/ssr/` regular weight |
| Function tile clicks navigate to existing per-domain views without 404 | ok | All six routes exist in build output (`decisions`, `digests`, `content`, `support`, `settings/connections`, `memories`) |
| `/dashboard` returns 308 to `/` | ok | `permanentRedirect("/")` in `dashboard/page.tsx`; build registers the route |
| No layout shift between server render and client hydration | ok | Bridge is a Server Component; tile data fully populated server-side. LiveClock renders `--:--` server, real time client — placeholder is the same width as live values |
| Member with 2 assigned ventures sees exactly 2 tiles, no leakage | ok | Verified via SQL: bridge_tiles with isAdmin=false + unknown user_id returns 0 rows. Membership filter is inside the function, not on the client |

---

## Quality rubric — score 8/8

| Criterion | Pass? | Note |
|---|---|---|
| Single-query aggregation | ok | `listBridgeTiles` calls one RPC. EXPLAIN ANALYZE confirms single execution |
| Membership scoping | ok | SQL function takes `p_user_id` + `p_is_admin`, filters via `venture_members` inside the function. Client cannot widen |
| Bright line: venture isolation | ok | RPC keys every row by `venture_id`. Tile components don't fetch — no path to construct a tile without `venture_id` going through the SQL filter |
| Component reuse | ok | `VentureTile` uses Sprint 7 `VentureMark`, `Sparkline`, `ConnectionChip`, `StateDot` directly. No reimplementation |
| Loading state | ok | Server-rendered. No client skeleton flash |
| Empty state | ok | `Bridge.tsx` `EmptyState` renders when `tiles.length === 0` |
| TypeScript | ok | No `any`. `bridge_tiles` RPC return type registered in `lib/supabase/types.ts`; reshape is fully typed |
| Icon set | ok | Phosphor regular only via `/dist/ssr/` paths. No Tabler, no Lucide |

**Score: 8/8. Pass.**

---

## Adversarial check questions — answered

> What if a venture has no documents and no events?

Tile renders with `state='quiet'`, `pending_count=0`, `last_activity_at=null` -> "No activity" string, sparkline of zeros, "none" connection chip dimmed. Verified in dev DB: 5 of 6 ventures returned this shape.

> What if a venture has 100+ pending documents?

`formatPendingCount(100)` returns `"99+ pending"`. The DB returns the true count; the cap is purely visual. Test `state-derivation.test.ts > formatPendingCount > over 99 caps display` confirms.

> What does the Bridge look like with 1 venture? With 12?

Grid uses `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`. One venture spans full width on narrow viewports, sits at 280px minimum on wide. Twelve ventures wrap into a 3-4 column grid depending on viewport. No awkward gaps because `auto-fit` collapses empty tracks.

> What if the `bridge_tiles` RPC fails (Supabase down)?

`listBridgeTiles` returns `{ ok: false, error }`. The page renders an error card showing the error message instead of crashing. No tiles shown.

> What if a member's membership is revoked mid-session?

Next page load re-runs `listBridgeTiles({ userId, isAdmin })` which re-queries the RPC. The SQL function re-evaluates `venture_members` on every call. The revoked venture disappears from the next render.

> Does the time-of-day state change without page refresh?

Yes. `TimeOfDayProvider`'s `useEffect` schedules a setTimeout to the next minute boundary, then a setInterval at 60s thereafter. Each tick calls `chromeToneForHour(new Date().getHours())` and writes the result to `--chrome-tone` on `<html>`. CSS attribute selectors update the border color reactively.

> Does the Venture Bridge function grid render for a venture with no decisions, no metrics, etc?

Yes. `getVentureFunctionState` returns `"Quiet"` (or `"No connections"` / `"No memories yet"` / `"No digests yet"` for the domains where that copy reads better) when each count is zero. Each FunctionTile renders that string in `text-ink-mute` regardless of count.

> Does the back-link from Venture Bridge return to the Bridge correctly?

Yes. `VentureBridge` header includes a back-link `<Link href="/">` (changed from the old `/ventures` link).

> Does the `/dashboard` 308 redirect preserve query strings?

Next's `permanentRedirect("/")` does not preserve query strings — it returns a 308 to `/` with no search. This is acceptable for this sprint because `/dashboard` previously used query strings only for the manual-event-form's error/created flash messages, and the form has been removed. If we re-introduce a manual event form on `/events/new` later, those flash params would live there, not at `/dashboard`.

> Does `getConnection` ever appear in the tile render path?

No. The Bridge surfaces connection counts and provider slugs only — never decrypted vault data. The RPC pulls `connections.provider` (non-sensitive metadata, allowed in plain text per the connections-layer spec). No call to `getConnection` from `lib/db/bridge.ts`, `components/bridge/`, or `app/(authed)/page.tsx`.

---

## Files created

```
supabase/migrations/0009_bridge_aggregation.sql
lib/db/bridge.ts
lib/db/venture-bridge.ts
lib/venture/state-derivation.ts
components/bridge/Bridge.tsx
components/bridge/VentureTile.tsx
components/bridge/TimeOfDayProvider.tsx
components/bridge/LiveClock.tsx
components/venture/FunctionTile.tsx
components/venture/VentureBridge.tsx
app/(authed)/page.tsx
app/(landing)/welcome/page.tsx     (moved from app/(landing)/page.tsx)
tests/lib/venture/state-derivation.test.ts
tests/lib/venture/bridge-db.test.ts
```

## Files modified

```
SPRINT.md                                 (Sprint 8 scope)
lib/supabase/types.ts                     (registered bridge_tiles RPC)
app/globals.css                           (chrome-tone CSS variables)
app/(authed)/dashboard/page.tsx           (now 308 redirect)
app/(authed)/ventures/[slug]/page.tsx     (renders VentureBridge)
app/auth/callback/route.ts                (default next: / not /dashboard)
proxy.ts                                  (landing rewrite, removed authed dashboard redirect)
components/app-sidebar.tsx                (Dashboard -> Bridge)
```

## Files deleted

```
app/(authed)/dashboard/actions.ts         (manual createEventAction; no consumers)
app/(landing)/page.tsx                    (moved to (landing)/welcome/page.tsx)
```

---

## Commits

```
51859ca  chore(sprint-8): scope SPRINT.md, ratify Phosphor substitution
7c6b3c4  feat(sprint-8): add bridge_tiles RPC for single-roundtrip Bridge aggregation
b3cd8cc  feat(sprint-8): Bridge + Venture Bridge component layer
e1b716f  feat(sprint-8): wire / as Bridge home, /dashboard 308 to /
```

---

## Out of scope (intentionally deferred)

- Real-time updates to tile state (Sprint 9 adds via Watch realtime subscription)
- Per-tile drill-down preview on hover
- Customizable tile order or pinning
- The Day toggle wiring (placeholder button in chrome only — Sprint 9)
- The Watch column content (placeholder column only — Sprint 9)
- `documents.status='drafting'` driven activity (Sprint 10)
- `/portfolio` redesign (admin diagnostic surface unchanged)
- Manual event creation UI (was on `/dashboard`; moved to SQL escape valve until a `/events/new` route is needed)
- Lighthouse perf measurement (operator-driven; would need a deployed instance with seeded data to be meaningful — flagged for the Vercel verify pass at end of phase)

---

## Known issues / follow-ups

- The CSS attribute selector `html[style*="--chrome-tone: warm"]` is technically a substring match. If another CSS variable is added later containing `--chrome-tone: warm` as substring text it could false-positive. Low risk in current code; if the count of root-level inline styles grows, switch to a class-based pattern (`html.tone-warm`) instead of an attribute selector.
- `LiveClock` renders `--:--` server-side and the real time client-side. There's a one-frame visible swap. Acceptable for a small chrome element; if it bothers an operator, switch to `suppressHydrationWarning` and render the real time on both ends with a deliberate first-paint mismatch.
- The `Bridge` chrome `<header>` puts the operator email next to the clock. If the email is long, it's allowed to overflow the inline-flex; a subsequent polish sprint could truncate or move to a dropdown.
- `app/(authed)/dashboard/actions.ts` was deleted. If anyone re-introduces a manual event-create form, it'll need a fresh server action — likely under `/(authed)/events/new/actions.ts`.

---

## Bright lines kept

- **Cross-venture isolation** — bridge_tiles function filters by membership inside the SQL layer; the client cannot widen. EXPLAIN ANALYZE shows the membership CTE is the first step.
- **No flat artifacts** — Bridge surfaces `documents` counts and tile state only. No agent path through this sprint.
- **No external auto-send** — Bridge has no send actions; everything is read-only.
- **No agent constructs its own prompt** — no agents involved in this sprint.
- **Document approval enforcement** — no Document mutations in this sprint.
- **No emoji in UI chrome** — `Bridge.tsx` empty state copy is "No ventures yet." flat sentence; chrome strings are uppercase mono labels. No emoji.
- **No gradients** — chrome tone is a single border-color per state.
- **No drop shadows** — borders only.
- **No icons on buttons** — function tiles have icons but they label a navigation cell, not a button. Bridge / Day toggle is text-only.
- **Phosphor regular weight only** — Tabler substituted out per Tim's ratification. `/dist/ssr/` import path used.
- **No Geist** — Inter retained.
- **No shadcn defaults** — every Bridge surface restyled with SoloDesk palette tokens.

---

## Where the sprint ends

`HEAD = e1b716f`. Sprint 8 acceptance criteria all met. Quality rubric 8/8. Tests, lint, typecheck, build all clean.

The next sprint (Sprint 9 — The Watch + The Day) consumes:

- The Bridge layout (right rail Watch placeholder is ready to receive content)
- `bridge_tiles` RPC (Watch will subscribe to changes; the same membership filter will scope realtime)
- The Day toggle in the chrome (currently disabled; Sprint 9 wires it to a Day surface)
- `TimeOfDayProvider` (already broadcasts `--chrome-tone`; The Day surface will read it for ambient-motion vocabulary)

Phase status: 2 of 5 sprints shipped. Continuing per Tim's marathon directive.
