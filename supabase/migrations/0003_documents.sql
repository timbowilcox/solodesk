-- SoloDesk — Document/Section/Comment substrate
-- Migration: 0003
-- Date: 2026-05-06
-- Sprint: 1.1
--
-- Implements the Document primitive per /.claude/decision-document-interface.md.
-- Every loop output from Sprint 1.2 onwards lands as a Document with typed
-- Sections; comments anchor to Sections (never to the Document globally).
--
-- The existing `decisions` and `artifacts` tables (Sprint 0) don't go away.
-- They're the *queryable record*; Documents are the editing surface. A
-- Document with type=decision writes a row into `decisions` when its status
-- flips to `approved`, preserving downstream queries.
--
-- Sprint 0.5 conventions apply: sections gain embedding columns + an HNSW
-- index so individual sections become recall surfaces (not whole Documents
-- — the granularity matters for prompt budgets later).

set search_path = public;

-- ==================================================================
-- DOCUMENTS — the unit of agent output that requires human judgment
-- ==================================================================

create table documents (
  id              uuid primary key default gen_random_uuid(),
  venture_id      uuid references ventures(id) on delete cascade not null,
  type            text not null,
  -- 'decision','content','intel_digest','support_ticket','daily_digest',
  -- 'triage_queue'. New types added in code, not via dynamic registration.
  title           text not null,
  status          text not null default 'draft'
                  check (status in ('draft','reviewing','approved','rejected','published','archived')),
  loop_name       text not null,
  -- Which loop produced it. 'manual' for hand-authored documents (Loop 10
  -- in Sprint 1.2). Future agent loops use their skill name, e.g.
  -- 'office-hours' for Sprint 3.
  approved_at     timestamptz,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null,
  metadata        jsonb default '{}'::jsonb not null
);

create index documents_venture_status_idx on documents (venture_id, status);
create index documents_venture_type_idx on documents (venture_id, type);
create index documents_created_at_idx on documents (created_at desc);

-- ==================================================================
-- SECTIONS — typed units of a Document; the unit of comment, edit, approve
-- ==================================================================

create table sections (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid references documents(id) on delete cascade not null,
  kind            text not null,
  -- 'prose','recommendation','alternatives','kill_criteria','evidence',
  -- 'risk','agent_note','comment_thread','metric_block','intel_signal',
  -- 'support_reply_block','content_block','intel_signals_table'.
  -- New kinds added in code (Section catalogue grows over time).
  ord             int not null,
  content         jsonb not null default '{}'::jsonb,
  -- Shape depends on kind. Prose: { text }. Recommendation: { text,
  -- confidence }. Evidence: { items: [{text, source}] }. Risk: { text,
  -- severity, mitigation }. AgentNote: { question, decision, alternatives }.
  status          text not null default 'draft'
                  check (status in ('draft','reviewing','approved','revising','rejected','dismissed')),
  version         int not null default 1,
  parent_version  uuid references sections(id) on delete set null,
  embedding       vector(1024),
  embedding_text  text,
  embedded_at     timestamptz,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

create index sections_document_ord_idx on sections (document_id, ord);
create index sections_status_idx on sections (status);
create index sections_embedding_idx on sections
  using hnsw (embedding vector_cosine_ops);

-- Trigger: derive embedding_text from content based on kind. Keeps the
-- embedding worker simple — it just reads embedding_text uniformly.
create or replace function sections_set_embedding_text() returns trigger as $$
declare
  derived text;
begin
  derived := case new.kind
    when 'prose' then coalesce(new.content->>'text', '')
    when 'recommendation' then coalesce(new.content->>'text', '')
    when 'alternatives' then coalesce(new.content->>'text', '')
    when 'kill_criteria' then coalesce(new.content->>'text', '')
    when 'evidence' then coalesce(new.content->>'text', '')
    when 'risk' then concat_ws(E'\n',
      coalesce(new.content->>'text', ''),
      'Mitigation: ' || coalesce(new.content->>'mitigation', ''))
    when 'agent_note' then concat_ws(E'\n',
      'Q: ' || coalesce(new.content->>'question', ''),
      'A: ' || coalesce(new.content->>'decision', ''))
    when 'support_reply_block' then coalesce(new.content->>'text', '')
    when 'content_block' then coalesce(new.content->>'text', '')
    else coalesce(new.content->>'text', '')
  end;
  new.embedding_text := derived;
  if (tg_op = 'UPDATE' and new.embedding_text is distinct from old.embedding_text) then
    new.embedding := null;
    new.embedded_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger sections_embedding_text_trigger
  before insert or update on sections
  for each row execute function sections_set_embedding_text();

-- Match function for sections (mirrors the Sprint 0.5 pattern). Recall is
-- venture-scoped; documents.venture_id provides the filter.
create or replace function match_sections(
  p_venture_id uuid,
  p_query vector(1024),
  p_min_similarity float default 0.5,
  p_limit int default 5
) returns table (
  id uuid,
  ts timestamptz,
  text text,
  similarity float,
  metadata jsonb
) language sql stable as $$
  select
    s.id,
    s.created_at as ts,
    coalesce(s.embedding_text, '') as text,
    1 - (s.embedding <=> p_query) as similarity,
    jsonb_build_object(
      'document_id', s.document_id,
      'kind', s.kind,
      'document_type', d.type,
      'document_title', d.title
    ) as metadata
  from sections s
  join documents d on d.id = s.document_id
  where d.venture_id = p_venture_id
    and s.embedding is not null
    and 1 - (s.embedding <=> p_query) >= p_min_similarity
  order by s.embedding <=> p_query asc
  limit p_limit;
$$;

-- ==================================================================
-- COMMENTS — anchored to Sections, never to Documents globally
-- ==================================================================

create table comments (
  id              uuid primary key default gen_random_uuid(),
  section_id      uuid references sections(id) on delete cascade not null,
  author          text not null,
  -- 'tim' or 'agent:<name>' (e.g. 'agent:adversarial-strategy')
  body            text not null,
  evidence        jsonb not null default '[]'::jsonb,
  -- Array of evidence pointers: { kind: 'memory_hit'|'document'|'url'|
  -- 'anti_pattern', ref: <id-or-url>, label?: text }. Critic comments
  -- without evidence are auto-rejected by skill rubric (enforced in agent
  -- code, not at DB level — Tim can hand-author comments without evidence
  -- for now).
  status          text not null default 'open'
                  check (status in ('open','accepted','dismissed','replied')),
  dismiss_reason  text,
  resolved_at     timestamptz,
  created_at      timestamptz default now() not null
);

create index comments_section_status_idx on comments (section_id, status);
create index comments_section_created_idx on comments (section_id, created_at);

-- ==================================================================
-- BACKLINK: decisions table gets a document_id
-- ==================================================================
-- When a Decision Document with all Sections approved flips to status='approved',
-- a row gets written to `decisions` for backwards-compat with Sprint 0 schema.
-- The document_id link lets us trace back from decisions to the editing surface.

alter table decisions add column if not exists document_id uuid references documents(id) on delete set null;
create index if not exists decisions_document_id_idx on decisions (document_id);

-- ==================================================================
-- updated_at triggers (reuse Sprint 0's set_updated_at function)
-- ==================================================================

create trigger documents_updated_at before update on documents
  for each row execute function set_updated_at();
create trigger sections_updated_at before update on sections
  for each row execute function set_updated_at();

-- ==================================================================
-- EMBEDDING BACKLOG VIEW — extend with sections
-- ==================================================================
-- Replace the Sprint 0.5 view to include sections. The embedding worker
-- queries this view to find rows missing embeddings.

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
  where embedding is null
  union all
  select 'sections'::text, id, embedding_text, created_at as ts
  from sections
  where embedding is null and embedding_text is not null;
