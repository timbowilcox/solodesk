-- SoloDesk — Memory Layer
-- Migration: 0002
-- Date: 2026-04-26
-- Sprint: 0.5
--
-- Adds the semantic memory substrate:
--   - pgvector extension
--   - embedding columns on decisions and artifacts
--   - memories table for free-form recallable notes (Tim's manual capture, agent observations)
--   - venture_chunks table for chunked COMPANY.md (and future docs) with per-chunk embeddings
--   - HNSW indexes on all embedding columns for cosine similarity search
--   - embedding_backlog view for the backfill worker
--
-- Embedding model: Voyage AI voyage-3 (1024 dimensions). Locked because changing
-- dimensions later means a full reembed across all rows. Voyage-3 chosen over
-- voyage-3-lite (512 dims) for headroom on quality; SoloDesk volume is low enough
-- that cost difference is trivial. Chosen over voyage-3-large because the marginal
-- quality gain isn't worth the cost at our scale.
--
-- This migration is incrementally additive — Sprint 0 ships fine without it.
-- Apply only when Sprint 0.5 begins.

set search_path = public;

-- ==================================================================
-- pgvector
-- ==================================================================

create extension if not exists vector;

-- ==================================================================
-- Embedding columns on existing tables
-- ==================================================================

-- DECISIONS: every strategic decision is a recall surface
alter table decisions add column if not exists embedding vector(1024);
alter table decisions add column if not exists embedding_text text;
alter table decisions add column if not exists embedded_at timestamptz;

-- ARTIFACTS: every content post, intel digest, support draft, strategy doc
alter table artifacts add column if not exists embedding vector(1024);
alter table artifacts add column if not exists embedding_text text;
alter table artifacts add column if not exists embedded_at timestamptz;

-- Note: events table deliberately does NOT get embeddings. Events are high-volume
-- (Stripe webhooks, deploys, page views, etc) and low semantic signal. They're for
-- SQL aggregation, not semantic recall. If a specific event matters enough to
-- recall, capture it as a memories row.

-- ==================================================================
-- MEMORIES — free-form recallable notes
-- ==================================================================
-- The catch-all surface for anything that should be semantically recallable but
-- doesn't fit decisions or artifacts. Examples:
--   - Tim types a note in the UI: "Customer X said pricing felt steep"
--   - An agent observes something during a run: "Anomaly explained by Friday deploy"
--   - End-of-week retrospective: "What worked this week"

create table memories (
  id              uuid primary key default gen_random_uuid(),
  venture_id      uuid references ventures(id) on delete cascade,
  ts              timestamptz default now() not null,
  source          text not null,        -- 'manual','agent:<name>','digest','retrospective'
  text            text not null,
  tags            text[] default '{}',
  embedding       vector(1024),
  embedded_at     timestamptz,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now() not null
);

create index memories_venture_ts_idx on memories (venture_id, ts desc);
create index memories_tags_idx on memories using gin (tags);

-- ==================================================================
-- VENTURE_CHUNKS — chunked COMPANY.md (and future docs)
-- ==================================================================
-- The COMPANY.md document for each venture gets chunked into semantic units
-- so that buildAgentPrompt can pull only the relevant sections per query, not
-- the whole doc. This is what lets COMPANY.md grow without blowing the prompt
-- budget.
--
-- source_version increments when the source doc is rewritten — keep older
-- chunks for historical recall but exclude them from default queries.

create table venture_chunks (
  id              uuid primary key default gen_random_uuid(),
  venture_id      uuid references ventures(id) on delete cascade,
  source          text not null,        -- 'company_md','runbook','spec'
  source_version  int default 1 not null,
  ord             int not null,         -- chunk order within source doc
  text            text not null,
  embedding       vector(1024),
  embedded_at     timestamptz,
  created_at      timestamptz default now() not null,
  unique (venture_id, source, source_version, ord)
);

create index venture_chunks_venture_source_idx on venture_chunks (venture_id, source, source_version);

-- ==================================================================
-- HNSW indexes for cosine similarity search
-- ==================================================================
-- HNSW chosen over IVFFlat — better recall, marginally slower build, but our
-- volume is low. m=16 and ef_construction=64 are pgvector defaults; revisit
-- if recall quality is poor at scale.

create index decisions_embedding_idx on decisions
  using hnsw (embedding vector_cosine_ops);
create index artifacts_embedding_idx on artifacts
  using hnsw (embedding vector_cosine_ops);
create index memories_embedding_idx on memories
  using hnsw (embedding vector_cosine_ops);
create index venture_chunks_embedding_idx on venture_chunks
  using hnsw (embedding vector_cosine_ops);

-- ==================================================================
-- BACKFILL VIEW — what needs embedding
-- ==================================================================
-- The embedding worker queries this view to find rows missing embeddings.
-- A row qualifies if it has source text but no embedding yet.

create or replace view embedding_backlog as
  select 'decisions'::text as table_name, id, embedding_text as text, ts
  from decisions
  where embedding is null and embedding_text is not null
  union all
  select 'artifacts'::text, id, embedding_text, ts
  from artifacts
  where embedding is null and embedding_text is not null
  union all
  select 'memories'::text, id, text, ts
  from memories
  where embedding is null
  union all
  select 'venture_chunks'::text, id, text, created_at as ts
  from venture_chunks
  where embedding is null;

-- ==================================================================
-- HELPER: embedding_text triggers
-- ==================================================================
-- For decisions and artifacts, the embedding_text is derived from the human
-- fields. We compute it on insert/update so the worker has something to embed.

create or replace function decisions_set_embedding_text() returns trigger as $$
begin
  new.embedding_text := coalesce(new.title, '') ||
                        case when new.recommendation is not null
                             then E'\n\n' || new.recommendation else '' end ||
                        case when new.alternatives is not null
                             then E'\n\nAlternatives: ' || new.alternatives else '' end;
  -- If the source text changed, invalidate the existing embedding
  if (tg_op = 'UPDATE' and new.embedding_text is distinct from old.embedding_text) then
    new.embedding := null;
    new.embedded_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger decisions_embedding_text_trigger
  before insert or update on decisions
  for each row execute function decisions_set_embedding_text();

create or replace function artifacts_set_embedding_text() returns trigger as $$
begin
  -- Artifacts use the content jsonb. The writer is responsible for putting
  -- the embeddable text under content->>'text' when applicable.
  new.embedding_text := coalesce(new.content->>'text', new.content->>'summary', '');
  if (tg_op = 'UPDATE' and new.embedding_text is distinct from old.embedding_text) then
    new.embedding := null;
    new.embedded_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger artifacts_embedding_text_trigger
  before insert or update on artifacts
  for each row execute function artifacts_set_embedding_text();
