# SoloDesk — Sprint 0 deploy verification runbook

This is the work between Sprint 0 build session 1 (code shipped) and Sprint 0 evaluator (independent verification). One person (Tim), roughly 45 minutes of active work, plus DNS propagation waiting in the background.

Order matters — Supabase first because Vercel needs the keys, DNS in parallel with everything else because it's the slowest, evaluator session last because it tests against a live deployed app.

---

## Pre-flight check (5 min)

Before you start, confirm in the SoloDesk repo at `C:\dev\solodesk`:

- [ ] `git status` clean (Sprint 0 build session 1 commits all pushed)
- [ ] `git log --oneline | head -10` shows 8+ commits from Sprint 0 build
- [ ] You have your password manager open with these to hand:
  - Supabase Sydney project URL, anon key, service role key
  - Resend API key (the one starting `re_…`)
  - WEBHOOK_SECRET 64-char hex (generated in PowerShell earlier)
  - CRON_SECRET 64-char hex
  - GoDaddy login
  - Vercel login (personal account, `tim's projects`)
- [ ] Thunderbird is open with `tim@solodesk.ai` inbox accessible

If any of those aren't ready, sort them before opening the runbook.

---

## Step 1 — Apply migration + seed Supabase (10 min)

You already created the Sydney Supabase project (`bahocpuzgrdtcrulicqz.supabase.co`). The schema isn't applied yet.

### 1a. Apply the migration

Open Supabase Dashboard → your project → **SQL Editor** → New query.

Copy the entire contents of `C:\dev\solodesk\supabase\migrations\0001_initial_schema.sql` into the editor. Hit **Run**.

Expected: `Success. No rows returned.`

### 1b. Verify all 10 tables exist

Run this query:
```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Expected rows (10 total): `allowed_users`, `anomalies`, `artifacts`, `decisions`, `events`, `loop_runs`, `metric_snapshots`, `support_tickets`, `ventures`, `waitlist_signups`.

If any are missing, the migration didn't run cleanly — check the SQL editor's error pane and re-run.

### 1c. Seed the admin user and Kounta venture

In the SQL editor, paste and run:

```sql
-- Seed Tim as admin
insert into allowed_users (email, role, active)
values ('tim@solodesk.ai', 'admin', true)
on conflict (email) do nothing;

-- Seed Kounta venture stub
insert into ventures (slug, name, phase, north_star, company_md)
values (
  'kounta',
  'Kounta',
  'build',
  'MRR',
  'AI-native accounting infrastructure. COMPANY.md to be filled in Sprint 1.'
)
on conflict (slug) do nothing;

-- Verify
select email, role from allowed_users;
select slug, name, phase from ventures;
```

Expected: one allowed_users row (`tim@solodesk.ai`, admin), one ventures row (`kounta`, Kounta, build).

### 1d. Configure Auth URLs

Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL:** `https://app.solodesk.ai`
- **Redirect URLs (add both):**
  - `https://app.solodesk.ai/auth/callback`
  - `http://localhost:3000/auth/callback`

Hit **Save**.

This is the single most-missed step in Supabase auth setup. If magic links land on the wrong URL or Supabase rejects the callback, this is why.

---

## Step 2 — Paste env vars into Vercel (5 min)

Vercel Dashboard → `tim's projects` → **solodesk** → **Settings** → **Environment Variables**.

Add each of these. Apply to **Production**, **Preview**, and **Development** for all of them (one checkbox triple-click per var):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bahocpuzgrdtcrulicqz.supabase.co` | from Supabase → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (paste anon key) | starts `eyJ…` |
| `SUPABASE_SERVICE_ROLE_KEY` | (paste service role key) | starts `eyJ…`, KEEP SECRET |
| `RESEND_API_KEY` | (paste Resend key) | starts `re_…` |
| `WEBHOOK_SECRET` | (paste 64-char hex) | from your password manager |
| `CRON_SECRET` | (paste 64-char hex) | from your password manager |
| `ALLOWED_EMAIL` | `tim@solodesk.ai` | seed admin email check |
| `ANTHROPIC_API_KEY` | (paste your Anthropic key) | not used in Sprint 0 but needed for 0.5+ |
| `VOYAGE_API_KEY` | (paste your Voyage key) | not used in Sprint 0 but needed for 0.5+ |

After saving, trigger a fresh deploy: Vercel → **Deployments** → top deployment → **⋯** menu → **Redeploy** → confirm. This pulls in the new env vars.

---

## Step 3 — Add domains to Vercel + configure DNS at GoDaddy (15 min active, ~30 min DNS propagation)

Do this concurrently with Step 4 — DNS propagates in the background.

### 3a. Add the three domains in Vercel

Vercel → solodesk → **Settings** → **Domains**.

Click **Add** and add each in turn:
1. `solodesk.ai`
2. `www.solodesk.ai`
3. `app.solodesk.ai`

After adding each, Vercel shows the exact DNS records you need to add at GoDaddy. **Take a screenshot of each instruction** — what Vercel tells you is authoritative; the values below are what they typically are but check Vercel's dashboard for the exact values.

### 3b. Add DNS records at GoDaddy

GoDaddy → **My Products** → `solodesk.ai` → **DNS**.

You'll likely add three records (verify against what Vercel told you in 3a):

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` | 1 hour (default) |
| CNAME | `www` | `cname.vercel-dns.com` | 1 hour |
| CNAME | `app` | `cname.vercel-dns.com` | 1 hour |

**Important — don't break Resend or Migadu:**

You already have records at GoDaddy for:
- **Resend** — TXT records (`_resend`, `resend._domainkey`) — keep them, don't touch
- **Migadu** — MX records pointing to `aspmx1.migadu.com` and `aspmx2.migadu.com` — keep them, don't touch

You're only adding the three new records above. You're not editing or deleting anything else. If GoDaddy's DNS interface tries to "simplify" and offers to remove conflicting records, decline.

### 3c. Wait for SSL

Back in Vercel → Domains. Each of the three domains shows a status that progresses from **Configuring** → **Issuing certificate** → **Valid** (with a green check).

Apex (`solodesk.ai`) and `www.` usually go green within 5-10 minutes once DNS resolves. `app.` is the same. If anything's still red after 30 minutes, the most likely cause is a typo in the GoDaddy DNS record — re-check against Vercel's instructions.

While waiting, you can do Step 4 in parallel.

---

## Step 4 — Run the verification curl battery (10 min, do once SSL is green)

Open PowerShell. Don't do this until all three domains in Vercel show green SSL.

For each curl below: paste, run, check the response matches expected. Tick the box if it passes.

### 4a. Hostname routing

```powershell
# solodesk.ai serves landing only
curl.exe -I https://solodesk.ai/
# Expected: HTTP/2 200

curl.exe -I https://solodesk.ai/dashboard
# Expected: HTTP/2 302  (redirects to /)

# app.solodesk.ai serves the app
curl.exe -I https://app.solodesk.ai/
# Expected: HTTP/2 302  (redirects to /login)

curl.exe -I https://app.solodesk.ai/dashboard
# Expected: HTTP/2 302  (redirects to /login because not authed)

curl.exe -I https://app.solodesk.ai/login
# Expected: HTTP/2 200
```

- [ ] All five hostname routing checks pass

### 4b. Waitlist endpoint (only reachable on solodesk.ai)

```powershell
# Real signup — should send confirmation email
curl.exe -X POST https://solodesk.ai/api/waitlist `
  -H "content-type: application/json" `
  -d '{\"email\":\"tim+wl1@solodesk.ai\"}'
# Expected: {"status":"ok"} (or similar success shape)

# Same email again — no second email
curl.exe -X POST https://solodesk.ai/api/waitlist `
  -H "content-type: application/json" `
  -d '{\"email\":\"tim+wl1@solodesk.ai\"}'
# Expected: {"status":"ok","duplicate":true} (or similar)
```

- [ ] First call returns success
- [ ] Confirmation email arrives in `tim@solodesk.ai` inbox via Thunderbird (within 60 seconds)
- [ ] Second call returns duplicate, no second email

### 4c. Webhook endpoint (only reachable on app.solodesk.ai, requires secret)

You'll need your `WEBHOOK_SECRET` from the password manager. In PowerShell, set it as a variable so it doesn't end up in shell history:

```powershell
$WS = "paste-your-64char-hex-here"

# Valid webhook
curl.exe -X POST https://app.solodesk.ai/api/webhooks/manual `
  -H "content-type: application/json" `
  -H "x-solodesk-secret: $WS" `
  -d '{\"type\":\"smoke_test\",\"note\":\"hello\"}'
# Expected: {"status":"ok","id":"<some uuid>"}

# Same payload again — should be detected as duplicate
curl.exe -X POST https://app.solodesk.ai/api/webhooks/manual `
  -H "content-type: application/json" `
  -H "x-solodesk-secret: $WS" `
  -d '{\"type\":\"smoke_test\",\"note\":\"hello\"}'
# Expected: {"status":"duplicate"}

# Wrong secret
curl.exe -X POST https://app.solodesk.ai/api/webhooks/manual `
  -H "content-type: application/json" `
  -H "x-solodesk-secret: wrong" `
  -d '{\"type\":\"x\"}'
# Expected: HTTP 401

# Webhook endpoint is NOT reachable on solodesk.ai
curl.exe -X POST https://solodesk.ai/api/webhooks/manual `
  -H "content-type: application/json" `
  -H "x-solodesk-secret: $WS" `
  -d '{\"type\":\"x\"}'
# Expected: 302 redirect or 404 — NOT a successful 200
```

- [ ] Valid webhook returns ok with a uuid
- [ ] Duplicate detected
- [ ] Wrong secret returns 401
- [ ] Webhook endpoint not reachable on landing domain

### 4d. Auth — non-allowlisted email (no enumeration leak)

In a browser, go to `https://app.solodesk.ai/login`.

Submit a fake email like `randomstranger@example.com`.

Expected behaviour:
- Page shows "Check your email" success state (same as a valid email — this is the no-enumeration design)
- No magic link is actually sent to `randomstranger@example.com`
- In Supabase Dashboard → Authentication → Users, NO new user should appear

- [ ] Form submits, shows generic success
- [ ] No user created in Supabase auth
- [ ] No row inserted into any table

### 4e. Auth — allowlisted (tim@solodesk.ai)

Same login page. Submit `tim@solodesk.ai`.

- [ ] "Check your email" success shows
- [ ] Magic link arrives in Thunderbird within 60 seconds
- [ ] Clicking the magic link lands on `https://app.solodesk.ai/dashboard`
- [ ] Dashboard renders with sidebar visible (Dashboard, Ventures, Events, Settings)
- [ ] No console errors (open DevTools → Console)

---

## Step 5 — Manual UI smoke + screenshots (10 min)

While logged in:

1. **Dashboard** — confirm event feed shows the test events you created via curl. Confirm "Create event manually" form renders.
2. **Ventures list** — `/ventures` shows Kounta with a phase badge.
3. **Kounta venture detail** — click into Kounta. Confirm the COMPANY.md stub renders.
4. **Create new venture** — `/ventures/new`, create a test venture (you can delete the row later via SQL). Confirm it lands on the new venture detail.
5. **Sign out** — confirm sign-out returns you to `/login`.

Take screenshots of each page (the evaluator session will check them).

- [ ] Dashboard
- [ ] Ventures list
- [ ] Venture detail (Kounta)
- [ ] New venture form
- [ ] Login page (signed out)
- [ ] Landing page (`solodesk.ai/`)

Save these screenshots into `C:\dev\solodesk\.archive\handoffs\sprint-00-eval-screenshots\` (create the folder).

---

## Step 6 — Lighthouse on landing (3 min)

Open `https://solodesk.ai/` in Chrome (incognito, no extensions interfering).

DevTools → **Lighthouse** tab → Mode: Navigation, Categories: all four, Device: Desktop → **Analyze page load**.

Target: all four categories ≥ 90. Note: design-system.md upgraded the accessibility floor to ≥ 95, but for Sprint 0 the original target of 90 stands — Sprint 1's design migration handles the lift to 95.

Screenshot the Lighthouse result. Save to the same screenshots folder.

- [ ] Performance ≥ 90
- [ ] Accessibility ≥ 90
- [ ] Best Practices ≥ 90
- [ ] SEO ≥ 90

If any below 90: don't block on it — note in the eval HANDOFF as a Sprint 0 follow-up.

---

## Step 7 — Write the deploy-verification HANDOFF (5 min)

Create a new HANDOFF file at `C:\dev\solodesk\.archive\handoffs\sprint-00-deploy-handoff.md`.

Use this template — fill it in honestly:

```markdown
# Handoff: Sprint 0 — Foundation (deploy verification, session 2 of 2)

Date: [today]
Session type: Deploy verification (Tim drove, no Claude Code session)

## What was completed
- Supabase Sydney migration applied + seeded
- Vercel env vars (all 9) populated for Production + Preview + Development
- DNS at GoDaddy: A record for solodesk.ai, CNAMEs for www and app
- All three domains green in Vercel with valid SSL
- Hostname routing curl battery: all 5 checks pass
- Waitlist endpoint: real submission + confirmation email + duplicate detection working end-to-end
- Webhook endpoint: valid + duplicate + wrong-secret + cross-host all behave correctly
- Auth: non-allowlisted email silently rejected (no enumeration leak), allowlisted email magic link round-trips
- Manual UI smoke complete, screenshots in .archive/handoffs/sprint-00-eval-screenshots/
- Lighthouse on landing: P [N], A [N], BP [N], SEO [N]

## What is NOT done
- [Anything that didn't pass — be honest. e.g. "Lighthouse Accessibility came in at 87, needs Sprint 1 design migration to hit 95"]

## Sprint 0 acceptance criteria — final status
- [Walk through the original SPRINT.md acceptance list, mark each done/blocked]

## Exact next step
Open a fresh Claude Code session in C:\dev\solodesk. Paste the evaluator
prompt (in conversation with Tim's Claude.ai chat). When the evaluator
session scores ≥ 7, Sprint 0 is closed and Sprint 0.5 (memory layer) begins.

## Files added/changed in this session
- supabase migration applied (no file changes)
- Vercel env vars (no file changes)
- GoDaddy DNS records added
- New screenshots in .archive/handoffs/sprint-00-eval-screenshots/

## Anything weird that happened
- [Note any DNS propagation oddities, Resend delays, anything that took longer than expected]
```

Commit it:

```powershell
cd C:\dev\solodesk
git add .archive\handoffs\
git commit -m "Sprint 0 deploy verification complete"
git push
```

---

## Step 8 — Open the evaluator session (15 min, mostly Claude Code working)

Open Claude Code in a **fresh terminal** at `C:\dev\solodesk`. Don't continue any prior session.

Paste this exact prompt:

```
You are the evaluator agent for SoloDesk Sprint 0, both build sessions
combined. Read CLAUDE.md, ROADMAP.md, SPRINT.md, the original
HANDOFF.md from build session 1, and the new
.archive/handoffs/sprint-00-deploy-handoff.md before doing anything else.

Also read /.claude/design-system.md and
/.claude/decision-document-interface.md so you understand the design
direction the project has locked in (these specs apply from Sprint 1
onwards — Sprint 0 used shadcn defaults, which is fine, but Sprint 1
migration is the very next sprint after 0.5).

Your job: find what's wrong, incomplete, insecure, or inconsistent.
Approve only if certain Sprint 0 is genuinely sound. Treat the live
deploy as in-scope for verification — Tim drove the deploy and
documented it in sprint-00-deploy-handoff.md.

Specifically:

1. Run `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`,
   `pnpm build`. Report any errors. Anything not clean = not done.

2. Apply migration 0001 against the live Sydney Supabase project (URL
   in HANDOFF). If Tim has already applied it, run `\d <table>` against
   each of the 10 tables and confirm structure matches the migration.

3. Verify the seed: one allowed_users row for tim@solodesk.ai with
   role=admin, one ventures row for kounta with phase=build.

4. Inspect proxy.ts (or middleware.ts). Trace what happens for these
   requests by reading the code:
   - GET solodesk.ai/dashboard → expect 302 to /
   - GET app.solodesk.ai/ unauthenticated → expect 302 to /login
   - GET app.solodesk.ai/login → expect 200, public
   - GET app.solodesk.ai/api/webhooks/manual with no secret → expect 401
   - GET solodesk.ai/api/webhooks/manual → expect 404 or redirect
   Confirm by reading code, not assumptions.

5. Read /events/page.tsx and /dashboard/page.tsx. Are they sharing the
   same component or duplicating logic? Flag if duplicated; acceptable
   if a shared component is reused with different props.

6. Audit allowlist enforcement: trace the login → callback → middleware
   path. Is there any way an authenticated Supabase session for a
   non-allowlisted email could access /dashboard? Walk through the code.

7. Check no real secret exists anywhere in the repo:
   git log --all --full-history -p | Select-String -Pattern "eyJ|sk_|re_|sb_"
   Or equivalent on your shell. Anything matching = security failure.

8. Verify .env.local is in .gitignore (line by line, not just glob).

9. Hash determinism: confirm tests in tests/lib/events/hash.test.ts
   still pass and cover:
   - Same input → same hash, always
   - Reordered JSON keys → same hash
   - Different source → different hash
   - Different venture → different hash

10. Read the WAITLIST_BODY constant in lib/resend.ts. Confirm it matches
    what Tim approved (he's noted the approved version in the original
    HANDOFF).

11. For every acceptance criterion in SPRINT.md, mark it ✅ done,
    📋 verified in deploy session, or ❌ failed. Report all ❌.

12. Score each rubric criterion 1-5. Anything below target → not done.
    Score the overall Sprint 0 (both sessions combined) 1-10.

If Sprint 0 scores ≥ 7, approve it as evaluator-passed.
Sprint 0.5 (memory layer) becomes the next sprint when this passes.

Do not approve unless you have actually run the commands. Do not trust
the handoffs blindly — verify against the code and the live deployment.
```

Let it run. It will probably take 15-25 minutes of Claude Code working through the checklist.

When it returns a score:
- **≥ 7:** Sprint 0 closed. Move to Sprint 0.5.
- **5-6:** open a quick fix session for the specific issues, re-run evaluator.
- **< 5:** something's structurally wrong, share the eval output with me before deciding next steps.

---

## When you're done

Send me the evaluator session's final score and any flagged issues. I'll review before you open Sprint 0.5.

After Sprint 0.5 passes evaluator, you're at the start of Sprint 1, which is the design migration + Document substrate work — that's where the design system spec actually lands in the running app.

---

## Likely problems and fixes

**DNS not propagating after 30 min.** Use `dig solodesk.ai` or `nslookup solodesk.ai` to check what the world is seeing. If the answer is empty or wrong, the GoDaddy record didn't save — re-check.

**SSL stuck on "Issuing certificate" for over 20 min.** Usually means DNS isn't fully resolving yet. Vercel will retry automatically. If still stuck after an hour, remove and re-add the domain in Vercel.

**Magic link arrives but lands on a 404 or "invalid redirect."** Auth URLs in Supabase weren't configured. Re-do step 1d.

**Magic link never arrives in Thunderbird.** Check Thunderbird's spam folder. Then check Supabase Dashboard → Authentication → Logs to see if the email was sent. If yes and not received, Migadu/SPF issue at GoDaddy DNS — verify Migadu MX records intact.

**Waitlist confirmation email doesn't arrive.** Check Resend Dashboard → Logs for the actual send attempt. If Resend says "delivered" and you don't see it, check spam, then check Migadu's incoming logs.

**`pnpm test` fails in the evaluator session but passed in build.** Probably an env var difference — make sure your local has the same `.env.local` as Vercel (minus the secrets that should only live in Vercel).
