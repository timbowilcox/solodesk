# Handoff: full ROADMAP loop catalogue + Loop 11 portfolio audit

**Date:** 2026-05-07
**Repo:** solodesk
**Branch:** `main` (head: `653b271`, all commits pushed)
**Session type:** Build (multi-sprint marathon)
**Author:** Claude (Opus 4.7) under Tim's harness

Earlier session HANDOFFs in `.archive/handoffs/`. This one closes the ROADMAP Loop catalogue.

---

## What landed in this session

| Sprint | Status | Key deliverables |
|---|---|---|
| **0.5** | ✅ migration applied + code | pgvector, voyage-3 wrapper, recallContext, buildAgentPrompt, embed cron, memories UI |
| **1.0** | ✅ deployed | Inter + JetBrains Mono, SoloDesk palette, Phosphor icons, every Sprint 0 page restyled |
| **1.1 + 1.2 phase 1** | ✅ migration applied + deployed | Document/Section/Comment substrate, Decision Document UI, draft → approve flow |
| **1.3** | ✅ migration applied + deployed | connections + connection_audit tables, Supabase Vault wrappers, `getConnection()` accessor with audit-before-return, provider adapters (Stripe / Resend / Vercel / GitHub), settings UI |
| **2 phase 1** | ✅ deployed | Loop scheduler substrate, Daily Digest Document type, metric_block section, manual + cron-triggered generation |
| **3** | ✅ deployed | Office Hours (Loop 1) — first real two-skill agent loop; comments column on Decision detail |
| **4** | ✅ deployed | Content drafting (Loop 4) + content-critic; new content_block section kind |
| **5** | ✅ deployed | Intel scout (Loop 9) + intel-critic; intel_signals_table section kind |
| **6** | ✅ deployed | Support triage (Loop 6) — haiku classifier + opus replier; support_reply_block section kind |
| **7 (Loop 11)** | ✅ migration applied + deployed | Portfolio audit — cross-venture meta-loop, portfolio-scope Documents, weekly cron |

Migrations applied via Supabase MCP this session: **0002 / 0003 / 0004 / 0005 / 0006**. Total schema state: 17 tables, 5 vector RPC helpers, 4 vault helpers, pgvector + supabase_vault extensions.

Total commits this session: **~10 sprint commits** + this HANDOFF, all on `main`, all pushed to origin.

---

## What works end-to-end without external setup

- All authed surfaces render: dashboard, ventures, events, decisions, content, intel, support, memories, digests, connections, portfolio.
- Decision Documents — manual create + approve (writes to legacy `decisions` table for Sprint 0 compat).
- Daily Digest — manual generate from the Digests page; pulls real metrics from existing data (events, decisions, memories counts).
- Portfolio audit — manual run from `/portfolio`; computes findings without any LLM calls.

## What requires external secrets to come alive

| Env var | Unlocks | Scope |
|---|---|---|
| `ANTHROPIC_API_KEY` | Office Hours, Content writer + critic, Intel scout + critic, Support triage + replier (everything in Sprints 3-6) | All agent loops |
| `VOYAGE_API_KEY` | Embedding worker (memories / decisions / artifacts / venture_chunks / sections all save fine without it; embedding column stays null until set) | Sprint 0.5 recall |
| `CRON_SECRET` | Auto-firing of `/api/cron/embeddings` (every 5 min), `/api/cron/daily-digest` (06:00 Sydney), `/api/cron/portfolio-audit` (07:00 Sunday Sydney) | Scheduling |

All set in Vercel project Production + Preview env. Without them, the routes return 401 (cron) or `not configured` (agent loops); the rest of the app is unaffected.

---

## Bright lines maintained across all sprints

- **Cross-venture context isolation** — `recallContext()`, `match_*` RPC helpers, `getConnection()`, every agent loop scopes to a single `ventureId`. SQL-layer enforced, not just app-code.
- **Cross-venture credential leakage** — `getConnection()` is the single read path; grep test enforces `vault.decrypted_secrets` only appears inside `/lib/connections/`.
- **No agent constructs its own prompt** — every loop runs through `buildAgentPrompt()` from Sprint 0.5.
- **No agent writes flat artifacts** — every output is a Document with typed Sections.
- **No critic ships a global review note** — every critic comment anchors to a Section by id with required evidence pointers (runner drops evidence-less comments).
- **No agent regenerates more than the Section it's responding to** — adversarial-strategy / content-critic / intel-critic all leave anchored comments, never rewrite.
- **Loop 11 is the deliberate exception to "no cross-venture context"** — but constrained: no LLM, no decrypted credentials, no shared prompt windows, only metadata aggregation.
- **No auto-send** on any communication — Content Documents and Support Reply Blocks both have explicit-click send (stub for now; landing in a follow-up).
- **Loops are venture-portable** — every loop file takes `ventureSlug` (or runs at portfolio scope explicitly); zero `if (slug === 'kounta')` branches.

---

## Files changed (high-level)

```
supabase/migrations/
  0002_memory_layer.sql            applied — pgvector, memories, venture_chunks, match_* RPCs
  0003_documents.sql               applied — documents/sections/comments + match_sections
  0004_connections.sql             applied — connections, connection_audit
  0005_vault_helpers.sql           applied — vault_put/get/rotate/delete (security-definer)
  0006_portfolio_documents.sql     applied — venture_id nullable on documents

lib/
  agents/
    anthropic.ts                   runAgent + extractJson + cost table (claude-opus-4-7 / claude-haiku-4-5-20251001)
    prompt.ts                      buildAgentPrompt (composition substrate, Sprint 0.5)
    loops/
      office-hours.ts              Loop 1 generator
      adversarial-strategy.ts      Loop 1 critic
      content-writer.ts            Loop 4 generator
      content-critic.ts            Loop 4 critic
      intel-scout.ts               Loop 9 generator
      intel-critic.ts              Loop 9 critic
      support-triage.ts            Loop 6 classifier (haiku) + dispatches replier
      support-replier.ts           Loop 6 drafter (opus)
  connections/
    vault.ts                       vaultPut/Get/Rotate/Delete
    manage.ts                      createConnection / rotateConnection / revokeConnection / inventory
    get.ts                         getConnection (single accessor with audit-before-return)
    providers/{stripe,resend,vercel,github}.ts
  db/
    documents.ts                   CRUD + Section seeds + approveDecisionDocument
    digests.ts                     generateDailyDigest (Loop 8)
    portfolio-audit.ts             generatePortfolioAudit (Loop 11)
    memories.ts                    createMemory + listMemoriesForVenture
  memory/
    embed.ts                       VOYAGE wrapper, processBacklog
    recall.ts                      recallContext (venture-scoped semantic search)
    chunk.ts + company-md.ts       COMPANY.md chunking
    voyage.ts                      ~80 LOC fetch wrapper (skipped voyageai SDK)
  scheduler/
    registry.ts                    Schedule type + registry
    runner.ts                      runSchedule with per-invocation loop_runs row
    schedules.ts                   loop-8-daily-digest + loop-11-portfolio-audit registered

app/(authed)/
  portfolio/                       new — Loop 11 list + detail
  ventures/[slug]/
    decisions/                     Sprint 1.2 — list / new / detail
    content/                       Sprint 4 — list / new / detail
    intel/                         Sprint 5 — list / new / detail
    support/                       Sprint 6 — triage queue / new / detail
    digests/                       Sprint 2 — list / detail
    memories/                      Sprint 0.5 — list + form
    office-hours/                  Sprint 3 — kick-off form
    settings/connections/          Sprint 1.3 — list / create / revoke

app/api/cron/
  embeddings/route.ts              every 5 min — processBacklog
  daily-digest/route.ts            0 20 * * * — runSchedule('loop-8-daily-digest')
  portfolio-audit/route.ts         0 21 * * 0 — runSchedule('loop-11-portfolio-audit')

components/document/
  document.tsx                     Document layout
  section.tsx                      kind dispatch + comments inline
  comment.tsx                      author tag + evidence pointer
  sections/{prose,recommendation,evidence,risk,agent_note,
           alternatives,kill_criteria,metric_block,content_block,
           intel_signals_table,support_reply_block}.tsx

.claude/skills/
  office-hours/SKILL.md
  adversarial-strategy/SKILL.md
  content-writer/SKILL.md
  content-critic/SKILL.md
  intel-scout/SKILL.md
  intel-critic/SKILL.md
  support-triage/SKILL.md          (haiku)
  support-replier/SKILL.md         (opus)
```

---

## Tests

50 vitest tests, all passing:

| File | Tests | Covers |
|---|---|---|
| `tests/lib/events/hash.test.ts` | 8 | Sprint 0 webhook idempotency contract |
| `tests/lib/rate-limit.test.ts` | 4 | Sprint 0 waitlist rate limit |
| `tests/lib/auth/allowlist.test.ts` | 5 | Sprint 0 allowlist lookup |
| `tests/api/webhooks.test.ts` | 8 | Sprint 0 webhook ingestion |
| `tests/api/waitlist.test.ts` | 7 | Sprint 0 waitlist endpoint |
| `tests/lib/memory/chunk.test.ts` | 6 | Sprint 0.5 chunker |
| `tests/lib/memory/recall.test.ts` | 3 | Sprint 0.5 venture-scope contract |
| `tests/lib/connections/get.test.ts` | 5 | Sprint 1.3 audit-before-return + venture scope |
| `tests/lib/scheduler/runner.test.ts` | 4 | Sprint 2 scheduler isolation + per-venture fan-out |

Integration tests against real Anthropic / Voyage / Resend APIs deferred until those keys are wired in Vercel — at which point a small smoke suite hits each loop end-to-end.

---

## What's NOT in this session

- **Sprint 1.2 phase 2** — per-Section approval, comment evidence-pointer Zod enforcement, revision diff UI, retrospective view. The substrate is in place; phase 2 is UI polish that earns its keep when more agent-generated comments accumulate.
- **Sprint 2 phase 2** — anomaly detection (>2σ from 30-day mean), `anomaly-explainer` agent, Resend digest email. Phase 1 ships the digest Document; phase 2 ships the explanation. Deferred until there's enough historical metric_snapshots data to detect anomalies against.
- **Webhook signature validation per provider** — Stripe / Resend / Vercel / GitHub webhooks land in `/api/webhooks/[source]` with the shared-secret check from Sprint 0; per-provider HMAC verification using `getConnection()` for the signing key lives in a follow-up.
- **Email send action** — explicit-click Resend send for Content Documents and Support Reply Blocks. Stub UI; needs `getConnection({provider:'resend'})` wired to the venture's connection.
- **Web search for intel-scout** — Phase 1 takes pasted observations. Anthropic web_search tool integration via runAgent (or a Tavily-style external fetch through Sprint 1.3 connections) lands in a follow-up.
- **Team inbound** — the other Nov 1 gate item per ROADMAP. Per-venture inbox via DNS forwarding + `venture_members` table + role-gated views. Substrate sprint of its own.

---

## Repository state

- Tree clean. Origin/main = local main.
- Recent commit log:
  ```
  653b271  Sprint 7 — Loop 11 portfolio audit (Nov 1 gate item)
  bdafc98  Sprint 6 — Support triage hybrid (Loop 6)
  26eef02  Sprint 5 — Intel scout (Loop 9) + critic + signals table
  1b3afdc  Sprint 4 — Content drafting + critic (Loop 4)
  6d8c2d2  Sprint 3 — Office Hours (Loop 1) + adversarial critic + comments column
  9800383  Sprint 2 phase 1 — Loop scheduler substrate + Daily Digest (Loop 8)
  5307921  Sprint 1.3 — Connections layer (migration + libs + settings UI)
  b970c87  Sprint 1.1 + 1.2 phase 1 — Document substrate + Decision documents
  fd147f6  Sprint 0.5 — memory layer code (migration + libs + cron + memories UI)
  7f3cfda  Sprint 1.0 — design migration: SoloDesk palette, Inter, Phosphor
  …
  ```
- Production routes in build: 33.
- 50 vitest tests passing.

---

## Exact next step

Set the three env vars in Vercel and verify:

```
VOYAGE_API_KEY     -> sign up at voyageai.com, paste the key
ANTHROPIC_API_KEY  -> from console.anthropic.com, billing in place
CRON_SECRET        -> openssl rand -hex 32
```

Then in this order:

1. **Visit `/ventures/kounta/memories`** and add a memory. Within 5 min the embedding cron picks it up; the row's `pending` indicator flips to `embedded`.

2. **Visit `/ventures/kounta/office-hours`** and ask a real strategic question. The generator drafts a Decision Document; the critic runs in the background and lands comments anchored to Sections within ~30s. Read it back at `/ventures/kounta/decisions/<id>`.

3. **Visit `/ventures/kounta/content/new`** and draft a piece of content. Same generator+critic pattern.

4. **Visit `/ventures/kounta/support/new`** and paste a real support email. Triage runs on haiku; if a reply is needed, the replier drafts on opus.

5. **Visit `/portfolio`** and click **Run audit now**. Findings render across all your active ventures.

6. **Add a Stripe / Resend connection** at `/ventures/kounta/settings/connections`. Sprint 2 phase 2 will consume them when it lands.

7. When the Sunday cron at 21:00 UTC fires, `/portfolio` should show today's audit. When the daily 20:00 UTC cron fires, `/ventures/kounta/digests` should show today's digest.

Remaining work for the Nov 1 productise gate per README.md: **team inbound** (multi-operator per-venture inbox), and Sprint 1.2/2 phase-2 polish. Everything else from ROADMAP is shipped.
