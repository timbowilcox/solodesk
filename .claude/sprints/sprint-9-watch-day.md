# Sprint 9 — The Watch + The Day (ambient surfaces)

Date drafted: 2026-05-07
Phase: Experience layer (3 of 5)
Estimated build sessions: 2-3
Depends on: Sprint 7 (visual identity), Sprint 8 (Bridge skeleton with placeholder Watch column)

## Position

Together The Watch and The Day make the Bridge feel alive. The Watch is the always-on narrative; The Day is the curated finite list. Both ride the existing events table and the Document/Section state machine.

## Rationale

A still Bridge with no movement and no curated actions still reads as a list page. The Watch supplies the always-working pulse. The Day supplies the answer to "what do I actually need to do today." Both are required for the COO feeling. Building them in the same sprint lets them share the event stream subscription and narration formatter.

## Scope

### The Watch

Persistent component on the Bridge and per-venture pages, right rail, ~240px wide.

Subscribes to the `events` table via Supabase realtime (channel scoped to user's visible ventures via membership lib).

Renders entries with newest on top:
- Timestamp (mono font, 10px, tertiary text)
- Venture name (bold, primary text) prefixed with venture's color dot (4px circle)
- Narrative line (12px, secondary text)

Auto-fade-in on new entries (700ms ease-out).

Per-venture filter — when in `/ventures/[slug]`, Watch filters to that venture only. When on Bridge, Watch shows all visible ventures.

Narration formatter (`/lib/watch/narrate.ts`):
- Pure function: `(event) => string` for each event type
- Maps event_type values to prose templates
- Examples:
  - `document.created` → "Drafting an investigation."
  - `document.section_streamed` → "[Section name] section ready."
  - `document.queued_for_review` → "Document queued for your review. See The Day."
  - `connection.event` → "[Provider] event received: [summary]."
  - `loop.invoked` → "Watching [venture] [function]."
  - `agent_note.opened` → "Critic raised a note on [section]."
  - `anomaly.detected` → "[Metric] anomaly detected. Investigating."

Throttled rendering: if more than 5 events arrive within 1 second, batch render with a single fade-in. Prevents firehose churn.

### The Day

New route `/day` with persistent link in chrome.

Curation logic (`/lib/day/curate.ts`):
- Pulls items where the operator's attention is required:
  - Documents in `pending_review` state, scoped to visible ventures
  - Open `agent_note` Sections (unresolved), scoped to visible ventures
  - Recent anomalies (last 24hr) without acknowledgement
  - Inbound items (member-routed) without response
  - Decisions in draft state ≥3 days old (stale)
- Items sorted by priority (decisions > agent_notes > anomalies > inbound)
- Cap at 30 items. If more than 30, show "and N more" footer link to a full inbox view (not in this sprint)

Day item rendering:
- VentureStripe (Sprint 7) on left edge, 3px wide, full height
- Checkbox (16px, neutral)
- Small VentureMark (16px) + venture name in source line
- Item title (13.5px primary)
- Source line (10.5px mono tertiary, e.g. "Kounta · Decision · 2 days old")

Item click toggles a "marked as done for today" state stored in:
- New table `day_item_dismissals` — `(user_id, item_type, item_id, dismissed_at)`
- Dismissal expires at next 06:00 local time (item reappears next day if still pending)

When done state is toggled, fade strikethrough animation (250ms).

Empty state when all items resolved: "All clear. The day is closed." (one line, plain prose).

### Per-day generation

Daily generation runs client-side on Day route load (no cron in this sprint). Curate function runs on-demand against current DB state. Items are derived, not persisted (except dismissal state).

## Acceptance criteria

### The Watch
- [ ] Visible on `/` (Bridge) and `/ventures/[slug]` (Venture Bridge), right rail
- [ ] Subscribed to events table via Supabase realtime, scoped to visible ventures
- [ ] New entries appear without page reload, fade-in 700ms
- [ ] Newest entries on top, oldest scrolls off
- [ ] Each entry has venture color dot, timestamp, venture name, narrative
- [ ] Per-venture filter: Watch on `/ventures/kounta` shows only Kounta entries
- [ ] Narration formatter handles all current event types in events table without throwing
- [ ] More than 5 events in 1 second batch renders without UI lag

### The Day
- [ ] `/day` route reachable, gated by auth
- [ ] Shows ≤30 items sorted by priority (decisions > agent_notes > anomalies > inbound)
- [ ] Each item has VentureStripe, mark, title, source line
- [ ] Member with 2 assigned ventures sees only items from those 2 ventures
- [ ] Click on item toggles dismissed state (visible strikethrough + faded)
- [ ] Dismissed state persists across page reload
- [ ] Dismissed state resets at next 06:00 local time
- [ ] Empty state shows when no items remain

## Definition of done

- All acceptance criteria checked with proof
- Realtime subscription active and tested with synthetic events (use Supabase MCP to insert test event rows, observe in UI)
- Realtime subscription tears down on route change (no leaked subscriptions)
- Narration formatter has unit tests covering all current event types + a fallback for unknown types
- Curate function has unit tests covering each item type and the priority sort
- `/day` works in member-scoped views (test with a non-admin user)
- HANDOFF.md committed
- Bridge layout updated to give Watch a real width (was placeholder in Sprint 8)

## Quality rubric (SoloDesk specific)

| Criterion | What to check |
|-----------|--------------|
| Bright line: venture isolation | Watch and Day filter by membership-derived venture set. Cannot leak across ventures. Verify with multi-tenant test |
| Realtime hygiene | Subscriptions tear down on route change. Verify with Supabase realtime debug logs |
| Pure narration | `narrate.ts` is a pure function with unit tests. No DB calls inside |
| Pure curation | `curate.ts` is a single derivation function. No state held outside the function |
| Throttle behavior | Burst of 100 events does not freeze UI. Test with synthetic burst |
| Dismissal persistence | day_item_dismissals respects user_id; cannot dismiss other users' items |
| Bright line: explicit click ceremony relaxation | Watch entries are read-only — no auto-action. The Day items dismissal is operator action, not auto-action |
| TypeScript | No `any`. Event types and item types are discriminated unions |

**Score threshold:** Must pass 7/8. Venture isolation and realtime hygiene are non-negotiable.

## Out of scope

- Cross-day persistence beyond current day's dismissal state
- Smart curation (rules-based only — no ML, no LLM in curate path)
- Full inbox view for >30 items (footer link only, future sprint)
- Watch entry click-through to source Document (future sprint)
- Watch entry composition/manual entry
- Day item reordering or pinning
- Email/Slack notifications for Day items
- Mobile-optimized Watch (right rail only on desktop for now)

## Adversarial check questions

- What if events table fires 100 events at once? Throttled rendering, no UI freeze
- What if a member has no assigned ventures? Both surfaces show "all quiet" empty state, not crash
- Do Watch entries respect venture isolation? Members cannot see events from ventures they cannot access — verified with multi-tenant test
- What if narration formatter encounters an unknown event_type? Falls back to "Activity in [venture]" — does not throw
- Does dismissed state leak between users? No — dismissals scoped to user_id with RLS or explicit filter
- What happens to The Day at 06:00 local? Dismissed items reappear if still pending; no UI refresh needed (next page load picks up)
- What if a Document is approved between when The Day was rendered and when the operator reads it? Item is no longer in the curation result on next render; UI shows it as dismissed-by-state-change, not by user
- Does the Watch handle Supabase realtime disconnect/reconnect? Yes — reconnect logic with exponential backoff
- Does the Watch render correctly when scrolled mid-stream by a new entry? New entries prepend; scroll position preserved unless at top

## Files affected

New files:
- `supabase/migrations/0007_day_dismissals.sql` (day_item_dismissals table)
- `lib/watch/narrate.ts`
- `lib/watch/realtime.ts` (subscription helper)
- `lib/day/curate.ts`
- `components/watch/Watch.tsx`
- `components/watch/WatchEntry.tsx`
- `components/day/Day.tsx`
- `components/day/DayItem.tsx`
- `app/day/page.tsx`

Modified files:
- `app/page.tsx` (Watch wired into right rail)
- `app/ventures/[slug]/page.tsx` (Watch wired with per-venture filter)
- `components/chrome/TopBar.tsx` (Day toggle wired up)

Tests:
- `lib/watch/narrate.test.ts`
- `lib/day/curate.test.ts`

## Bright-line tension to resolve in this sprint

The "explicit-click send on all communication" bright line currently means the operator must click to send any message. The Watch surfacing internal Loop activity (e.g. "Critic finished review") is not a send action — it is an observation. Confirm with `experience-layer-doc-updates.md` that this is interpreted as "internal Loop activity is observation, not communication" before building.

## Dependencies on prior work

- Sprint 7 components shipped (VentureMark, VentureStripe, StateDot)
- Sprint 8 shipped (Bridge with right rail placeholder)
- events table populated by current Loops (Loop 8 daily digest at minimum)
- Supabase realtime enabled on events table (verify before sprint start)
