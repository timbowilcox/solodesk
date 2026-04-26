# SoloDesk — Roadmap

8 sprints. Sprint 0 ships the substrate. Sprint 0.5 adds the memory layer. Sprints 1-6 each ship one loop on top of memory-aware substrate. After every sprint, you can stop and the system still works — the next sprint just adds capability.

Each sprint is governed by agent-harness: SPRINT.md scope before build, HANDOFF.md at end, evaluator session before merge.

---

## Sprint 0 — Foundation

**Status:** current
**Scope:** Repo setup, Next.js + Supabase + auth, schema, events ingestion, dashboard shell, venture CRUD.
**Loops added:** none.
**Estimated sessions:** 2-3.

DOD highlights:
- Next.js 16 deployed to Vercel `syd1` with custom domain (or vercel.app for now).
- Supabase project provisioned, migration `0001_initial_schema.sql` applied (substrate only — no pgvector or memory tables; those land in Sprint 0.5).
- Auth working — magic link login for Tim only (allowlist single email).
- Webhook ingestion endpoint working: `POST /api/webhooks/[source]` lands an event in `events` with idempotency.
- Manual event creation: `POST /api/events` server action.
- Dashboard shell with sidebar, ventures list, recent events feed.
- One venture seeded (Kounta) with COMPANY.md content stored in `ventures.company_md`.

Full SPRINT.md for this sprint is in repo root.

---

## Sprint 0.5 — Memory layer

**Status:** pre-written (`/.claude/sprints/sprint-0.5-memory-layer.md`)
**Scope:** pgvector enabled, embeddings on decisions/artifacts, new `memories` and `venture_chunks` tables, Voyage AI integration, embedding worker + backlog cron, `recallContext()` and `buildAgentPrompt()` helpers, COMPANY.md chunking, memories UI.
**Loops added:** none directly; foundation for all downstream loops.
**Estimated sessions:** 1-2.

This sprint exists because Sprint 0 ships storage but not retrieval. Without semantic recall, every loop sprint downstream is reduced to keyword filtering by foreign key — which doesn't compound. Sprint 0.5 makes SoloDesk a Level-3 memory system (semantic retrieval over the canonical store) with a credible upgrade path to Level 6 (MCP exposure to other AI tools) deferred to v1.5.

DOD highlights:
- Migration `0002_memory_layer.sql` applied — pgvector, embedding columns, memories + venture_chunks, HNSW indexes, embedding_text triggers.
- Voyage AI integration locked to `voyage-3` (1024 dims).
- Embedding worker handles all four memory surfaces, batched, idempotent, cost-tracked.
- 5-minute backlog cron catches anything the on-write path missed.
- `recallContext({ ventureId, query, k, types, minSimilarity })` returns ranked hits, hard-scoped to one venture.
- `buildAgentPrompt({ skill, ventureId, task, systemSkillPrompt, budgetTokens })` is the only path to construct an agent prompt — every future loop uses this.
- COMPANY.md chunked into `venture_chunks` automatically when updated.
- `/ventures/[slug]/memories` UI for manual capture.
- Cross-venture isolation tested end-to-end.

Full SPRINT.md skeleton in `/.claude/sprints/sprint-0.5-memory-layer.md` — copy into root SPRINT.md when Sprint 0 is approved.

---

## Sprint 1 — Decision log + retrospective (Loop 10)

**Loop type:** workflow (no agent — pure CRUD with structured form).
**Why first:** simplest, proves the substrate works for capturing structured human decisions.
**Scope:** Decision creation form (per-venture), decision list view, retrospective view (decisions older than 30 days with outcome field), weekly digest of decisions made.

DOD highlights:
- `/ventures/[slug]/decisions` page lists decisions with status filter.
- Decision creation form: title, recommendation, alternatives, kill criteria.
- Each decision can be approved/rejected/killed/superseded.
- Outcome field can be backfilled at any time (this is the retrospective).
- Weekly cron generates a digest of decisions made + decisions due for retrospective review.

---

## Sprint 2 — Metrics digest + anomaly detection (Loop 8)

**Loop type:** workflow (digest) + agent (anomaly explanation).
**Why second:** the digest is the daily heartbeat; everything downstream uses it.
**Scope:** Webhook integrations (Stripe, Resend, Vercel, GitHub minimum), SQL views per metric, daily 6am cron generates digest per active venture, anomaly-explainer agent investigates flagged moves.

DOD highlights:
- Webhook handlers for Stripe (payment events), Resend (email events), Vercel (deploy events), GitHub (push/PR events).
- SQL views: `mrr_by_venture`, `email_volume_7d`, `deploy_frequency`, `pr_velocity`.
- Daily cron computes deltas, flags moves >2σ from 30-day mean.
- `metric_snapshots` table populated daily.
- `anomaly-explainer` skill runs when an anomaly is flagged. Writes explanation to `anomalies.explanation`.
- Digest emailed to Tim (Resend) + landed at `/dashboards/daily/[date]`.

---

## Sprint 3 — Strategy / office-hours (Loop 1)

**Loop type:** agent + adversarial critic.
**Why third:** first true two-agent pattern. Validates the dual-skill architecture.
**Scope:** `office-hours` skill (six-question reframe modelled on Gary's GStack version, with COMPANY.md context loaded), `adversarial-strategy` critic skill, decision artifact written to `decisions` table.

DOD highlights:
- `/ventures/[slug]/office-hours` page — kick off a session by typing a startup idea or strategic question.
- `office-hours` skill loads venture's COMPANY.md, asks six forcing questions one at a time, produces recommendation + alternatives + kill criteria.
- `adversarial-strategy` critic runs as second invocation, scores recommendation 1-10, lists weaknesses, suggests reframes. Hard rule: critic must reject if score < 7 with reasons.
- Both runs logged in `loop_runs` with token + cost tracking.
- Output lands in `decisions` table with `status='proposed'` until Tim approves.
- Budget: 50k tokens / $1 per office-hours run.

---

## Sprint 4 — Content drafting + critic (Loop 4)

**Loop type:** agent + adversarial critic.
**Scope:** `content-writer` skill takes a brief + venture context, drafts post/email/thread; `content-critic` skill checks against ICP, voice, anti-patterns from COMPANY.md; publisher gate — draft → review → approve → ship to channel (Resend for email, manual paste for X/LinkedIn in v1).

DOD highlights:
- `/ventures/[slug]/content/new` — brief form (channel, audience hint, CTA, freeform brief).
- `content-writer` produces draft, lands in `artifacts` with `status='draft'`.
- `content-critic` runs automatically, lands review notes on the artifact.
- Tim approves → `status='approved'`. For email: Resend send action. For social: copy-to-clipboard + status update.
- Realtelligence anti-pattern enforced: critic rejects any draft that mentions RealStyler before Nov 2026.
- Budget: 30k tokens / $0.60 per draft+critic cycle.

---

## Sprint 5 — Competitive intel scout (Loop 9)

**Loop type:** agent (with web search) + adversarial critic.
**Scope:** `intel-scout` skill scans defined sources weekly per venture (configured in `ventures.intel_sources` jsonb — competitor sites, X handles, ProductHunt, HN, relevant subreddits), produces digest tagged threat/opportunity/noise; `intel-critic` kills noise and escalates real signals into Loop 1.

DOD highlights:
- `/ventures/[slug]/intel/sources` — configure sources per venture.
- Weekly Friday cron runs `intel-scout` per venture with intel_sources non-empty.
- Output lands in `artifacts` with `loop_name='intel'`, `status='reviewing'`.
- `intel-critic` filters items, flagging real signals.
- High-severity items auto-create a `decisions` row in `proposed` state for Loop 1 follow-up.
- Budget: 100k tokens / $2 per venture per week.

---

## Sprint 6 — Support triage hybrid (Loop 6)

**Loop type:** workflow (classification) + agent (ambiguous escalations).
**Why last:** most complex. Real customer-facing risk. Foundation must be proven first.
**Scope:** Email ingestion (forwarding rule into `/api/webhooks/support`), classifier (haiku — fast, cheap), draft-reply generator (opus — only for tickets needing nuance), human-approve-before-send for v1.

DOD highlights:
- Forwarding rule documented: `support@<venture>.com → ingest@solodesk.<domain>`.
- Webhook lands ticket in `events` + creates row in `support_tickets` (new table).
- `support-triage` skill (haiku-based classifier) runs on ingest: classifies as bug/question/churn-risk/feature-request, writes to `support_tickets.classification`.
- For tickets needing reply: `support-replier` agent (opus) drafts reply using ticket + venture COMPANY.md + relevant docs.
- All replies land as drafts. Tim approves before send.
- Bug class → auto-create `decisions` row tagged for engineering loop.
- Feature-request class → auto-create `decisions` row tagged for strategy loop.
- Budget: classifier 5k tokens / $0.05 per ticket; replier 20k tokens / $0.40 per draft.

---

## After Sprint 6

The system is feature-complete for v0. From here it's:
- Per-venture instantiation (COMPANY.md per venture, intel_sources, support forwarding, webhook setup).
- Rubric tuning. Every Sunday — review week's outputs, update rubrics where reviewers were too soft or too harsh.
- Compounding. Every failure mode → CLAUDE.md or rubric update. The harness should improve weekly.

**Hard gate at 1 November 2026:** make the productise/don't call. Criteria in README.md.
