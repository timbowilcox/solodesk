# Handoff: Sprint 0 — Foundation (build session 1 of 2)

**Date:** 2026-04-27
**Repo:** solodesk
**Branch:** `main`
**Commits this session:** 8 (`f68207d` … `c133cbb`)
**Session type:** Build (deploy-verification follows)
**Author:** Claude (Opus 4.7) under Tim's harness

---

## Scope decision (recap from kickoff)

Sprint 0 is split across two build sessions:

- **Session 1 (this one):** scaffold + all source code + tests + seed
  SQL + everything verifiable locally. **No live Supabase, no Vercel
  deploy, no DNS.**
- **Session 2 (next):** Tim recreates Supabase in `ap-southeast-2`,
  pastes keys, applies migration, wires Vercel env vars, points DNS at
  GoDaddy. I then verify both domains live, real Resend email arrives,
  auth round-trips, webhooks idempotent end-to-end. Lighthouse,
  screenshots, and the final acceptance ticks land in HANDOFF (session 2).

Sprint 0 is not closed until both sessions pass evaluator review.

---

## What was completed this session

### Project + tooling
- Next.js 16.2.4 + React 19.2.5 scaffold, App Router, TypeScript strict
  with `noUncheckedIndexedAccess`, pnpm 10.13.1, single package.
- Tailwind v4 via `@tailwindcss/postcss`, shadcn/ui primitives in place
  (cn, components.json, neutral palette, OKLCH variables, dark-mode
  hook), Geist Sans / Geist Mono fonts.
- `vercel.json` pinning region `syd1`.
- `.env.local.example` listing every Sprint-0 + 0.5 env var with
  `REPLACE_ME` placeholders. `.gitignore` protects `.env.local` from the
  very first commit; no real secret has been or can be committed.
- ESLint 9 flat config wired to `eslint-config-next/core-web-vitals` +
  `/typescript` (the v16-native exports, not FlatCompat).
- Vitest config with `@/*` alias and a `server-only` shim so `import
  "server-only"` modules are testable.
- GitHub remote `https://github.com/timbowilcox/solodesk` set as
  `origin`, `main` pushed, branch tracks origin/main.

### Hostname routing (`proxy.ts`)
Next.js 16's `proxy` file convention (the renamed `middleware`).
Inspects host:

| Host | Behaviour |
|---|---|
| `solodesk.ai` / `www.solodesk.ai` | Allow only `/` and `/api/waitlist`; everything else 302 to `/`. |
| `app.solodesk.ai` (and `localhost` in dev) | `/login`, `/auth/*`, `/api/webhooks/*` are public. `/api/waitlist` returns 404. Every other path requires a Supabase session AND `allowed_users.email = email AND active = true`. Misses → `/login` (or `/login?error=not_invited` after `signOut`). Authed `/` → `/dashboard`. |

`last_login` is touched fire-and-forget, debounced 1h per email so the
proxy hot path stays cheap.

### Auth
- `/login` — server-rendered email form, reads `?error` / `?sent=1` for
  state. Submits to `loginAction`.
- `loginAction` — Zod-validates email, looks up `allowed_users`, only
  triggers `signInWithOtp` for matches; redirects to `/login?sent=1`
  unconditionally so allowed and not-allowed responses are
  indistinguishable (no enumeration leak).
- `/auth/callback` — exchanges PKCE code for a session via
  `exchangeCodeForSession`, redirects to `?next` (default `/dashboard`).
  Invalid/expired codes → `/login?error=invalid_link`.

### Supabase client wrappers (`lib/supabase/`)
- `server.ts` — Server Components + Server Actions (cookie-aware via
  `next/headers`).
- `browser.ts` — Client Components.
- `middleware.ts` — proxy cookie handling.
- `admin.ts` — service-role client, cached per process.
- `types.ts` — hand-rolled `Database` type covering the 4 tables
  Sprint 0 actually queries (`allowed_users`, `waitlist_signups`,
  `ventures`, `events`) plus `Relationships: []` to satisfy
  postgrest-js's `GenericTable` contract. The 6 tables that don't get
  queried this sprint are typed loosely; they'll be fully typed when
  their loops land.

### App shell + pages
Route groups: `app/(landing)/` for solodesk.ai, `app/(authed)/` for
the authed app. Both share the root layout (Geist + globals.css).

| Route | Purpose | Sprint 0 state |
|---|---|---|
| `/` (landing) | Hero + waitlist form | Final |
| `/login` | Magic-link form | Final |
| `/auth/callback` | PKCE exchange | Final |
| `/api/waitlist` (POST) | Waitlist endpoint | Final |
| `/api/webhooks/[source]` (POST) | Webhook ingestion | Final |
| `/dashboard` | Last 50 events + create-event form | Final |
| `/events` | Full event log, paginated `?page=N` | Final |
| `/ventures` | Venture list with phase pill | Final |
| `/ventures/new` | Create form | Final |
| `/ventures/[slug]` | Rendered COMPANY.md + venture's events | Final |
| `/settings` | Placeholder per spec | Placeholder (intentional) |

Sidebar (`components/app-sidebar.tsx`, client component for
`usePathname` active highlight): Dashboard / Ventures / Events /
Settings, each with a Lucide icon, plus signed-in email + sign-out.

### Webhook ingestion
`POST /api/webhooks/[source]`:
- Timing-safe equals on `x-solodesk-secret` vs `WEBHOOK_SECRET` (both
  trimmed to equal-length buffers; placeholder `REPLACE_ME` rejected
  with 500 to prevent accepting traffic on an unconfigured deploy).
- Source param validated `^[a-z0-9_-]+$`, max 64 chars.
- Hash = `sha256(source || ventureSlug || canonical(payload))` with
  keys sorted recursively and `undefined` stripped, so reordered
  webhook bodies hash the same.
- Schema's partial unique index on `events.hash` (where hash is not
  null) is the idempotency mechanism. Duplicate POSTs return
  `{status:"duplicate"}` with **200**, not 409, per spec.
- `?venture=<slug>` resolves to `venture_id`; missing/unknown slug →
  null.

### Manual event creation
`/dashboard` includes a server-action form (`createEventAction`):
source / type / venture / actor (auto-filled with current user's
email) / JSON payload. Validates with Zod, parses payload as JSON,
inserts via `lib/db/events.ts`. Revalidates `/dashboard` and
`/events` and redirects with `?created=<id>` or `?error=<reason>`.

### Waitlist + Resend
`POST /api/waitlist`:
- Per-IP rate limit, 5 / hour, in-memory map keyed on
  `x-forwarded-for`. Cold-start resets are acceptable for v0; Vercel
  KV is the upgrade path when needed.
- Zod schema normalises email to lowercase + trim.
- `upsertWaitlistSignup` — inserts; on `23505` unique violation, loads
  the existing row and returns `isNew: false` so the contract is
  identical for new and duplicate signups.
- Resend send only fires on `isNew: true`. Success → stamp
  `confirmed_at`. Failure → write an `events` row with
  `type=waitlist_send_failed` and `{email, signup_id, error}` payload
  for retry visibility in the dashboard. Either way the response is
  200.

### Schema seed
`supabase/seed.sql` is written and idempotent (`on conflict do
nothing`). It adds:
- `allowed_users` row for `tim@solodesk.ai`, `role='admin'`,
  `active=true`.
- `ventures` row for `kounta` (phase=build, north_star=MRR,
  COMPANY.md = "AI-native accounting infrastructure — COMPANY.md to be
  filled in Sprint 1." per Tim's directive).

It runs against the Sydney project once Tim provides keys
(see runbook below).

### Tests
32 Vitest tests across 5 files, all green:

| File | Tests | Covers |
|---|---|---|
| `tests/lib/events/hash.test.ts` | 8 | Idempotency contract: determinism, key-order insensitivity, source/venture/payload sensitivity, nested canonicalisation. |
| `tests/lib/rate-limit.test.ts` | 4 | Allow-5 / block-6, per-key isolation, window expiry. |
| `tests/lib/auth/allowlist.test.ts` | 5 | Active match, missing email, postgres error path, empty input, `touchLastLogin` short-circuit. |
| `tests/api/webhooks.test.ts` | 8 | Auth (no/wrong secret, placeholder), source validation, JSON validation, happy + duplicate, hash equality across reordered keys. |
| `tests/api/waitlist.test.ts` | 7 | JSON / email validation, happy path with mark-confirmed, duplicate silent, send-failure event, rate limit 6th request, email normalisation. |

Mocks scoped per test via `vi.mock`; chainable Supabase mock helper in
`tests/_helpers/mock-supabase.ts`. No real network or DB hits.

Playwright e2e is **deferred to deploy-verification session** —
without a live Supabase + Resend the smoke value is low, and `pnpm dev`
is the manual smoke for now.

---

## Test status (run at end of session)

```
$ pnpm typecheck       # tsc --noEmit
(clean)

$ pnpm lint            # eslint .
(clean — zero warnings, zero errors)

$ pnpm test            # vitest run
Test Files  5 passed (5)
Tests       32 passed (32)
Duration    ~500ms

$ pnpm build           # next build (Turbopack)
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/waitlist
├ ƒ /api/webhooks/[source]
├ ƒ /auth/callback
├ ƒ /dashboard
├ ƒ /events
├ ƒ /login
├ ƒ /settings
├ ƒ /ventures
├ ƒ /ventures/[slug]
└ ƒ /ventures/new

ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## What is NOT done (deferred to deploy-verification session)

Every item below is gated on Tim's external setup. They are not
oversights.

- **Sydney Supabase project** — Tim is recreating in
  `ap-southeast-2` (Tokyo project marked for deletion). Migration not
  yet applied. Seed not yet run.
- **Vercel env vars** — placeholders in `.env.local.example` only;
  real values live in Tim's password manager and need pasting into
  Vercel project settings.
- **DNS** — GoDaddy → Vercel for `solodesk.ai`, `www.solodesk.ai`,
  `app.solodesk.ai` not yet pointed.
- **SSL on both domains** — automatic via Vercel once domains are
  added; needs visual confirmation.
- **Real waitlist confirmation email** — Resend domain is verified
  (16h ago), but no real signup has been completed end-to-end yet.
  Migadu inbox is ready in Thunderbird.
- **Magic-link end-to-end** — needs live Supabase + correct Site URL +
  redirect URLs (see runbook). Login flow has been built but never run
  against real Auth.
- **Lighthouse ≥ 90 on landing page** — needs live deploy.
- **Screenshots in this HANDOFF** — needs live deploy. Will be added
  by session 2.
- **Manual events visible in dashboard** — needs live DB.
- **Three+ test events created via the form** — needs live DB.
- **One+ test waitlist signup completed** — needs live DB + Resend.
- **Playwright e2e tests** — deferred (see Tests section above).

---

## Drafts pending Tim approval

These are placeholder copy that ships with the build. **Don't treat
as final until Tim ticks them.**

### Hero copy (`app/(landing)/page.tsx`)

> **The operating system for portfolio operators.**

Constraints honoured: one sentence; no "AI", no "agents", no brand
names; clarity over cleverness. Audience signal ("portfolio
operators") matches the README framing.

Alternatives Tim can swap to without code changes (just edit the
string in `app/(landing)/page.tsx`):

- "An operating system for running half a dozen ventures alone."
- "For people running more than one company at once."

### Waitlist confirmation email (`lib/resend.ts`)

```
From:    SoloDesk <hello@solodesk.ai>
Subject: You're on the SoloDesk waitlist

Got it — you're on the list.

I'll be in touch when there's something to show.

Tim Wilcox
SoloDesk
```

Plain text, signed by you (the project is yours, not "we'll be in
touch" corporate). Edit the `WAITLIST_BODY` constant to change.

---

## Required environment variables

`.env.local.example` lists them all. Real values go into Vercel
project settings (production + preview), not into git.

| Name | Where it's used | Required for Sprint 0? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth + DB everywhere | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server clients | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin queries (allowlist, webhook insert, waitlist insert) | yes |
| `RESEND_API_KEY` | Waitlist confirmation email | yes |
| `WEBHOOK_SECRET` | `x-solodesk-secret` validation; reject placeholder explicitly | yes |
| `CRON_SECRET` | Sprint 0.5+ cron jobs | not used yet |
| `ANTHROPIC_API_KEY` | Sprint 1+ agents | not used yet |
| `VOYAGE_API_KEY` | Sprint 0.5 embeddings | not used yet |
| `ALLOWED_EMAIL` | Seed-script use only | seed-time |

---

## Deploy runbook (session 2 — Tim drives, then I verify)

### 1. Recreate Supabase in Sydney
1. Delete current Tokyo project (Solodesk v1 at
   `wndujdnsqppwizyxvkfv.supabase.co`).
2. Create new project, region `ap-southeast-2`, name `solodesk` (or
   similar). Save the password — you'll need it for psql.
3. Copy URL + `anon` + `service_role` from Settings → API.
4. **Configure Auth → URL Configuration:**
   - Site URL: `https://app.solodesk.ai`
   - Additional redirect URLs:
     - `https://app.solodesk.ai/auth/callback`
     - `http://localhost:3000/auth/callback` (for dev)
5. **Apply migration + seed.** Two options:

   **Option A — Supabase SQL editor:**
   1. Paste contents of `supabase/migrations/0001_initial_schema.sql`
      and run.
   2. Paste contents of `supabase/seed.sql` and run.

   **Option B — psql or `supabase` CLI:**
   ```bash
   psql "$DATABASE_URL" -f supabase/migrations/0001_initial_schema.sql
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```

6. Verify in Studio:
   - All 10 tables present (`allowed_users`, `waitlist_signups`,
     `ventures`, `events`, `decisions`, `artifacts`, `loop_runs`,
     `metric_snapshots`, `anomalies`, `support_tickets`).
   - `allowed_users` has 1 row (`tim@solodesk.ai`, role=admin,
     active=true).
   - `ventures` has 1 row (`kounta`, phase=build).

### 2. Vercel env vars
For both Production and Preview environments in
`vercel.com/tims-projects-ebc6d301/solodesk` settings:
- All 9 vars from the table above (real values, not placeholders).
- Generate `WEBHOOK_SECRET` and `CRON_SECRET` if not done:
  `openssl rand -hex 32` (or use Tim's password-manager values).

### 3. DNS at GoDaddy
- `solodesk.ai` apex → A record `76.76.21.21` (or whatever Vercel
  recommends in domain settings).
- `www.solodesk.ai` → CNAME `cname.vercel-dns.com`.
- `app.solodesk.ai` → CNAME `cname.vercel-dns.com`.

### 4. Vercel domains
- Add `solodesk.ai` to project.
- Add `www.solodesk.ai` (will redirect to apex per Vercel default).
- Add `app.solodesk.ai`.
- Wait for SSL (auto). Confirm both domains green.

### 5. Trigger production deploy
Pushing this commit to `main` already triggered a deploy. If env vars
were not yet set, redeploy after adding them (Vercel → Deployments →
Redeploy with new env).

### 6. Verification checklist (session 2 will tick these)

```bash
# Hostname routing
curl -I https://solodesk.ai/                    # 200
curl -I https://solodesk.ai/dashboard           # 302 → /
curl -I https://app.solodesk.ai/                # 302 → /login
curl -I https://app.solodesk.ai/dashboard       # 302 → /login

# Waitlist (only on solodesk.ai)
curl -X POST https://solodesk.ai/api/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"tim+test@solodesk.ai"}'
# expect: {"status":"ok"}; confirmation arrives in inbox

# Same payload again — duplicate (no second email)
curl -X POST https://solodesk.ai/api/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"tim+test@solodesk.ai"}'
# expect: {"status":"ok","duplicate":true}

# Webhook (only on app.solodesk.ai)
curl -X POST https://app.solodesk.ai/api/webhooks/manual \
  -H 'content-type: application/json' \
  -H "x-solodesk-secret: $WEBHOOK_SECRET" \
  -d '{"type":"smoke_test","note":"hello"}'
# expect: {"status":"ok","id":"<uuid>"}

# Same payload again — duplicate
# expect: {"status":"duplicate"}

# Wrong secret
curl -X POST https://app.solodesk.ai/api/webhooks/manual \
  -H 'content-type: application/json' \
  -H 'x-solodesk-secret: wrong' \
  -d '{"type":"x"}'
# expect: 401

# Auth — non-allowlisted email (no enumeration leak)
# Submit form on https://app.solodesk.ai/login with rando@example.com
# expect: page shows "check your email" success state
# expect: no row inserted; no email sent (verify in Supabase Auth logs)

# Auth — allowlisted (tim@solodesk.ai)
# Expect magic link in Migadu, click, lands on /dashboard
```

### 7. Manual UI smoke (session 2 captures screenshots)

- Landing page renders, hero readable, form submits, success state
  shows.
- Login page renders, form submits, ?sent=1 shown.
- Magic-link round-trip works.
- Dashboard renders with sidebar; events feed shows the curl-created
  events; create-event form works.
- Ventures list shows Kounta with phase badge.
- /ventures/kounta renders the COMPANY.md (one-line stub).
- /ventures/new creates a new venture and redirects to its detail.

### 8. Lighthouse
Run on `https://solodesk.ai/` (the landing page, not the app), all 4
categories ≥ 90. If anything's below, log it as Sprint 0 follow-up.

---

## Known issues / debt (intentional, not bugs)

- **Idempotency window.** Spec said "duplicates within 24h are no-op";
  schema's unique index on `hash` enforces it permanently. Practically
  identical for v0 (webhooks retry within minutes), but if we ever
  want to allow re-ingestion after 24h we'd need a cleanup cron that
  nulls old hashes. Not building that now.
- **In-memory rate limit.** Per-instance, resets on cold start. Fine
  for v0; Vercel KV is the upgrade.
- **Markdown sanitization.** `Markdown` component uses `marked` +
  `dangerouslySetInnerHTML`. Safe in v0 because COMPANY.md is
  human-authored only; needs DOMPurify when agents start writing in
  later sprints.
- **Loose types for unused tables.** `decisions`, `artifacts`,
  `loop_runs`, `metric_snapshots`, `anomalies`, `support_tickets`
  typed as `Record<string, unknown>` until their loops ship.
- **`server-only` shim.** Vitest aliases `server-only` to an empty
  module so server modules import cleanly under Node. The real guard
  is enforced by Next.js at build time, which is unaffected.
- **No /events page deduplication.** /events shows the same feed as
  /dashboard's events block (without the create form). Acceptable for
  v0 — they share `EventsTable` and the underlying query helper. Could
  be a single page in a future cleanup.
- **TypeScript 6.0.3.** pnpm resolved this as the latest; Next.js
  16.2.4 builds clean against it. Worth watching if anything weird
  shows up.
- **Co-author attribution.** Every commit is co-authored by
  `Claude Opus 4.7 (1M context)` per Tim's git policy.

---

## Files changed (this session)

```
app/
  (authed)/
    actions.ts                    new   sign-out
    layout.tsx                    new   sidebar shell
    dashboard/
      actions.ts                  new   createEventAction
      page.tsx                    new   feed + form
    events/page.tsx               new   full event log
    settings/page.tsx             new   placeholder
    ventures/
      page.tsx                    new   list
      new/
        actions.ts                new   createVentureAction
        page.tsx                  new   create form
      [slug]/page.tsx             new   detail
  (landing)/page.tsx              new   hero + waitlist form
  api/
    waitlist/route.ts             new
    webhooks/[source]/route.ts    new
  auth/callback/route.ts          new
  login/
    actions.ts                    new   loginAction
    page.tsx                      new   login form
  globals.css                     new   tailwind v4 + theme + markdown
  layout.tsx                      new   root + Geist
components/
  app-sidebar.tsx                 new
  events-table.tsx                new
  markdown.tsx                    new
  phase-badge.tsx                 new
  waitlist-form.tsx               new   client component
lib/
  auth/allowlist.ts               new
  db/events.ts                    new
  db/ventures.ts                  new
  db/waitlist.ts                  new
  events/hash.ts                  new
  host.ts                         new
  origin.ts                       new
  rate-limit.ts                   new
  resend.ts                       new
  security/timing-safe.ts         new
  supabase/admin.ts               new
  supabase/browser.ts             new
  supabase/middleware.ts          new
  supabase/server.ts              new
  supabase/types.ts               new
  utils.ts                        new   shadcn cn()
proxy.ts                          new   Next.js 16 file convention
supabase/seed.sql                 new
tests/
  _helpers/{empty,mock-supabase}.ts  new
  api/{waitlist,webhooks}.test.ts new
  lib/auth/allowlist.test.ts      new
  lib/events/hash.test.ts         new
  lib/rate-limit.test.ts          new

config:
  .gitignore                      new
  .env.local.example              new
  components.json                 new
  eslint.config.mjs               new
  next.config.ts                  new
  package.json                    new
  pnpm-lock.yaml                  new
  postcss.config.mjs              new
  tsconfig.json                   new
  vercel.json                     new
  vitest.config.ts                new
```

---

## Acceptance criteria — Sprint 0 status

Format: ✅ done this session · ⏸ blocked on Tim's external setup · 📋 verifies in session 2.

### Project + infrastructure
- ✅ Next.js 16 with App Router, TypeScript strict, Tailwind v4,
  shadcn/ui primitives.
- ✅ pnpm, single package.
- ✅ `vercel.json` with region `syd1` (Node runtime is the App Router
  default; no edge anywhere).
- ⏸ Deployed to Vercel (push triggers auto-deploy; needs env vars
  first).
- ⏸ Supabase project created in Sydney; URL + keys in Vercel.
- ⏸ Resend domain verified (already done — 16h ago per Tim).
- ⏸ `RESEND_API_KEY` in Vercel.
- ✅ `.env.local.example` committed.

### DNS + domains
- ⏸ All four DNS records.
- ⏸ Both domains added to Vercel.
- ⏸ SSL green.
- 📋 Both domains reachable and routing per host.

### Hostname routing
- ✅ `proxy.ts` inspects host header.
- ✅ Landing → only `/` and `/api/waitlist`; everything else 302 to `/`.
- ✅ App → unauthed → `/login`; authed but not allowlisted →
  `/login?error=not_invited`; authed + allowed continues.
- ✅ localhost defaults to app behaviour.
- 📋 `solodesk.ai/dashboard` 302 to `solodesk.ai/`.

### Schema
- ⏸ Migration 0001 applied (in session 2).
- ⏸ All 10 tables present.
- ⏸ Indexes verified.
- ⏸ `tim@solodesk.ai` seeded as admin (seed.sql ready).

### Auth
- ✅ Magic-link flow built (configured to magic-link only on Supabase
  side in session 2).
- ✅ `/login` form + server action with allowlist check + no-enumeration
  redirect.
- ✅ Magic-link callback → `/dashboard`.
- ✅ `last_login` debounced update in proxy.
- 📋 Non-allowlisted email never receives a magic link (verify in
  Supabase Auth logs).
- 📋 Tim's allowlisted email gets a working magic link end-to-end.

### Landing page (solodesk.ai)
- ✅ Hero (one-sentence positioning, `PENDING TIM APPROVAL`) + email
  form.
- ✅ Posts to `/api/waitlist`.
- ✅ Success state ("Thanks. We'll be in touch.") and error states.
- ✅ Geist fonts; responsive; clean layout.
- 📋 Lighthouse ≥ 90 (verified on live).

### Waitlist endpoint
- ✅ `POST /api/waitlist` with `{ email: string }` body.
- ✅ Zod validation.
- ✅ Rate-limit 5/IP/hour.
- ✅ Idempotent (duplicate = 200 with no second send).
- ✅ Inserts to `waitlist_signups`.
- ✅ Resend confirmation, `From` / `Subject` per spec, body PENDING
  TIM APPROVAL.
- ✅ On Resend fail, signup row preserved + `waitlist_send_failed`
  event written.
- 📋 Real signup end-to-end with confirmed inbox delivery.

### Event ingestion
- ✅ `POST /api/webhooks/[source]` accepts JSON, requires
  `x-solodesk-secret`.
- ✅ Writes to `events` with `source`, `payload`, `hash`.
- ✅ Idempotency via partial unique index on `hash`.
- ✅ `createEventAction` server action wired to dashboard form.
- 📋 Both paths confirmed end-to-end (curl + UI screenshot).

### Dashboard shell (app.solodesk.ai)
- ✅ Sidebar: Dashboard, Ventures, Events, Settings.
- ✅ `/dashboard` last 50 events + create form.
- ✅ `/ventures` list with phase badge + north-star.
- ✅ `/ventures/new` form.
- ✅ `/ventures/[slug]` rendered COMPANY.md + venture events.
- ✅ `/settings` placeholder per spec.
- ✅ Geist fonts, shadcn primitives only.

### Seed data
- ⏸ Kounta venture seeded (seed.sql ready, runs in session 2).
- 📋 ≥ 3 manual events created via the form.
- 📋 ≥ 1 test waitlist signup completed end-to-end.

### Quality
- ✅ `pnpm typecheck` clean.
- ✅ `pnpm lint` clean.
- 📋 No console errors on production deploy.
- 📋 Lighthouse ≥ 90 on landing page.
- ⏸ README updated with deploy URLs (after deploy).

### Handoff
- ✅ This document.
- 📋 Screenshots (added by session 2).
- ✅ Curl commands documented.
- ✅ Env vars documented.
- ✅ Test status documented.
- ⏸ Resend confirmation email rendered (after first real send).
- ✅ Exact next step (below).

---

## Exact next step

Tim:

1. Delete the Tokyo Supabase project.
2. Create new Sydney Supabase project; paste URL + anon + service-role
   keys here so I can apply migration 0001 + seed.sql and verify auth
   end-to-end.

(Or: do everything in §"Deploy runbook" yourself if you'd rather drive.
Then open a fresh evaluator session with the prompt at the bottom of
SPRINT.md — that's the adversarial review that closes Sprint 0.)
