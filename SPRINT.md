# Sprint 0 — Foundation

**Date opened:** 2026-04-26
**Repo:** solodesk
**Loops added:** none (substrate only)

---

## Scope

Build the foundation SoloDesk sits on: a Next.js 16 app deployed to Vercel `syd1`, backed by a fresh Supabase project, served on two domains (`solodesk.ai` for landing + waitlist, `app.solodesk.ai` for the authed app), with magic-link auth gated by an `allowed_users` allowlist with admin/member roles, the initial schema migration applied, an event ingestion endpoint with idempotency, a waitlist signup endpoint with Resend confirmation email, a manual event creation server action, and a dashboard shell that lists ventures and recent events.

No agents. No loops. No webhook integrations beyond a stub. The point is to ship the substrate that all subsequent sprints stand on.

## Out of scope

- Any agent skill or invocation
- Any loop logic
- Stripe/Vercel/GitHub webhook integrations (stub the ingestion endpoint, don't wire any source yet)
- RLS / multi-tenant
- Cron jobs
- Marketing copy beyond a minimal hero + waitlist form
- Public promotion of the waitlist
- Anything in `ROADMAP.md` for Sprints 1-6

If something feels useful but isn't on the acceptance list below, defer it.

## Acceptance criteria

### Project + infrastructure

- [ ] Next.js 16 project created with App Router, TypeScript strict, Tailwind v4, shadcn/ui initialised
- [ ] pnpm, single package
- [ ] `vercel.json` with region `syd1` and node runtime
- [ ] Deployed to Vercel
- [ ] Supabase project created (separate from mm-hub), URL + anon key + service role key stored in Vercel env vars
- [ ] Resend account created, `solodesk.ai` domain verified (SPF/DKIM/DMARC records added at registrar)
- [ ] Resend API key stored as Vercel env var
- [ ] `.env.local.example` committed showing required env vars

### DNS + domains

- [ ] DNS configured at Tim's registrar:
  - `solodesk.ai` apex → Vercel
  - `www.solodesk.ai` → Vercel (CNAME or Vercel-recommended config)
  - `app.solodesk.ai` → Vercel
- [ ] Both domains added to the Vercel project
- [ ] SSL certificates issued (Vercel handles automatically — confirm both green)
- [ ] Both domains reachable in browser, returning the correct content per hostname routing

### Hostname routing

- [ ] `/middleware.ts` inspects host header
- [ ] Requests to `solodesk.ai` / `www.solodesk.ai`:
  - Allow `/` (renders landing page)
  - Allow `POST /api/waitlist`
  - Everything else → 302 redirect to `/`
- [ ] Requests to `app.solodesk.ai`:
  - Unauthenticated → redirect to `/login`
  - Authenticated but email not in `allowed_users` (or `active=false`) → redirect to `/login?error=not_invited`
  - Authenticated and allowed → continue
- [ ] localhost dev defaults to `app.solodesk.ai` behaviour
- [ ] Tested: visiting `solodesk.ai/dashboard` redirects to `solodesk.ai/`, NOT to the app

### Schema

- [ ] Migration `0001_initial_schema.sql` applied
- [ ] Tables present: `ventures`, `events`, `decisions`, `artifacts`, `loop_runs`, `metric_snapshots`, `anomalies`, `support_tickets`, `allowed_users`, `waitlist_signups`
- [ ] Indexes confirmed via `\d` query on key tables
- [ ] Tim's email seeded into `allowed_users` with `role='admin'` (via SQL or seed script)

### Auth

- [ ] Supabase Auth configured with email magic link, no other providers
- [ ] `/login` page (under `app.solodesk.ai`):
  - Email input + submit
  - Server action checks `allowed_users` for active email
  - Returns generic "check your email" message regardless of allowlist state (no enumeration)
  - If allowed: triggers Supabase magic link
  - If not allowed: silently does nothing
- [ ] Magic link callback completes auth and lands on `/dashboard`
- [ ] Middleware updates `allowed_users.last_login` on first authed request per session
- [ ] Tested: a non-allowlisted email submits the form, never receives a magic link, and if they somehow forge a session they're redirected with `error=not_invited`
- [ ] Tested: Tim's allowlisted email receives a working magic link end-to-end

### Landing page (solodesk.ai)

- [ ] `/` route under `solodesk.ai` shows:
  - Hero with single-sentence positioning ("The operating system for portfolio operators" or similar — Tim approves copy in HANDOFF.md)
  - Email input + "Join waitlist" button
  - Nothing else — no marketing copy, no feature list, no pricing
- [ ] Form posts to `/api/waitlist`
- [ ] Success state: "Thanks. We'll be in touch." Error state: gracefully shown
- [ ] Page is responsive, uses Geist fonts, looks clean (not unfinished)

### Waitlist endpoint

- [ ] `POST /api/waitlist` with body `{ email: string }`
- [ ] Validates email format (Zod)
- [ ] Rate-limited (max 5 requests per IP per hour — simple in-memory or Vercel KV)
- [ ] Idempotent: duplicate emails are no-op (200 OK, no second email sent)
- [ ] Inserts row into `waitlist_signups` with `email`, `source='landing'`, `created_at`
- [ ] Sends confirmation email via Resend:
  - From: `SoloDesk <hello@solodesk.ai>`
  - Subject: `You're on the SoloDesk waitlist`
  - Body: short, plain — Tim approves wording in HANDOFF.md
  - On send success, set `waitlist_signups.confirmed_at`
- [ ] If Resend fails, the signup row is still saved (don't lose the email) and an event row is created with `type='waitlist_send_failed'` for retry visibility
- [ ] Tested with real signup end-to-end — actual confirmation email received

### Event ingestion

- [ ] `POST /api/webhooks/[source]` accepts JSON, requires `x-solodesk-secret` header matching `WEBHOOK_SECRET` env var
- [ ] Writes to `events` with `source` from URL param, `payload` from body
- [ ] Idempotency: SHA-256 of `(source || venture || stringified payload)` becomes `events.hash`. Duplicates within 24h are no-op with 200 OK.
- [ ] Server action `createEventAction` for manual event entry — wired to a form on the dashboard
- [ ] Both paths confirmed working with curl test (in HANDOFF.md) and UI test (screenshot in HANDOFF.md)

### Dashboard shell (app.solodesk.ai)

- [ ] Sidebar navigation: Dashboard, Ventures, Events, Settings (placeholder)
- [ ] `/dashboard` shows recent events across all ventures (last 50, paginated) + a "Create event manually" form
- [ ] `/ventures` lists all ventures with phase badge and north-star metric
- [ ] `/ventures/new` form creates a venture (slug, name, phase, north-star, COMPANY.md textarea)
- [ ] `/ventures/[slug]` shows COMPANY.md rendered + recent events for that venture only
- [ ] `/settings` placeholder page (literally an h1 — content comes later)
- [ ] Layout uses Geist Sans / Geist Mono, shadcn primitives only

### Seed data

- [ ] `kounta` venture seeded, phase `build`, COMPANY.md filled in for Kounta (use venture-specific notes from TCOS.md §8)
- [ ] At least 3 manual events created via the form, visible in dashboard
- [ ] At least 1 test waitlist signup completed end-to-end (Tim's secondary email is fine)

### Quality

- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm lint` clean
- [ ] No console errors on any page in production deploy
- [ ] Lighthouse score on landing page ≥ 90 across all categories
- [ ] README.md updated with deploy URLs and env var checklist

### Handoff

- [ ] HANDOFF.md committed with: deploy URLs (both domains), screenshots of landing page, login flow, dashboard, ventures list, venture detail; curl commands used; env vars required; test status; Resend confirmation email rendered; exact next step

---

## Definition of Done

- [ ] All acceptance criteria above ticked, with proof in HANDOFF.md
- [ ] Migration applied and reversible (down-strategy documented)
- [ ] No TypeScript errors
- [ ] Both domains live and reachable
- [ ] Landing page works end-to-end with real Resend email delivered
- [ ] Auth gating works: non-allowlisted email genuinely blocked
- [ ] HANDOFF.md committed
- [ ] Git history clean

---

## Quality rubric

Reviewer scores 1-5:

| Criterion | Target |
|---|---|
| Acceptance criteria completeness — every box honestly checked | 5 |
| Schema integrity — migration runs clean, indexes present, FKs correct | 5 |
| Auth correctness — non-allowlisted emails actually blocked, no enumeration leak | 5 |
| Hostname routing — solodesk.ai genuinely cannot reach authed routes | 5 |
| Idempotency — duplicate webhook + duplicate waitlist provably no-op | 5 |
| Waitlist confirmation — real Resend email arrives in inbox (not spam) | 5 |
| TypeScript strictness — no `any`, no `@ts-ignore` | 4+ |
| UI polish — landing page looks clean (not unfinished); app shell looks intentional | 4+ |
| Test coverage — integration tests for waitlist (happy + dupe), webhook (happy + dupe), auth (allowed + blocked) | 4+ |

If reviewer scores any criterion below target, sprint is not done. Open a fix session.

---

## Adversarial review prompt

```
You are the evaluator agent for SoloDesk Sprint 0. Read CLAUDE.md, ROADMAP.md, SPRINT.md,
and HANDOFF.md before doing anything else.

Your job: find what's wrong, incomplete, or inconsistent. Do not approve unless you are
certain the sprint is genuinely done.

Specifically:
1. Run `pnpm tsc --noEmit` and `pnpm lint`. Report any errors.
2. For every acceptance criterion in SPRINT.md, verify it is actually met. If proof is
   missing in HANDOFF.md, mark it unverified.
3. Check schema: connect to Supabase and confirm tables, indexes, and FK constraints
   match the migration.
4. Test hostname routing: curl -H "Host: solodesk.ai" against /dashboard. Confirm 302
   to /. Curl -H "Host: app.solodesk.ai" against /. Confirm authed-app behaviour.
5. Test auth allowlist: try logging in with a non-allowlisted email. Confirm no magic
   link sent (check Supabase logs).
6. Test waitlist: submit a real email. Confirm a row in waitlist_signups, confirmation
   email received, and second submission of the same email is a no-op (no second email).
7. Test webhook idempotency: send the same payload twice. Confirm second is no-op.
8. Score each criterion in the quality rubric. Justify any score below target.
9. Score the overall sprint 1-10. Anything below 7 → not done.

Do not suggest the sprint is complete unless you have verified it is.
```

---

## Out of scope reminders (read again before building)

- No agents
- No loops
- No real webhook integrations beyond the stub endpoint
- No cron
- No multi-tenant / RLS
- No marketing copy beyond a hero + waitlist form
- No public promotion

If you find yourself building any of the above, stop. They belong to later sprints.
