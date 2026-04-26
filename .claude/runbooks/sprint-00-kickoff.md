# Sprint 0 Kickoff Prompt

Paste this into a fresh Claude Code session opened in the new SoloDesk repo directory.

---

```
I'm starting Sprint 0 of the SoloDesk project. SoloDesk is the operating system I run my
portfolio of ventures from (Kounta, Counsel, Corum, CaneMate, RealStyler, Realtelligence).
The architecture is in /TCOS.md and the build is governed by my agent-harness skill.

Two domains: solodesk.ai (public landing + waitlist) and app.solodesk.ai (the authed
app). Single Next.js project, hostname-based routing in middleware.

Before doing anything else:

1. Read /CLAUDE.md fully. It encodes stack decisions, naming conventions, agent rules,
   hostname routing, auth model, and anti-patterns. Do not deviate.
2. Read /ROADMAP.md to understand the full sprint sequence.
3. Read /SPRINT.md (Sprint 0) for current scope and acceptance criteria.
4. Read /supabase/migrations/0001_initial_schema.sql so you understand the data model
   you're building UI on top of.

Then build Sprint 0 to spec. Acceptance criteria in SPRINT.md are the contract — do not
claim done unless every box is provably ticked, with proof captured in HANDOFF.md.

Hard rules:
- Do not exceed scope. Sprint 0 is substrate only — no agents, no loops, no real
  webhook integrations beyond the stub endpoint.
- The waitlist landing page is minimal: hero + email form. No marketing copy beyond
  one positioning sentence.
- Auth is allowlist-with-role. Tim is the sole admin. Non-allowlisted emails get
  silently rejected (no enumeration leak).
- Resend confirmation email must actually deliver to a real inbox before sprint is
  considered done. Domain verification (SPF/DKIM/DMARC) is part of the work.
- Commit small. Sensible messages. No `wip` commits.
- If you hit something ambiguous, stop and ask. Don't invent.
- If context fills up, stop, write HANDOFF.md, commit, and tell me to start a fresh
  session.

When you finish, write HANDOFF.md per the agent-harness template. Then I'll open an
evaluator session using the adversarial review prompt at the bottom of SPRINT.md.

Confirm you've read CLAUDE.md, ROADMAP.md, SPRINT.md, and the migration before starting.
```

---

## Pre-build checklist (do BEFORE the first session)

Things only Tim can do:

- [ ] Confirm `solodesk.ai` is registered and DNS is manageable
- [ ] Create Supabase project (or have it ready to be created in-session)
- [ ] Create Resend account, prepare DNS records for domain verification
- [ ] Have these ready as env vars to paste:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`
  - `WEBHOOK_SECRET` (generate a strong random string)
  - `CRON_SECRET` (generate a strong random string — for Sprint 0.5 onwards)
  - `ALLOWED_EMAIL` — Tim's primary email for the seed admin row
  - `ANTHROPIC_API_KEY` (not strictly needed in Sprint 0 but seed it now)
  - `VOYAGE_API_KEY` (needed in Sprint 0.5 — set up a Voyage AI account during Sprint 0 if you can, so DNS / domain verification + Voyage account creation happen in parallel)

## After build session ends

1. Confirm `HANDOFF.md` is committed
2. Open a fresh Claude Code session in the same directory
3. Paste the adversarial review prompt from the bottom of SPRINT.md
4. Let the evaluator run. If it scores below 7, open a fix session
5. When evaluator score ≥ 7, archive HANDOFF.md to `.archive/handoffs/sprint-00-build.md` and `.archive/handoffs/sprint-00-eval.md`
6. **Next sprint is Sprint 0.5 (Memory Layer)**, not Sprint 1. Copy contents of `/.claude/sprints/sprint-0.5-memory-layer.md` into root `SPRINT.md` and begin a fresh session.

## Likely Sprint 0 surprises

Things that historically eat time and that the build session should plan for:

- **Domain verification at Resend.** DNS propagation can take an hour. Don't let this block other work — start the verification first, then build everything else while it propagates.
- **Vercel domain SSL.** Same propagation issue. Start it early.
- **Supabase Auth callback URLs.** Easy to misconfigure for two domains. The callback should always go to `app.solodesk.ai/auth/callback`, even when initiated from a context that thinks it's elsewhere.
- **Hostname routing in dev.** `localhost` doesn't have hostnames. Make sure the dev experience is sane — most likely you want localhost to behave as `app.solodesk.ai` and have a separate `/landing-preview` route for testing the marketing page locally.
- **Idempotency hashing.** The hash for waitlist dedupe is just `email`. The hash for webhook events is `sha256(source||venture||stable_payload)`. Get this right or you'll either drop legitimate events or accept duplicates.
