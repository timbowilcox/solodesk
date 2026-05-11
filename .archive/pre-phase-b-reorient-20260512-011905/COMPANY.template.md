# &lt;Venture Name&gt;

**Slug:** `&lt;slug&gt;`
**Phase:** `discovery` | `build` | `launch` | `scale` | `dormant`
**Last reviewed:** YYYY-MM-DD

---

## Mission

One sentence. What changes in the world if this works.

## ICP

Who specifically. Concrete enough to build a list. Include negative space — who is *not* the ICP.

## Positioning

The one-line wedge. Whom you're stealing share from. Why now.

## Business model

Pricing. Expected ACV. Expected gross margin. Distribution channel.

## North-star metric

The one number that matters this quarter. Should map to a SQL view in `/dashboards`.

## Supporting KPIs

3-5 max. Each linked to a SQL view.

- KPI 1 — view: `<view_name>`
- KPI 2 — view: `<view_name>`
- KPI 3 — view: `<view_name>`

## Voice and tone

How the venture speaks. Sample phrases. What it never says. Linked content style guide if one exists.

## Anti-patterns

Things this venture explicitly will NOT do, even if asked. Encode constraints from prior decisions here. Examples:
- Realtelligence: must not mention RealStyler before November 2026
- Corum: no auto-reply, no outbound on director's behalf, no stakeholder graphs beyond explicit consent
- Kounta: no agent ever touches a customer's bank credentials or Stripe keys

## Loops enabled

Which loops are active for this venture. Configure in `ventures.loops_enabled`.

- [ ] Loop 1 — Strategy / office-hours
- [ ] Loop 2 — Spec → build → ship (this is via Claude Code, not Skipper)
- [ ] Loop 3 — Design (this is via Claude Code, not Skipper)
- [ ] Loop 4 — Content
- [ ] Loop 5 — Sales / outbound
- [ ] Loop 6 — Support triage
- [ ] Loop 7 — Lifecycle / activation
- [ ] Loop 8 — Metrics rollup
- [ ] Loop 9 — Competitive intel
- [ ] Loop 10 — Decisions / hiring

## Intel sources (for Loop 9)

If Loop 9 is enabled — list of competitor URLs, X handles, ProductHunt categories, subreddits to scan weekly. Stored in `ventures.intel_sources` jsonb.

## Current sprint focus

Where attention is going this week. Updated Sundays.

## Recent decisions

Auto-populated from `decisions` table where `status = 'active'` and `venture_id` matches.
