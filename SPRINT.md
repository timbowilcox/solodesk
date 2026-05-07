# Sprint 9 — The Watch + The Day (ambient surfaces)

**Date:** 2026-05-07
**Repo:** solodesk
**Phase:** Experience layer (3 of 5)
**Spec:** `/.claude/sprints/sprint-9-watch-day.md`
**Estimated build sessions:** 2-3

## Scope

Two surfaces that make the Bridge feel alive:

1. **The Watch** — persistent right-rail feed on `/` and `/ventures/[slug]`. Subscribes to the `events` table via Supabase realtime, scoped to the user's visible ventures. Renders entries newest-first with venture color dot + timestamp + venture name + narrative. Per-venture filter when on `/ventures/[slug]`. Throttled batch render when more than 5 events arrive in 1s. New entries fade in 700ms ease-out per the design-system ambient-motion vocabulary.

2. **The Day** — new route `/day`. Curated finite list of items that need operator attention: pending-review documents, open agent_note sections, recent open anomalies, stale draft decisions, new support tickets. Sorted by priority (decisions > agent_notes > anomalies > inbound). Cap at 30 items. Each item dismissible via click; dismissal expires at next 06:00 local time. Empty state: "All clear. The day is closed."

The Bridge / Day toggle in the chrome (currently disabled placeholder from Sprint 8) gets wired up: Bridge is `/`, Day is `/day`.

**Substitutions and deviations from spec:**

- **Migration number bump.** Spec calls for `0007_day_dismissals.sql`; that slot is taken by `venture_members`. This sprint uses `0010_day_dismissals.sql`.
- **`documents.status='pending_review'` not in current enum.** Schema has `('draft','reviewing','approved','rejected','published','archived')`. Curation reads `reviewing` as the equivalent of `pending_review`. Documented in `lib/day/curate.ts`.
- **Stale-decision threshold uses `documents` not `decisions`.** The spec says "decisions in draft state ≥3 days old". `decisions` table is the legacy/queryable surface; the editing surface is `documents` with `type='decision'`. Curation pulls from `documents` so the link points back to the editable record.
- **Inbound items source.** Spec is vague on what "member-routed" means in v0. Mapped to `support_tickets` with `status='new'` for this sprint. If `inbox` becomes its own table later, swap in.
- **Realtime subscription tear-down test.** Spec requires "subscriptions tear down on route change." Verified via component cleanup hooks; no leaked-channel test added (would need browser harness — operator-driven during deploy verify).
- **Phosphor regular** continues from Sprint 8 — no new icon primitives in this sprint, but any added must be Phosphor regular only.

## Acceptance criteria

### The Watch

- [ ] Visible on `/` (Bridge) and `/ventures/[slug]` (Venture Bridge), right rail
- [ ] Subscribed to `events` table via Supabase realtime, filtered to visible ventures
- [ ] New entries appear without page reload, fade-in 700ms ease-out
- [ ] Newest entries on top, oldest scrolls off (cap visible to ~25 entries)
- [ ] Each entry: venture color dot (4px), mono timestamp, venture name (bold), narrative line
- [ ] Per-venture filter: Watch on `/ventures/kounta` shows only Kounta entries
- [ ] Narration formatter handles all current event types in the events table without throwing; unknown types fall back to "Activity in {venture}"
- [ ] More than 5 events arriving in 1s batch-render without UI lag (throttle window)
- [ ] Subscription tears down on component unmount (verified via cleanup function)

### The Day

- [ ] `/day` route reachable on `app.solodesk.ai`, gated by auth
- [ ] Shows ≤30 items sorted by priority (decisions > agent_notes > anomalies > inbound)
- [ ] Each item: VentureStripe + checkbox + small VentureMark + venture name + title + source line
- [ ] Member with 2 assigned ventures sees only items from those 2 ventures
- [ ] Click on item toggles dismissed state (visible strikethrough + faded)
- [ ] Dismissed state persists across page reload
- [ ] Dismissed state resets at next 06:00 local time (next-day picks up still-pending items)
- [ ] Empty state shows when no items remain: "All clear. The day is closed."
- [ ] Bridge / Day toggle in chrome wires Day to `/day`

## Definition of done

- [ ] All acceptance criteria checked with proof
- [ ] Migration `0010_day_dismissals.sql` applied to dev Supabase
- [ ] `lib/watch/narrate.ts` is a pure function with unit tests covering all event types + unknown fallback
- [ ] `lib/day/curate.ts` is a pure function with unit tests covering each item type and the priority sort
- [ ] Realtime subscription tear-down verified via cleanup function (manual verification documented in HANDOFF)
- [ ] HANDOFF.md committed (root + archive)
- [ ] All work committed with conventional-commit messages
- [ ] `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` clean, `pnpm build` clean
- [ ] Adversarial check questions answered in HANDOFF

## Quality rubric

| Criterion | What to check |
|-----------|---------------|
| Bright line: venture isolation | Watch and Day filter by membership-derived venture set. Cannot leak across ventures |
| Realtime hygiene | Supabase channel created in useEffect; unsubscribed in cleanup. No subscriptions outlive the component |
| Pure narration | `narrate.ts` is a pure function with unit tests. No DB calls inside |
| Pure curation | `curate.ts` derives the list from input rows. No state held outside the function |
| Throttle behavior | Burst of >5 events within 1s batches into a single render |
| Dismissal persistence | `day_item_dismissals` rows scoped to `user_id`. Cannot dismiss other users' items via shared payload |
| Bright line: observation vs communication | Watch entries are read-only — no auto-action. Day item dismissal is operator action, not auto-action. Internal Loop activity surfaces as observation |
| TypeScript | No `any`. Event types and item types are discriminated unions |

**Score threshold:** Must pass 7/8. Venture isolation, realtime hygiene, and observation-vs-communication are non-negotiable.

## Out of scope

- Cross-day persistence beyond current day's dismissal state
- Smart curation (rules-based only — no ML, no LLM in curate path)
- Full inbox view for >30 items (footer link only, future sprint)
- Watch entry click-through to source Document (future sprint)
- Manual Watch entry composition
- Day item reordering or pinning
- Email/Slack notifications for Day items
- Mobile-optimized Watch (right rail only on desktop ≥lg breakpoint)
- Realtime debug overlay (operator-driven verification only)

## Adversarial check questions (to be answered in HANDOFF)

- What if events table fires 100 events at once? Expected: throttled rendering, no UI freeze
- What if a member has no assigned ventures? Expected: both surfaces show "all quiet" / "all clear" empty state, not crash
- Do Watch entries respect venture isolation? Expected: members cannot see events from ventures they cannot access — verified at the realtime filter layer
- What if narration formatter encounters an unknown event_type? Expected: falls back to "Activity in {venture}" — does not throw
- Does dismissed state leak between users? Expected: no — dismissals scoped to `user_id` with explicit filter
- What happens to The Day at 06:00 local? Expected: dismissed items reappear if still pending; next page load picks up
- What if a Document is approved between when The Day was rendered and when the operator reads it? Expected: item is no longer in the curation result on next render
- Does the Watch handle Supabase realtime disconnect? Expected: Supabase client auto-reconnects with backoff; no extra logic needed in this sprint
- Does the Watch render correctly when scrolled mid-stream by a new entry? Expected: new entries prepend; scroll position preserved unless at top
