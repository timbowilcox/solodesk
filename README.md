# SoloDesk

**Status:** v0 — building Sprint 0 (foundation)
**Owner:** Tim Wilcox
**Domains:**
- `solodesk.ai` — public landing + waitlist
- `app.solodesk.ai` — authenticated application

---

## What this is

SoloDesk is the operating system Tim runs his portfolio of ventures from — Kounta, Counsel, Corum, CaneMate, RealStyler, Realtelligence, plus whatever comes next. It instantiates the TCOS (Tim's Company Operating System) architecture as a Next.js app on Vercel backed by Supabase.

The brand pivots from the older "AI-native business OS for solo founders" framing to **the operating system for portfolio operators** — people running 2-6 ventures with agents instead of teams. The five-agent / three-layer Context Architecture from the prior SoloDesk concept is superseded by the TCOS ten-loop architecture documented in `/TCOS.md`.

The intent is to run it for ~6 months across all live ventures (Apr-Oct 2026), learn what compounds and what's friction, then make a productisation call on **1 November 2026**. Decision criteria below.

## What this isn't (yet)

- Not a productised SaaS yet. Single user (Tim) + invited members in v0.
- Not a CRM, project tool, or Notion replacement.
- Not multi-tenant in v0 — RLS off. Multi-tenant comes at productisation, not before.
- Not a replacement for Claude Code. SoloDesk *augments* Claude Code by being the substrate that captures, queries, and reviews everything Claude Code produces across ventures.

## Architecture (three layers)

```
Layer 3 — Human (Tim, plus invited members later)
  Conviction, spec quality, approve/kill. Nothing else.

Layer 2 — Agent workforce (skills + loops)
  Generation agents + adversarial critics. Defined in /.claude/skills.
  Loop definitions in /.claude/loops.
  Every agent invocation goes through buildAgentPrompt — never manual prompts.

Layer 1 — Intelligence substrate (this Next.js app + Supabase)
  Storage:    events, decisions, artifacts, loop_runs, metrics
  Memory:     pgvector embeddings on decisions + artifacts + memories + venture_chunks
              recallContext() does semantic search, hard-scoped to one venture
  Webhooks:   Stripe, Resend, Vercel, GitHub, support inbox land in events
  Cron:       Daily metrics rollup; 5-min backlog cron embeds anything missing.
```

## Domain layout

| Domain | Purpose | Auth |
|---|---|---|
| `solodesk.ai` | Marketing landing + waitlist email capture | None (public) |
| `app.solodesk.ai` | Authenticated app — ventures, loops, dashboards | Magic link, allowlist + role |
| `app.solodesk.ai/api/webhooks/[source]` | Webhook ingestion (Stripe, GitHub, etc) | Shared secret header |
| `app.solodesk.ai/api/waitlist` | Waitlist signup endpoint (called from landing) | Public, rate-limited |

Hostname routing handled in `/middleware.ts`. Single Next.js project, single Vercel deploy, two domains.

## Stack

- Next.js 16 (App Router) on Vercel `syd1`
- Supabase (own project, separate from mm-hub)
- Auth: Supabase Auth, magic link, `allowed_users` table allowlist + role (admin/member)
- Email: Resend (waitlist confirmations + future digests)
- Inference: Anthropic SDK, `claude-opus-4-7` for generation, `claude-haiku-4-5-20251001` for cheap classification
- Cron: Vercel Cron Jobs (introduced Sprint 2)
- Webhooks: `/api/webhooks/[source]` route handlers, idempotent by hash

## Per-venture model

Every venture has:
- A row in `ventures`
- A COMPANY.md (stored in `ventures.company_md`, see `/COMPANY.template.md`)
- A subset of loops enabled (configured in `ventures.loops_enabled` jsonb)
- Webhooks pointing into `/api/webhooks/<source>?venture=<slug>`

## Bootstrap order

1. Read `CLAUDE.md` — initialiser spec for any Claude Code session in this repo
2. Read `ROADMAP.md` — sprint sequence
3. Read `SPRINT.md` — current sprint scope
4. Run the sprint. Commit `HANDOFF.md` at session end. Open evaluator session.
5. Repeat.

## File map

```
solodesk/
├── CLAUDE.md                       # Initialiser spec
├── ROADMAP.md                      # Full sprint sequence
├── SPRINT.md                       # Current sprint
├── HANDOFF.md                      # Created at end of each session
├── COMPANY.template.md             # Per-venture COMPANY.md template
├── supabase/migrations/            # SQL migrations
├── .claude/
│   ├── skills/                     # Agent skill definitions (SKILL.md per skill)
│   ├── loops/                      # Loop definitions (one md per loop)
│   ├── rubrics/                    # Quality rubrics per loop/agent
│   └── runbooks/                   # Operational procedures
├── specs/                          # Feature specs (versioned)
├── dashboards/                     # SQL view definitions
├── content/                        # Marketing artifacts (Loop 4 outputs)
├── support/                        # Triage templates (Loop 6 outputs)
├── ventures/                       # Per-venture config + COMPANY.md
└── .archive/
    ├── handoffs/                   # Historical HANDOFF.md
    └── decisions/                  # ADRs and Loop 1 outputs
```

## Anti-patterns (hard rules)

- No multi-tenant code in v0. Single org logically. RLS off. Enable when productising.
- No agent ever writes to production data without an approval gate.
- No agent ever touches payments, credentials, or sends communications on behalf of any human.
- No cross-venture context contamination. Every agent invocation scopes to one venture.
- No skill ships without an adversarial critic counterpart.
- No loop ships without a budget (max tokens, max cost, max latency).
- Marketing landing stays minimal until there's something real to show — no public promotion of the waitlist before Sprint 4 at earliest.

## Decision: 1 November 2026 productise/don't gate

Binary call on whether SoloDesk goes from internal tool to productised SaaS. Decision criteria:

- Has it survived 6 months without major rebuild?
- Has the rubric library actually compounded (measurable: rejection rate of agent outputs at 4-6 weeks vs at month 5)?
- Is there at least one second design partner who'd pay $200/mo for it?
- Has Anthropic shipped native features that make 60%+ of SoloDesk redundant?
- Is the waitlist signal real (not vanity — actual conversations with signups confirming pain)?

Don't drift past this date.
