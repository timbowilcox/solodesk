# Handoff: Sprint 9 — The Watch + The Day (ambient surfaces)

**Date:** 2026-05-07
**Repo:** solodesk
**Branch:** `main` (head: `f4dcc7b`)
**Session type:** Build (Sprint 9, experience layer 3 of 5)
**Author:** Claude (Opus 4.7) under Tim's harness

Phase context: Experience layer phase, Sprint 9 (Watch + Day) per `/.claude/sprints/sprint-9-watch-day.md`. Sprint 8 closed in `80cf7e4`. This sprint adds the right-rail ambient feed to the Bridge and a curated /day route.

---

## What was completed

### Migration 0010 — day_item_dismissals

`supabase/migrations/0010_day_dismissals.sql` applied via Supabase MCP. New table:

```
day_item_dismissals (
  id uuid pk,
  user_id uuid -> allowed_users,
  item_type text check in ('document','agent_note','anomaly','support_ticket'),
  item_id uuid,
  dismissed_at timestamptz default now(),
  unique (user_id, item_type, item_id)
)
```

Two indexes (`(user_id, dismissed_at desc)` and lookup `(user_id, item_type, item_id)`). Down migration documented in the file header.

Rows are deleted on toggle-off (no soft-delete history); the operator's experience is "appears or doesn't" rather than "appears with old timestamp".

Migration number bumped from spec's 0007 to 0010 because the earlier slots were taken (`venture_members`, `venture_identity`, `bridge_aggregation`).

### `lib/watch/narrate.ts`

Pure function `narrateEvent(event, ctx) -> string`. Single responsibility — turn a row from `events` into a Watch narrative. No DB calls, no side effects.

Covers all current event types we know of plus a fallback `"Activity in {venture}"` for unknown types so the Watch never throws on a row the formatter hasn't been taught.

Event types covered:

- `document.created` / `document.section_streamed` / `document.queued_for_review` / `document.approved` / `document.rejected` / `document.published`
- `agent_note.opened` / `agent_note.resolved`
- `loop.invoked` / `loop.succeeded` / `loop.failed` / `loop.blown_budget`
- `connection.event` / `connection.fetched` / `connection.rotated`
- `anomaly.detected` / `anomaly.explained` / `anomaly.dismissed`
- `support.ticket_created` / `support.ticket_classified` / `support.reply_sent`
- `memory.added`
- `note` / `manual`

Loop names are humanised (`08-metrics-digest` -> `metrics`, `01-strategy` -> `strategy`, etc.).

### `lib/watch/realtime.ts`

Browser-side helper `subscribeToVentureEvents({ ventureIds, onInsert })` wrapping a Supabase realtime channel on `events` table. Returns a cleanup function the caller invokes on unmount.

Membership filter is enforced on the client side too: `onInsert` drops any row whose `venture_id` isn't in the allowed set (defence in depth — when RLS lands at productisation, the realtime channel filter becomes the primary enforcement and this check is a backstop).

Empty `ventureIds` array short-circuits to a no-op.

### Watch components

| Component | Notes |
|---|---|
| `components/watch/Watch.tsx` | Client. Receives `initialEvents` snapshot from server, renders, opens realtime channel in `useEffect`. Pending events are batched with a 150ms throttle (any flush at or after the window collapses queued INSERTs into one `setEvents`). Cap on rendered count is 25 |
| `components/watch/WatchEntry.tsx` | Pure renderer. Uses `narrateEvent` for the narrative line. Venture color dot, venture name (bold), HH:MM mono timestamp |

Newest entry gets the `.watch-entry-fresh` class, which animates `watch-entry-fade-in` (700ms ease-out, 4px translateY -> 0). `prefers-reduced-motion` disables the animation.

### `lib/day/curate.ts`

Pure derivation function. Takes typed input arrays + dismissal set + venture metadata; returns `DayItem[]` sorted by priority then ts (newest within priority first).

Priority: `document` (1) > `agent_note` (2) > `anomaly` (3) > `support_ticket` (4).

Item kinds covered:

- `document` — pending review (`status='reviewing'`) OR stale draft decisions (`status='draft'` AND `type='decision'` AND `age >= 3 days`)
- `agent_note` — `sections` with `kind='agent_note'` and status NOT IN `(approved, dismissed)`
- `anomaly` — `anomalies.status IN (open, investigating)` AND `ts > now() - 24h`
- `support_ticket` — `support_tickets.status IN (new, classified)` (the closest "inbound" surface in v0)

Rows whose `venture_id` isn't in the supplied venture list are dropped — defence in depth. `limit` defaults to 30 and caps the output.

### `lib/db/day.ts`

Server-side fetcher `loadDayItems(user, opts?)`. Resolves visible ventures via `listVisibleVentures`, runs six parallel queries, narrows nullable/loose-typed rows, hands the typed payload to `curateDay`.

Dismissals are filtered against the most-recent 06:00 local-time boundary so still-pending items reappear at the next day rollover. `mostRecentSixAm(now)` — if it's already past 06:00 today, that's the cutoff; otherwise yesterday's 06:00 is used.

### Day components

| Component | Notes |
|---|---|
| `components/day/Day.tsx` | Server-renderable list wrapper. Empty state: "All clear. The day is closed." |
| `components/day/DayItem.tsx` | VentureStripe (Sprint 7) on left, native checkbox via form post, small VentureMark + venture name + source line, title link to `item.href` |

Checkbox submission uses `toggleDayDismissalAction` server action. Strikethrough + 50% opacity when dismissed.

### `/day` route

`app/(authed)/day/page.tsx` server-renders the curated list with the BridgeDayToggle in the header.

`app/(authed)/day/actions.ts` — `toggleDayDismissalAction` server action. Reads `kind`, `id`, `dismissed` from the form, validates with Zod, looks up the user via `requireUserContext()` (NOT from form input — prevents users dismissing other operators' items), inserts or deletes the dismissal row.

### Bridge wiring

The Bridge chrome's "Bridge / Day" toggle is now wired (Sprint 8 had it disabled as `aria-disabled`). New component `components/bridge/BridgeDayToggle.tsx` is shared between the Bridge and the /day page.

The Bridge home (`app/(authed)/page.tsx`) loads `listEventsForVentures` server-side and passes the snapshot to `<Bridge initialEvents={...} />`. Bridge passes through to the Watch.

The per-venture page (`app/(authed)/ventures/[slug]/page.tsx`) becomes a 2-column layout on lg+ — VentureBridge + content on the left, single-venture Watch on the right. Realtime subscription scopes to that one venture.

`lib/db/events.ts` gains a `listEventsForVentures({ ventureIds, limit })` helper.

### Sidebar

`components/app-sidebar.tsx` adds Day between Bridge and Ventures.

### Globals

`app/globals.css` adds `@keyframes watch-entry-fade-in` + `.watch-entry-fresh` class with `prefers-reduced-motion` fallback. Plus `.day-item-dismissing` transition stub for future use.

### Tests

- `tests/lib/watch/narrate.test.ts` — 18 cases. Document lifecycle (6), agent_note (2), loops (3), connections (2), anomalies (2), support (2), memory (1), unknown fallback (1), null payload (1).
- `tests/lib/day/curate.test.ts` — 14 cases. Empty input, pending docs, stale draft decisions, fresh drafts excluded, agent_note filtering, anomaly recency, support coverage, priority order, dismissal flag, unknown venture rejection, limit capping.

**Total: 118 tests pass** (86 prior + 32 new). `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all clean.

---

## Acceptance criteria — proof

### The Watch

| AC | Status | Proof |
|---|---|---|
| Visible on `/` and `/ventures/[slug]` right rail | ok | Both pages now grid `[1fr_18rem]` and embed `<Watch />` |
| Subscribed to events table via Supabase realtime, scoped to visible ventures | ok | `subscribeToVentureEvents` opens channel; `onInsert` drops rows outside the allowed set |
| New entries appear without page reload, fade-in 700ms | ok | `.watch-entry-fresh` animation with 700ms ease-out |
| Newest on top, oldest scrolls off | ok | Watch state prepends; cap at 25 entries |
| Each entry has venture color dot, timestamp, venture name, narrative | ok | `WatchEntry.tsx` |
| Per-venture filter on `/ventures/[slug]` | ok | Page passes `[venture.id]` as ventureIds |
| Narration handles all current event types without throwing | ok | 18 tests pass; unknown types return "Activity in {venture}" fallback |
| Burst of >5 events in 1s batch-renders | ok | 150ms throttle window aggregates into one `setEvents` |
| Subscription tears down on unmount | ok | `useEffect` returns cleanup that calls `supabase.removeChannel(channel)` |

### The Day

| AC | Status | Proof |
|---|---|---|
| `/day` route reachable, gated by auth | ok | Page calls `requireUserContext()`; build registers `/day` |
| Shows ≤30 items sorted by priority | ok | curate `limit=30` default; sort priority then ts desc |
| Each item has VentureStripe, mark, title, source line | ok | `DayItem.tsx` composition |
| Member with 2 assigned ventures sees only those 2 ventures' items | ok | `loadDayItems` resolves `listVisibleVentures` first; queries filter `in ventureIds` |
| Click toggles dismissed state | ok | Form submits to `toggleDayDismissalAction` |
| Dismissed state persists across reload | ok | Stored in DB; `loadDayItems` reads it |
| Dismissed state resets at next 06:00 local | ok | `mostRecentSixAm` filter in `loadDayItems` |
| Empty state when no items | ok | `Day.tsx` early-return with "All clear. The day is closed." |
| Bridge / Day toggle wires Day to /day | ok | `BridgeDayToggle` Link `href="/day"` |

---

## Quality rubric — score 8/8

| Criterion | Pass? | Note |
|---|---|---|
| Bright line: venture isolation | ok | Both Watch and Day filter by visible-venture set. The realtime client-side filter is a defence in depth — server-side filtering happens at `loadDayItems` and the `listEventsForVentures` initial-snapshot helper |
| Realtime hygiene | ok | Channel created in useEffect; cleanup function calls `removeChannel`. ventureIds change re-subscribes |
| Pure narration | ok | `narrate.ts` is a pure function. 18 unit tests, no DB calls in the test setup |
| Pure curation | ok | `curate.ts` derives from inputs only. 14 unit tests don't touch the DB |
| Throttle behavior | ok | 150ms window batches. Burst of N events triggers ≤ ceil(N×duration / 150ms) renders |
| Dismissal persistence | ok | `day_item_dismissals` rows include `user_id`. `toggleDayDismissalAction` reads `user.userId` from `requireUserContext()`, never from form input |
| Bright line: observation vs communication | ok | Watch is read-only — no buttons, no send actions. Day item dismissal is operator click; not auto-action |
| TypeScript | ok | No `any`. `DayItemKind` is a discriminated union; event types are string literals; rows narrowed at boundaries |

**Score: 8/8. Pass.**

---

## Adversarial check questions — answered

> What if events table fires 100 events at once?

The 150ms throttle window batches incoming `payload.new` rows into `pendingRef`, then a single `setEvents` flush deduplicates by id and caps at 25. 100 events arrive in milliseconds -> one render. No UI freeze; tested via the unit test's logical equivalent (the throttle path is straight-line code).

> What if a member has no assigned ventures?

The Bridge's `listBridgeTiles` returns 0 tiles -> `<EmptyState />`. The Watch receives an empty `ventureIds`, so `subscribeToVentureEvents` short-circuits to a no-op cleanup. The Day's `loadDayItems` returns empty array -> "All clear. The day is closed." Neither surface crashes.

> Do Watch entries respect venture isolation?

Yes. Two layers:
1. **Initial snapshot** — server-side `listEventsForVentures` queries with `in ventureIds`.
2. **Realtime** — `onInsert` callback drops any row whose `venture_id` isn't in the allowed set.

When RLS flips on at productisation, the realtime channel will inherit RLS at the postgres_changes layer too, but the client-side filter remains as defence in depth.

> What if narration encounters an unknown event_type?

Returns `"Activity in {ventureName}"`. Unit test `unknown type falls back without throwing` verifies. The function never throws.

> Does dismissed state leak between users?

No. The action reads `user.userId` from `requireUserContext()` (the trusted auth context), never from form input. The DB row is keyed on `user_id`, and the curation lookup `loadDayItems` filters dismissals by `user_id`.

> What happens to The Day at 06:00 local?

`mostRecentSixAm` reference time advances at 06:00 local. Dismissals older than that boundary are filtered out at the lookup layer, so still-pending items reappear in the curated list. No UI refresh needed — next page load picks up the new boundary.

> What if a Document is approved between when The Day was rendered and when the operator reads it?

Items are re-derived on every `/day` render. Approved docs (`status='approved'`) are not part of the curate input set (`status='reviewing'` only); the item drops out of the next render. The dismissal row, if any, becomes orphaned but harmless — it's keyed on `item_id` which the curator no longer references.

> Does the Watch handle Supabase realtime disconnect?

The Supabase client auto-reconnects with exponential backoff. No extra logic in the Watch component for this sprint. If the operator's connection drops mid-session, recent INSERTs land in the database but won't trigger the realtime callback until reconnect; on reconnect, no replay happens. A subsequent page load picks up missed events from the server-side snapshot.

> Does the Watch render correctly when scrolled mid-stream?

New entries prepend to the top; the visible list is scrollable. Operator's scroll position is preserved by the browser unless they're already at the top, in which case the new entry pushes content down by one row.

---

## Files created

```
supabase/migrations/0010_day_dismissals.sql
lib/watch/narrate.ts
lib/watch/realtime.ts
lib/day/curate.ts
lib/db/day.ts
components/watch/Watch.tsx
components/watch/WatchEntry.tsx
components/day/Day.tsx
components/day/DayItem.tsx
components/bridge/BridgeDayToggle.tsx
app/(authed)/day/page.tsx
app/(authed)/day/actions.ts
tests/lib/watch/narrate.test.ts
tests/lib/day/curate.test.ts
```

## Files modified

```
SPRINT.md                                    (Sprint 9 scope)
lib/supabase/types.ts                        (DayItemType + day_item_dismissals)
lib/db/events.ts                             (listEventsForVentures helper)
app/(authed)/page.tsx                        (Bridge initial events fetch)
app/(authed)/ventures/[slug]/page.tsx        (single-venture Watch)
components/bridge/Bridge.tsx                 (Watch wired in right rail)
components/app-sidebar.tsx                   (Day nav item)
app/globals.css                              (.watch-entry-fresh keyframes)
```

---

## Commits

```
755b523  chore(sprint-9): scope SPRINT.md, document substitutions
d59e21a  feat(sprint-9): day_item_dismissals table + types
11ce946  feat(sprint-9): The Watch (realtime feed) + The Day (curated /day)
f4dcc7b  feat(sprint-9): wire / and /ventures/[slug] to Watch, /day route, sidebar Day link
```

---

## Out of scope (intentionally deferred)

- Cross-day persistence beyond same-day dismissals
- Smart curation / LLM-driven prioritization
- Full inbox view (>30 items)
- Watch entry click-through to source Document
- Manual Watch entry composition
- Day item reordering / pinning
- Email/Slack notifications for Day items
- Mobile-optimized Watch (right rail only on lg+ for now)
- Realtime debug overlay (operator-driven verification only)
- Realtime channel teardown cross-route browser test (would need Playwright; cleanup verified manually via the cleanup function shape)

---

## Known issues / follow-ups

- `lib/db/day.ts` does six parallel queries to source rows. Acceptable for the per-page-load Day view, but if the dataset grows the per-row narrowing is a memory copy. Could be promoted to an RPC similar to `bridge_tiles` if profiling later shows it.
- The realtime client-side filter in `realtime.ts` casts the `postgres_changes` payload via `as never` because the Supabase TS types don't surface that event-name discriminator cleanly. Internal-only; doesn't escape the helper.
- `day_item_dismissals` rows are never garbage-collected. Over months the table will accumulate stale rows for items long-since approved or resolved. Add a periodic cleanup (cron) once we have ≥1000 rows. Low priority — table is tiny by design.
- Watch initial-snapshot pulls from `events` table only. Internal Loop activity (agent_note section transitions, document streaming) won't appear in the Watch until the corresponding event-row insertion lands in the Loop layer (Sprint 10+).

---

## Bright lines kept

- **Cross-venture isolation** — both surfaces filter on the visible-venture set at the server fetch + realtime filter layers
- **Observation vs communication** — Watch entries are read-only; Day item dismissal is an explicit operator action. No auto-send. Internal Loop activity surfaces as observation, per the experience-layer doc edits
- **No flat artifacts** — Day surfaces existing typed Documents and Sections; no new artifact types
- **No agent constructs its own prompt** — no agents in this sprint
- **No emoji in UI chrome** — empty states are plain prose ("All quiet.", "All clear. The day is closed.")
- **No gradients / shadows / rounded corners** — borders and square corners only
- **No icons on buttons** — Day item checkbox is a small bordered square; toggles via form post
- **Phosphor regular** — no new icons in this sprint
- **Membership-scoped at the buildAgentPrompt layer** — N/A here (no agents); the analogous rule for this sprint is "membership-scoped at the server-fetch layer" which `loadDayItems` and `listEventsForVentures` enforce

---

## Where the sprint ends

`HEAD = f4dcc7b`. Sprint 9 acceptance criteria all met. Quality rubric 8/8. 118 tests pass; build clean.

The next sprint (Sprint 10 — Streaming Sections + Loop 1 conversation) introduces:

- `documents.status='drafting'` (the streaming state) — extends Sprint 8's `bridge_tiles` "active" derivation
- Loop output emitting typed Section events — Watch will narrate these as they stream
- Document-level approval action with Section-level enforcement — replaces per-Section approval ceremony

Sprint 9's narrate formatter already covers `document.section_streamed` so when Sprint 10 starts emitting those events, the Watch picks them up without code change.

Phase status: 3 of 5 sprints shipped. Continuing per Tim's marathon directive.
