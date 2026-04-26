# Sprint 0.5 — Memory Layer

**Status:** pre-written, ready to begin after Sprint 0 evaluator scores ≥ 7
**Loops added:** none directly; foundation that every future loop sprint depends on
**Estimated sessions:** 1-2

When Sprint 0 is approved by the evaluator, copy this file's contents into `SPRINT.md` (replacing Sprint 0 contents) and begin.

---

## Why this exists

Sprint 0 ships the storage substrate but nothing for *retrieval*. Without semantic recall, every future loop is reduced to "load COMPANY.md + filter by venture_id + recent ts", which is keyword-by-foreign-key filtering. That doesn't scale and it doesn't compound.

Sprint 0.5 adds the memory layer: pgvector-backed semantic search across decisions, artifacts, free-form memories, and chunked COMPANY.md. Every future loop (Sprints 1-6) pulls context through `buildAgentPrompt()` rather than constructing prompts manually. This is what makes the rubric library compound — past decisions surface when relevant, not just when manually re-read.

This sprint maps to Level 3 in the memory taxonomy (semantic retrieval over the canonical store) with a credible upgrade path to Level 6 (MCP exposure for cross-tool access) deferred to v1.5 post-launch.

## Scope

1. Apply migration `0002_memory_layer.sql` (pgvector, embedding columns, memories + venture_chunks tables, HNSW indexes, backfill view, embedding_text triggers)
2. Set up Voyage AI account, get API key, add to Vercel env
3. Build the embedding worker — a server-only function that takes `(table, id)` and embeds the text
4. Wire on-write embedding: every server action that creates a decision/artifact/memory enqueues an embedding job (fire-and-forget)
5. Add a 5-min cron that processes the `embedding_backlog` view (catches up anything the on-write path missed)
6. Build `recallContext()` — semantic search across the four memory surfaces, scoped to a venture
7. Build `buildAgentPrompt()` — composes COMPANY.md chunks + recallContext hits + task into a budget-bounded prompt
8. Build COMPANY.md chunking pipeline: when `ventures.company_md` is updated, chunk it into `venture_chunks` rows
9. Add a `/ventures/[slug]/memories` UI section for manual memory capture
10. End-to-end test: seed Kounta with sample decisions and memories, run a `recallContext()` query, verify retrieval ranks correctly

## Out of scope

- Any agent actually using the memory layer (Sprints 1-6 do that)
- Cross-venture recall (deliberate anti-pattern — every recall is venture-scoped)
- MCP server exposing this externally (deferred to v1.5 post-launch)
- Re-ranking beyond cosine similarity (Cohere reranker etc — defer until quality is shown to be insufficient)
- Embedding events table (deliberate — events are SQL aggregation surface, not semantic recall)
- Hybrid search (BM25 + vector) — defer until simple cosine is proven inadequate

## Acceptance criteria

### Migration

- [ ] `0002_memory_layer.sql` applied successfully against Supabase
- [ ] `select * from pg_extension where extname = 'vector'` returns the row
- [ ] All four embedding columns + new tables present, confirmed via `\d`
- [ ] HNSW indexes confirmed via `\di`
- [ ] `select * from embedding_backlog limit 1` works (returns 0 rows on empty DB)
- [ ] `decisions_embedding_text_trigger` and `artifacts_embedding_text_trigger` fire correctly — confirmed by inserting a test row and seeing `embedding_text` populated automatically

### Voyage AI

- [ ] Voyage account created
- [ ] API key generated and added to Vercel env as `VOYAGE_API_KEY`
- [ ] Local `.env.local.example` updated with the new var
- [ ] Test call from a server action returns a 1024-dim vector
- [ ] Model locked to `voyage-3` (1024 dims) — documented in `/lib/memory/embed.ts` constants

### Embedding worker (`/lib/memory/embed.ts`)

- [ ] Function `embedText(text: string): Promise<number[]>` calls Voyage, returns 1024-dim vector
- [ ] Function `embedRow(table: string, id: string): Promise<void>` looks up `embedding_text` for the row, calls `embedText`, writes back to `embedding` + `embedded_at`
- [ ] Handles all four tables: `decisions`, `artifacts`, `memories`, `venture_chunks`
- [ ] Function `processBacklog(limit = 50): Promise<{ processed: number, failed: number }>` iterates the `embedding_backlog` view in oldest-first order, embeds each, logs failures to `events` table with type `embedding_failed`
- [ ] Cost tracking: every batch logs total tokens + estimated cents to a `loop_runs` row with `loop_name = 'memory:embed'`
- [ ] Batched: Voyage allows up to 128 inputs per request; worker batches accordingly
- [ ] Idempotent: re-running on already-embedded rows is a no-op (worker filters `embedding is null`)

### On-write integration

- [ ] Every server action that inserts into `decisions`, `artifacts`, or `memories` calls `embedRow` afterwards (fire-and-forget; on failure the backlog cron picks it up)
- [ ] Failures don't block the user-facing write path

### Cron

- [ ] Vercel cron configured: `* /5 * * * *` → `GET /api/cron/embeddings` (with `CRON_SECRET` check)
- [ ] Endpoint runs `processBacklog(limit: 100)` and returns `{ processed, failed }`
- [ ] Endpoint protected by `Authorization: Bearer ${CRON_SECRET}` header check
- [ ] Tested: insert a memory bypassing the on-write path, confirm cron embeds it within 5 minutes

### Recall function (`/lib/memory/recall.ts`)

- [ ] Function signature:
  ```ts
  recallContext(opts: {
    ventureId: string;
    query: string;
    k?: number;          // default 5
    types?: ('decisions'|'artifacts'|'memories'|'venture_chunks')[];
    minSimilarity?: number; // default 0.5
  }): Promise<MemoryHit[]>
  ```
- [ ] `MemoryHit = { table, id, text, similarity, ts, metadata }`
- [ ] Implementation embeds the query, runs `<=>` cosine distance search per requested table, merges results, sorts by similarity desc, applies `minSimilarity` threshold, returns top k
- [ ] Hard-scoped to `venture_id` — rows from other ventures are unreachable. Confirmed by test.
- [ ] Returns empty array (not error) when no hits above threshold
- [ ] Logs the query + k + hit count to a `loop_runs` row with `loop_name = 'memory:recall'`

### Prompt builder (`/lib/agents/prompt.ts`)

- [ ] Function signature:
  ```ts
  buildAgentPrompt(opts: {
    skill: string;             // skill name, used for logging
    ventureId: string;
    task: string;
    systemSkillPrompt: string; // from SKILL.md frontmatter
    budgetTokens: number;      // total context budget
  }): Promise<{
    systemPrompt: string;
    userMessage: string;
    citations: MemoryHit[];
    tokensUsed: { company: number; recall: number; task: number };
  }>
  ```
- [ ] Composition order:
  1. Skill system prompt (verbatim, no truncation)
  2. Top-3 venture_chunks for COMPANY.md context (semantic match against task)
  3. Top-5 recall hits across decisions/artifacts/memories (semantic match against task)
  4. The task itself
- [ ] Each section has its own sub-budget (skill: 2k, company: 3k, recall: 4k, task: remaining). If a section exceeds, it's truncated with a `[...truncated]` marker.
- [ ] Citations array exposed so the agent's output can reference them by ID
- [ ] Token counting via `@anthropic-ai/tokenizer` or equivalent; rough char/4 fallback acceptable for v0
- [ ] Every call logs to `loop_runs` with token-budget breakdown

### COMPANY.md chunking

- [ ] When `ventures.company_md` is updated via the venture edit form, chunk the new content
- [ ] Chunker: simple — split on `## ` markdown headers, then split any chunk > 500 tokens into 500-token slices with 50-token overlap
- [ ] Old chunks for that venture+source marked stale (delete or set source_version+1; for v0 just delete and re-insert with version bumped)
- [ ] New chunks inserted, embeddings computed via `embedRow` immediately
- [ ] Tested with the seeded Kounta COMPANY.md — chunks present in `venture_chunks`, all embedded

### Memories UI

- [ ] `/ventures/[slug]/memories` page lists memories for the venture (newest first, paginated)
- [ ] "Add memory" form: textarea for text, optional tags (comma-separated)
- [ ] Submitting creates a `memories` row with `source = 'manual'`, embedding triggered immediately
- [ ] Each memory shows ts, tags, source, embedded indicator (green if embedded, grey pending)
- [ ] No edit/delete in this sprint — just append-only

### Tests

- [ ] Vitest unit test: `embedText('hello world')` returns a 1024-length array
- [ ] Vitest integration: insert a memory, run cron, confirm embedding populated
- [ ] Vitest integration: insert 5 decisions for Kounta and 5 for Counsel, call `recallContext({ ventureId: kounta, query: ... })`, confirm only Kounta results returned
- [ ] Vitest integration: `buildAgentPrompt({ task: 'pricing strategy' })` returns prompt within budget, with citations array non-empty
- [ ] Playwright e2e: navigate to memories page, add a memory, confirm it appears in list

### Quality

- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm lint` clean
- [ ] No `any` types in new memory/agent code
- [ ] All new code has JSDoc on exported functions
- [ ] README.md updated with the memory layer section

### Handoff

- [ ] HANDOFF.md committed with: migration verification screenshots, Voyage API key confirmation (just that it's set, not the value), worker test output, recall test output with timings, prompt builder test output with token breakdown, screenshot of memories UI, exact next step

---

## Definition of Done

- [ ] All acceptance criteria above ticked, with proof in HANDOFF.md
- [ ] Migration applied and reversible (down strategy: `drop` the new tables, `alter table drop column` on the embeddings, `drop extension vector cascade`)
- [ ] No TypeScript errors
- [ ] Deployed to Vercel and reachable on `app.solodesk.ai`
- [ ] Backlog cron runs successfully on schedule (verify in Vercel logs after 10 min wait)
- [ ] HANDOFF.md committed
- [ ] Git history clean

---

## Quality rubric

| Criterion | Target |
|---|---|
| Migration correctness — pgvector + HNSW + triggers all work | 5 |
| Embedding worker — handles all 4 tables, batched, idempotent | 5 |
| Cost tracking — every embed + recall logged to loop_runs | 5 |
| Recall correctness — scoped to venture (no cross-venture leak) | 5 |
| Prompt budget enforcement — never exceeds budgetTokens | 5 |
| `buildAgentPrompt` is the only path to construct an agent prompt | 4+ |
| TypeScript strictness — no `any`, no `@ts-ignore` | 5 |
| Test coverage — recall correctness, prompt budget, cron idempotency | 4+ |
| Latency — recall p95 under 200ms on seeded data | 4+ |

---

## Adversarial review prompt

```
You are the evaluator agent for SoloDesk Sprint 0.5 (Memory Layer). Read CLAUDE.md,
ROADMAP.md, SPRINT.md, and HANDOFF.md before doing anything else.

Your job: find what's wrong, incomplete, or insecure. Approve only if certain it's done.

Specifically:
1. Run `pnpm tsc --noEmit` and `pnpm lint`. Report errors.
2. Verify migration applied: pgvector enabled, all four embedding columns present,
   memories + venture_chunks tables exist, HNSW indexes present, triggers fire.
3. Test cross-venture isolation: create a memory under Kounta. Call recallContext
   with ventureId for Counsel and the same query text. Confirm zero hits.
4. Test prompt budget: call buildAgentPrompt with budgetTokens=2000. Confirm
   resulting prompt token count is at or below 2000.
5. Test backlog cron: insert a memory directly via SQL (bypassing the server action
   path). Wait 6 minutes. Confirm embedding populated.
6. Test embedding-text trigger: update a decision's recommendation. Confirm the
   embedding is invalidated (set to null) and embedded_at cleared.
7. Test idempotency: run processBacklog twice in succession. Confirm second run
   finds 0 rows to process.
8. Audit cost logging: confirm every embed batch and every recall query logged a
   loop_runs row with sensible token + cost numbers.
9. Find any code path that constructs an agent prompt without going through
   buildAgentPrompt. Flag as violation if found.
10. Score each rubric criterion. Justify any below target.
11. Score overall 1-10. Below 7 → not done.

Do not approve unless verified.
```

---

## Notes for the build session

**Voyage SDK choice:** use the official `voyageai` npm package. Its TypeScript types are decent.

**Why HNSW not IVFFlat:** HNSW gives better recall and we have low write volume so the slower build doesn't matter. Default `m=16, ef_construction=64`. We can tune `ef_search` at query time if recall quality is poor.

**Why no events embeddings:** events are firehose data — Stripe webhooks, deploys, page views. High volume, low semantic signal per row. SQL aggregation is the right interface. If a specific event matters enough to recall ("the customer who churned in week 3 mentioned pricing"), it should be promoted to a `memories` row by the agent or by Tim.

**Why no cross-venture recall:** Corum's anti-pattern set forbids stakeholder graph leakage; mixing Counsel context into Corum context breaks the isolation that makes both viable. This is a bright line. The recall function takes `venture_id` as a required parameter, not an optional one.

**Re-embedding cost:** if the embedding model is later swapped, every row needs reembedding. At ~600 rows/month and Voyage's pricing, the full corpus reembed at month 6 costs single-digit dollars. Don't over-engineer for migrations.

**On-write fire-and-forget pattern:**
```ts
// In the server action that creates a decision:
const decision = await supabase.from('decisions').insert(...).select().single();
// Don't await — let it happen async, cron is the safety net
embedRow('decisions', decision.id).catch(err => {
  console.error('embed failed, will retry via cron', err);
});
return decision;
```

**Anti-leak self-check:** the recall query MUST include `where venture_id = $1` in the SQL. Add a unit test that mocks the supabase client and asserts the query contains the venture filter. Cheap, prevents regressions.
