# SoloDesk

**Status:** Phase A (substrate) complete in code · Phase B (autonomy + modal foundation) in progress
**Owner:** Tim Wilcox
**Domains:**
- `solodesk.ai` — public landing + waitlist
- `app.solodesk.ai` — authenticated application

---

## What this is

SoloDesk is the operating system Tim runs his portfolio of ventures from — Kounta, Counsel, Corum, CaneMate, RealStyler, Realtelligence, plus whatever comes next. It instantiates the TCOS (Tim's Company Operating System) architecture as a Next.js app on Vercel backed by Supabase.

The brand is **the operating system for portfolio operators** — people running 2-6 ventures with agents instead of teams. The TCOS ten-loop architecture is documented in `/TCOS.md`.

Phase A shipped the substrate: storage, memory, design migration, the Document/Section/Comment primitive, the connections layer, the loop scheduler, the live loops (Strategy / Content / Intel / Support / Metrics), and the experience-layer surfaces (venture identity, the Bridge, the Watch, the Day, streaming Sections, command bar, Loop 8 reactive).

Phase B is the autonomy + modal foundation — Advise / Operate / Steward levels, gateway enforcement, guardrails, trust ratchet, kill switch, and the eight Atrium modal archetypes that become the calm-first interruption layer. Specs in `AUTONOMY-MODEL.md` and `MODAL-ARCHETYPES.md`.

Phase C — productisation — happens when Phase B is mature and the productise criteria below are met.

## What this isn't (yet)

- Not a productised SaaS yet. Single user (Tim) + invited members in v0.
- Not a CRM, project tool, or Notion replacement.
- Not multi-tenant in v0 — RLS off. Multi-tenant comes at productisation, not before.
- Not a replacement for Claude Code. SoloDesk *augments* Claude Code by being the substrate that captures, queries, and reviews everything Claude Code produces across ventures.

## Architecture (three layers + autonomy gateway)

```
Layer 3 — Human (Tim, plus invited members later)
  Conviction, spec quality, approve/kill. Nothing else.

Layer 2 — Agent workforce (skills + loops)
  Generation agents + adversarial critics. Defined in /.claude/skills.
  Loop definitions in /.claude/loops.
  Every agent invocation goes through buildAgentPrompt — never manual prompts.
  Every tool call goes through the autonomy gateway — never directly to the SDK.

Layer 1.5 — Autonomy control plane (Phase B)
  autonomy_levels:  who can do what at what level (operator/venture/loop/skill)
  guardrails:       declarative limits (budget, recipient, time, volume, voice)
  escalations:      anomaly + breach records
  actions:          full audit trail (every tool call, every level)
  modal_events:     every modal surfacing, for trust ratchet and frequency budgets
  gateway:          the only enforcement point

Layer 1 — Intelligence substrate (this Next.js app + Supabase)
  Storage:    events, decisions, artifacts, loop_runs, metrics, documents, sections
  Memory:     pgvector embeddings on decisions + artifacts + memories + venture_chunks
              recallContext() does semantic search, hard-scoped to one venture
  Webhooks:   Stripe, Resend, Vercel, GitHub, support inbox land in events
  Cron:       Daily metrics rollup; 5-min backlog cron embeds anything missing.
              Loop 8 threshold cron fires reactive investigations on ±2σ moves.
```

## Domain layout

| Domain | Purpose | Auth |
|---|---|---|
| `solodesk.ai` | Marketing landing + waitlist email capture | None (public) |
| `app.solodesk.ai` | Authenticated app — ventures, loops, dashboards, modals | Magic link, allowlist + role |
| `app.solodesk.ai/api/webhooks/[source]` | Webhook ingestion (Stripe, GitHub, etc) | Shared secret header |
| `app.solodesk.ai/api/waitlist` | Waitlist signup endpoint (called from landing) | Public, rate-limited |

Hostname routing handled in `/middleware.ts`. Single Next.js project, single Vercel deploy, two domains.

## Stack

- Next.js 16 (App Router) on Vercel `syd1`
- Supabase (own project, separate from mm-hub)
- Auth: Supabase Auth, magic link, `allowed_users` table allowlist + role (admin/member)
- Email: Resend (waitlist confirmations + future digests)
- Inference: Anthropic SDK, `claude-opus-4-7` for generation, `claude-haiku-4-5-20251001` for cheap classification
- Cron: Vercel Cron Jobs
- Webhooks: `/api/webhooks/[source]` route handlers, idempotent by hash
- Autonomy gateway (Phase B): the only path between any agent and any tool

## Per-venture model

Every venture has:
- A row in `ventures`
- A COMPANY.md (stored in `ventures.company_md`, see `/COMPANY.template.md`)
- A subset of loops enabled (configured in `ventures.loops_enabled` jsonb)
- A per-scope autonomy level (Phase B — defaults to Operate at venture scope, Advise at skill scope until trust is earned)
- Webhooks pointing into `/api/webhooks/<source>?venture=<slug>`

## Bootstrap order

1. Read `CLAUDE.md` — initialiser spec for any Claude Code session in this repo
2. Read `ROADMAP.md` — phase + sprint sequence
3. Read `SPRINT.md` — current sprint scope
4. Read `AUTONOMY-MODEL.md` and `MODAL-ARCHETYPES.md` — the Phase B canon
5. Run the sprint. Commit `HANDOFF.md` at session end. Open evaluator session.
6. Repeat.

## File map

```
solodesk/
├── CLAUDE.md                       # Initialiser spec
├── ROADMAP.md                      # Phase + sprint sequence
├── SPRINT.md                       # Current sprint
├── HANDOFF.md                      # Created at end of each session
├── AUTONOMY-MODEL.md               # Autonomy control plane spec (Phase B canon)
├── MODAL-ARCHETYPES.md             # Atrium modal language spec (Phase B canon)
├── COMPANY.template.md             # Per-venture COMPANY.md template
├── TCOS.md                         # Architecture doc
├── supabase/migrations/            # SQL migrations
├── .claude/
│   ├── design-system.md            # Chrome design spec (authoritative for non-modal UI)
│   ├── decision-document-interface.md  # Document/Section/Comment primitive spec
│   ├── skills/                     # Agent skill definitions (SKILL.md per skill)
│   ├── loops/                      # Loop definitions (one md per loop)
│   ├── guardrails/                 # Reusable guardrail definitions (Phase B)
│   ├── rubrics/                    # Quality rubrics per loop/agent
│   ├── runbooks/                   # Operational procedures
│   └── sprints/                    # Pre-written future sprint specs
├── lib/
│   ├── autonomy/                   # Gateway + level resolution (Phase B)
│   ├── connections/                # External credential layer (only path to provider creds)
│   ├── memory/                     # pgvector recall helpers
│   ├── agents/                     # buildAgentPrompt + skill orchestration
│   ├── loops/                      # Loop runners + skill definitions
│   ├── modals/                     # Atrium modal primitive + archetypes (Phase B)
│   └── command-bar/                # Router + intent dispatch
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
- No skill ships without a budget (max tokens, max cost, max latency).
- No skill ships without a default autonomy level (Phase B).
- No agent constructs its own prompt — every invocation goes through `buildAgentPrompt()`.
- No agent calls a tool directly — every tool call routes through the autonomy gateway (Phase B).
- No skill checks its own autonomy level — the gateway is the only enforcement point (Phase B).
- No agent writes flat artifacts — every loop output is a Document with typed Sections (per `/.claude/decision-document-interface.md`).
- No critic ships a global review note — comments anchor to specific Sections with evidence pointers.
- No modal pulled outside the eight Atrium archetypes (Phase B). If an event doesn't fit one, don't surface it.
- No new modal archetype without spec update in `MODAL-ARCHETYPES.md`.
- No design defaults from shadcn or AI-startup convention. Chrome rules live in `/.claude/design-system.md`; modal rules live in `MODAL-ARCHETYPES.md`. No purple, no gradients, no soft shadows on chrome, no rounded chrome cards, no Geist, no Lucide, no emoji in chrome.
- Marketing landing stays minimal until there's something real to show.

## Productise decision — criteria (undated)

Binary call on whether SoloDesk goes from internal tool to productised SaaS. The decision is made when these criteria are met, not on a fixed date.

- Has it survived 6+ months of live use without major rebuild?
- Has the rubric library actually compounded (measurable: rejection rate of agent outputs at weeks 4-6 vs at month 5)?
- Has the Section catalogue grown from the Sprint 1 starter kinds into a meaningful library specific to portfolio operation work? (This is the moat — agents commoditise, but a vertical-AI primitive doesn't.)
- **Has Loop 11 (portfolio audit) shipped and run?** Cross-venture meta-loop is the differentiator vs running Claude Code per venture. If Loop 11 didn't ship, the "OS for portfolio operators" claim doesn't hold operationally and the call defaults to "not yet."
- **Has the team-inbound surface shipped, with at least one teammate working a venture's inbox?** Required to demonstrate the platform extends beyond the operator at the centre. Without this, SoloDesk is a single-operator tool, not a portfolio platform.
- **Has the autonomy gateway proven itself across all live loops?** Every tool call routes through it; every promotion has happened against real `eval_runs` data; the kill switch has been pulled at least once in anger and recovered cleanly.
- **Has the modal frequency budget held?** No archetype other than Escalation has breached its hard ceiling in a normal operating week.
- Is there at least one second design partner who'd pay $200/mo for it?
- Has Anthropic shipped native features that make 60%+ of SoloDesk redundant?
- Is the waitlist signal real (not vanity — actual conversations with signups confirming pain)?

Make the call when the checklist is honest. Don't drift past it; don't rush to it.
