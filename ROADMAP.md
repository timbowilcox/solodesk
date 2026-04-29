# SoloDesk — Roadmap

8 sprints. Sprint 0 ships the substrate. Sprint 0.5 adds the memory layer. Sprint 1 ships the design migration plus the Document/Section/Comment substrate that all downstream loops reuse. Sprints 2-6 each ship one loop on top of that substrate. After every sprint, you can stop and the system still works — the next sprint just adds capability.

Each sprint is governed by agent-harness: SPRINT.md scope before build, HANDOFF.md at end, evaluator session before merge.

**Authoritative specs that govern every sprint from 1 onwards:**
- `/.claude/design-system.md` — visual language, type, palette, layout grammar, motion, voice.
- `/.claude/decision-document-interface.md` — Document/Section/Comment primitives, agent output contract, per-loop instantiation patterns.

Read both before opening any feature sprint. They supersede shadcn defaults and convention.

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

## Sprint 1 — Design migration + Document substrate + Decision document type (Loop 10)

**Sprint type:** Foundation sprint #2. Builds the load-bearing UI primitive (Documents) plus the design system migration. All downstream loop sprints reuse this work.
**Loop type:** workflow (no agent yet — Loop 10 is structured human decisions; the agent in Loop 1 lands in Sprint 3 and writes Documents of the same shape).
**Why first among feature sprints:** every subsequent loop produces Documents. Get the primitive right once, reuse everywhere. Also: Sprint 0 used shadcn defaults and Geist; the design migration must happen before any new UI is built or it has to be redone twice.
**Estimated sessions:** 3 (was 1-2 in earlier plan; expanded for design migration + Document substrate). Each can be stopped at and the prior work still ships value.

### Sprint 1.0 — Design migration (half session, comes first)

DOD highlights:
- Söhne licensed and installed (or Inter loaded via next/font as fallback if Söhne licence is deferred). Geist removed from the codebase.
- Tailwind v4 `@theme` block replaced with the SoloDesk palette per `/.claude/design-system.md`. No slate, no neutral defaults remain.
- Phosphor icons installed (`@phosphor-icons/react`); Lucide removed from dependencies.
- Every shadcn primitive used in Sprint 0 restyled (Dialog, DropdownMenu, Tooltip, Command). Square corners, no shadows, palette tokens only.
- Existing pages (login, dashboard, ventures, events, settings, landing) audited and rewritten to match the spec — no scope additions, just visual migration.
- Three-letter mono author tags replace any avatar/initials components.
- Empty states rewritten — no motivational copy, no illustrations.
- Reduced-motion preference respected.
- Design audit checklist in HANDOFF: every page screenshot vs design-system.md rules.

### Sprint 1.1 — Document substrate

DOD highlights:
- Migration `0003_documents.sql` adds `documents`, `sections`, `comments` tables per the spec in `/.claude/decision-document-interface.md`. Embedding columns on `sections` (Sprint 0.5 conventions apply).
- Section-kind dispatch system: `<Section>` component renders the right child by `section.kind`. Initial kinds for Sprint 1: `prose`, `recommendation`, `alternatives`, `kill_criteria`, `evidence`, `risk`, `agent_note`, `comment_thread`.
- Per-Section status state machine: `draft → reviewing → approved | revising | rejected | dismissed`. Stored on `sections.status`.
- Comments anchored to Sections, not Documents. Comment evidence pointer required (Zod-enforced — comments without evidence are invalid).
- Document layout matches the mockup: 60px margin / content column / 240px comments column. Section markers in mono uppercase in left margin. Comments in right column with three-letter author tags.
- Server actions: `approveSection`, `reviseSection`, `dismissComment`, `addComment`, `acceptCommentSuggestion`. Each logs to `loop_runs`.
- A Document with `type=decision` and all Sections approved writes a row into the existing `decisions` table — backwards-compatible with Sprint 0 schema.
- Bulk-approve action is one click but records each Section's approval individually for audit.

### Sprint 1.2 — Decision document type + retrospective

DOD highlights:
- `/ventures/[slug]/decisions` — table view of Decision Documents per venture, default-filtered to `status in ('reviewing','active')`, keyboard navigation (j/k/enter/a/x).
- `/ventures/[slug]/decisions/new` — creates a Decision Document with empty Sections, opens in editing mode.
- `/ventures/[slug]/decisions/[id]` — full Document view per the mockup. Tim can edit prose Sections directly, comment, approve per-Section.
- Retrospective: `/decisions?retro=true` shows decisions where `created_at < now() - 30 days` and `status='active'` and outcome empty. Inline outcome editor.
- Outcome notes embed into `memories` table (Sprint 0.5 dependency).
- Weekly Sunday cron creates a digest Document listing decisions due for retrospective.

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
- **Daily Digest is a Document** (`type=daily_digest`) per `/.claude/decision-document-interface.md`, with Section kinds `prose` (headline), `metric_block` (KPIs), `prose` (anomalies list with proposed cause), `agent_note` (unexplained anomalies — yellow flag), `prose` ("Your three decisions today" with Document links).
- Email sent via Resend at 6am links to the Document at `/dashboards/daily/[date]`. Email body is a short summary, not the full digest — the link is the affordance.

---

## Sprint 3 — Strategy / office-hours (Loop 1)

**Loop type:** agent + adversarial critic.
**Why third:** first true two-agent pattern. Validates the dual-skill architecture.
**Scope:** `office-hours` skill (six-question reframe modelled on Gary's GStack version, with COMPANY.md context loaded), `adversarial-strategy` critic skill, decision artifact written to `decisions` table.

DOD highlights:
- `/ventures/[slug]/office-hours` page — kick off a session by typing a startup idea or strategic question.
- `office-hours` skill loads venture's COMPANY.md, asks six forcing questions one at a time, produces a **Decision Document** (the same type Sprint 1 built) with Sections: `recommendation`, `alternatives`, `kill_criteria`, `evidence`, `risk`, and `agent_note` for any ambiguities the agent resolved on its own.
- `adversarial-strategy` critic runs as second invocation, leaves comments anchored to specific Sections (per the spec — no global review notes). Each comment cites a rubric criterion or COMPANY.md anti-pattern.
- Both runs logged in `loop_runs` with token + cost tracking.
- Document lands with `status='reviewing'` on every Section. Tim approves Section-by-Section via the existing Sprint 1 UI. When all Sections approved, a row writes to `decisions` with `status='active'`.
- Decision cannot be approved while it has unresolved `agent_note` Sections — Tim must confirm/revise/defer each.
- Budget: 50k tokens / $1 per office-hours run.

---

## Sprint 4 — Content drafting + critic (Loop 4)

**Loop type:** agent + adversarial critic.
**Scope:** `content-writer` skill takes a brief + venture context, drafts post/email/thread; `content-critic` skill checks against ICP, voice, anti-patterns from COMPANY.md; publisher gate — draft → review → approve → ship to channel (Resend for email, manual paste for X/LinkedIn in v1).

DOD highlights:
- `/ventures/[slug]/content/new` — brief form (channel, audience hint, CTA, freeform brief). Brief becomes the `prose` Section of a Content Document.
- `content-writer` produces a **Content Document** (`type=content`) per `/.claude/decision-document-interface.md`, with Sections: `prose` (brief, Tim-authored), `content_block` (the draft itself), `agent_note` (any voice/audience ambiguities resolved).
- `content-critic` runs automatically, leaves comments anchored to specific paragraphs of the `content_block` Section. Each comment cites the rubric criterion or COMPANY.md voice/anti-pattern hit.
- Tim resolves comments per-section: Accept (apply suggestion), Revise (regenerate that paragraph only — agent never regenerates more than the commented Section), Dismiss (record reason).
- When all Sections approved, send action becomes available — for email: Resend explicit-click send (no auto-send); for social: copy-to-clipboard + status update.
- Realtelligence anti-pattern enforced: critic auto-rejects any draft that mentions RealStyler before Nov 2026.
- Budget: 30k tokens / $0.60 per draft+critic cycle.

---

## Sprint 5 — Competitive intel scout (Loop 9)

**Loop type:** agent (with web search) + adversarial critic.
**Scope:** `intel-scout` skill scans defined sources weekly per venture (configured in `ventures.intel_sources` jsonb — competitor sites, X handles, ProductHunt, HN, relevant subreddits), produces digest tagged threat/opportunity/noise; `intel-critic` kills noise and escalates real signals into Loop 1.

DOD highlights:
- `/ventures/[slug]/intel/sources` — configure sources per venture.
- Weekly Friday cron runs `intel-scout` per venture with intel_sources non-empty.
- Output is an **Intel Digest Document** (`type=intel_digest`) per `/.claude/decision-document-interface.md` — a Document containing a `prose` Section (week's summary) and an `intel_signals_table` Section (Table primitive: rows = signals, columns = source / observation / severity / suggested action / Tim's decision).
- Default view is the Table primitive with severity ≥ medium filter applied. Keyboard navigation (j/k/enter/a/x) for high-volume triage.
- `intel-critic` runs over the signals, flagging real ones — adds a comment to each signal Section it has reservations about.
- Approving a signal with `suggested action='surface to strategy'` auto-creates a Decision Document in `proposed` state for Loop 1 follow-up. Bulk-dismiss available for noise.
- Budget: 100k tokens / $2 per venture per week.

---

## Sprint 6 — Support triage hybrid (Loop 6)

**Loop type:** workflow (classification) + agent (ambiguous escalations).
**Why last:** most complex. Real customer-facing risk. Foundation must be proven first.
**Scope:** Email ingestion (forwarding rule into `/api/webhooks/support`), classifier (haiku — fast, cheap), draft-reply generator (opus — only for tickets needing nuance), human-approve-before-send for v1.

DOD highlights:
- Forwarding rule documented: `support@<venture>.com → ingest@solodesk.<domain>`.
- Webhook lands ticket in `events` and creates a **Support Ticket Document** (`type=support_ticket`) per `/.claude/decision-document-interface.md`, with Sections: `prose` (original message, read-only), `support_reply_block` (the drafted reply), `agent_note` (classification reasoning + ambiguities), `comment_thread` (critic + Tim).
- `support-triage` skill (haiku-based classifier) classifies on ingest as bug/question/churn-risk/feature-request, written to `support_tickets.classification` and surfaced in the agent_note Section.
- For tickets needing reply: `support-replier` agent (opus) generates the `support_reply_block` Section using ticket + venture COMPANY.md + relevant memories.
- **Triage Queue Document** (`type=triage_queue`) is the daily entry point — a Table primitive listing all open Support Ticket Documents, default-filtered to `status=needs_reply` and `urgency >= medium`. Keyboard navigation for batch triage.
- Approval is per-Section (per the Sprint 1 substrate). Send action is a discrete user click — no auto-send ever.
- Bug class → auto-creates a Decision Document tagged for engineering loop. Feature-request class → auto-creates a Decision Document tagged for strategy loop.
- Budget: classifier 5k tokens / $0.05 per ticket; replier 20k tokens / $0.40 per draft.

---

## After Sprint 6

The system is feature-complete for v0. From here it's:
- Per-venture instantiation (COMPANY.md per venture, intel_sources, support forwarding, webhook setup).
- Rubric tuning. Every Sunday — review week's outputs, update rubrics where reviewers were too soft or too harsh.
- Compounding. Every failure mode → CLAUDE.md or rubric update. The harness should improve weekly.

**Hard gate at 1 November 2026:** make the productise/don't call. Criteria in README.md.
