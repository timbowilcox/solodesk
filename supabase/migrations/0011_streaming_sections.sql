-- SoloDesk — Streaming Sections + Loop 1 conversation (Sprint 10 / Experience layer)
-- Migration: 0011
-- Date: 2026-05-07
--
-- Three additions:
--   1. documents.status enum extends with 'drafting', 'cancelled',
--      'drafting_orphaned' so streaming Loops can flag in-flight state
--   2. loop_runs gains cancel_requested_at + last_section_ord for the runner
--      to poll cancellation and report progress
--   3. loop_threads + loop_thread_messages support Loop 1 conversation
--      surface persistence
--
-- Bumped to 0011 because earlier numbered slots are taken (0007 venture_members,
-- 0008 venture_identity, 0009 bridge_aggregation, 0010 day_dismissals).
-- Documented in SPRINT.md.
--
-- bridge_tiles RPC is recreated below to incorporate documents.status='drafting'
-- in the 'active' StateDot derivation. Sprint 8 deferred this with a caveat;
-- Sprint 10 closes the loop.

set search_path = public;

-- ==================================================================
-- 1. documents.status enum extension
-- ==================================================================

alter table documents drop constraint if exists documents_status_check;
alter table documents add constraint documents_status_check
  check (status in (
    'draft',
    'reviewing',
    'approved',
    'rejected',
    'published',
    'archived',
    'drafting',           -- new: streaming run in flight
    'cancelled',          -- new: server run cancelled by operator
    'drafting_orphaned'   -- new: client disconnected before critic finished
  ));

-- ==================================================================
-- 2. loop_runs cancel + progress columns
-- ==================================================================

alter table loop_runs
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists last_section_ord    int;

create index if not exists loop_runs_cancel_pending_idx
  on loop_runs (id)
  where status = 'running' and cancel_requested_at is not null;

-- ==================================================================
-- 3. Loop 1 conversation persistence
-- ==================================================================

create table loop_threads (
  id            uuid primary key default gen_random_uuid(),
  venture_id    uuid references ventures(id) on delete cascade not null,
  user_id       uuid references allowed_users(id) on delete set null,
  loop_name     text not null,
  -- e.g. 'loop-1-strategy'. New conversation surfaces in future loops use
  -- the same table with their own loop_name.
  title         text,
  status        text not null default 'open'
                check (status in ('open','closed','archived')),
  metadata      jsonb default '{}'::jsonb not null,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

create index loop_threads_venture_user_idx
  on loop_threads (venture_id, user_id, created_at desc);
create index loop_threads_loop_idx on loop_threads (loop_name, created_at desc);

create trigger loop_threads_updated_at before update on loop_threads
  for each row execute function set_updated_at();

create table loop_thread_messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid references loop_threads(id) on delete cascade not null,
  role          text not null check (role in (
    'operator',
    'agent',
    'critic',
    'document'    -- inline Document precipitate; body is empty, document_id set
  )),
  body          text not null default '',
  document_id   uuid references documents(id) on delete set null,
  loop_run_id   uuid references loop_runs(id) on delete set null,
  created_at    timestamptz default now() not null
);

create index loop_thread_messages_thread_idx
  on loop_thread_messages (thread_id, created_at);

-- ==================================================================
-- 4. bridge_tiles update — include drafting documents in 'active' state
-- ==================================================================

create or replace function bridge_tiles(
  p_user_id uuid,
  p_is_admin boolean
) returns table (
  venture_id        uuid,
  slug              text,
  name              text,
  phase             text,
  accent_color      text,
  mark_slug         text,
  state             text,
  pending_count     int,
  last_activity_at  timestamptz,
  vital_sign        text,
  sparkline         jsonb,
  connections       jsonb
)
language sql
stable
as $$
  with visible_ventures as (
    select v.*
    from ventures v
    where p_is_admin = true
       or v.id in (
         select vm.venture_id
         from venture_members vm
         where vm.user_id = p_user_id
       )
  ),
  loop_activity as (
    select
      v.id as venture_id,
      max(lr.ts) filter (where lr.ts > now() - interval '5 minutes') as last_active_run,
      max(lr.ts) filter (where lr.ts > now() - interval '24 hours') as last_24h_run,
      max(lr.ts) as last_run_ever
    from visible_ventures v
    left join loop_runs lr on lr.venture_id = v.id
    group by v.id
  ),
  drafting_docs as (
    select
      v.id as venture_id,
      bool_or(d.status = 'drafting') as has_drafting
    from visible_ventures v
    left join documents d on d.venture_id = v.id
    group by v.id
  ),
  doc_pending as (
    select
      v.id as venture_id,
      count(d.id) filter (where d.status in ('draft','reviewing'))::int as pending_count,
      max(d.updated_at) as last_doc_updated_at
    from visible_ventures v
    left join documents d on d.venture_id = v.id
    group by v.id
  ),
  event_recency as (
    select
      v.id as venture_id,
      max(e.ts) as last_event_at
    from visible_ventures v
    left join events e on e.venture_id = v.id
    group by v.id
  ),
  day_buckets as (
    select
      v.id as venture_id,
      d::date as bucket_date,
      coalesce(
        (select count(*)
         from events e
         where e.venture_id = v.id
           and e.ts >= d::date
           and e.ts <  (d::date + interval '1 day')
        ), 0
      )::int as bucket_count
    from visible_ventures v
    cross join generate_series(
      (current_date - interval '7 days')::date,
      current_date::date,
      interval '1 day'
    ) as d
  ),
  sparkline_agg as (
    select
      venture_id,
      jsonb_agg(bucket_count order by bucket_date) as sparkline
    from day_buckets
    group by venture_id
  ),
  latest_event as (
    select distinct on (e.venture_id)
      e.venture_id,
      e.type as event_type,
      e.source as event_source,
      e.ts    as event_ts
    from events e
    where e.venture_id in (select id from visible_ventures)
    order by e.venture_id, e.ts desc
  ),
  conn_agg as (
    select
      v.id as venture_id,
      coalesce(
        jsonb_agg(distinct c.provider) filter (where c.provider is not null),
        '[]'::jsonb
      ) as providers_all
    from visible_ventures v
    left join connections c
      on c.venture_id = v.id
     and c.revoked_at is null
    group by v.id
  )
  select
    v.id as venture_id,
    v.slug,
    v.name,
    v.phase,
    v.accent_color,
    v.mark_slug,
    case
      when la.last_active_run is not null then 'active'
      when dd.has_drafting then 'active'  -- Sprint 10 addition
      when greatest(
        coalesce(la.last_24h_run,    'epoch'::timestamptz),
        coalesce(dp.last_doc_updated_at, 'epoch'::timestamptz),
        coalesce(er.last_event_at,   'epoch'::timestamptz)
      ) > now() - interval '24 hours' then 'idle'
      else 'quiet'
    end as state,
    coalesce(dp.pending_count, 0) as pending_count,
    nullif(
      greatest(
        coalesce(la.last_run_ever,        'epoch'::timestamptz),
        coalesce(dp.last_doc_updated_at,  'epoch'::timestamptz),
        coalesce(er.last_event_at,        'epoch'::timestamptz)
      ),
      'epoch'::timestamptz
    ) as last_activity_at,
    case
      when le.event_type is not null
        then le.event_source || ' · ' || le.event_type
      else null
    end as vital_sign,
    coalesce(sa.sparkline, '[0,0,0,0,0,0,0,0]'::jsonb) as sparkline,
    case
      when ca.providers_all = '[]'::jsonb then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(p), '[]'::jsonb)
        from (
          select p
          from jsonb_array_elements_text(ca.providers_all) as t(p)
          order by p
          limit 3
        ) sub
      )
    end as connections
  from visible_ventures v
  left join loop_activity la on la.venture_id = v.id
  left join drafting_docs dd on dd.venture_id = v.id
  left join doc_pending   dp on dp.venture_id = v.id
  left join event_recency er on er.venture_id = v.id
  left join latest_event  le on le.venture_id = v.id
  left join sparkline_agg sa on sa.venture_id = v.id
  left join conn_agg      ca on ca.venture_id = v.id
  order by
    case
      when la.last_active_run is not null or dd.has_drafting then 0
      else 1
    end,
    coalesce(la.last_run_ever, dp.last_doc_updated_at, er.last_event_at, v.created_at) desc nulls last,
    v.name asc;
$$;

-- ==================================================================
-- DOWN MIGRATION (for reference; not auto-applied):
--
--   drop table if exists loop_thread_messages;
--   drop table if exists loop_threads;
--   alter table loop_runs drop column if exists cancel_requested_at;
--   alter table loop_runs drop column if exists last_section_ord;
--   alter table documents drop constraint documents_status_check;
--   alter table documents add constraint documents_status_check
--     check (status in (
--       'draft','reviewing','approved','rejected','published','archived'
--     ));
--   -- bridge_tiles rolls back via rerunning 0009's create-or-replace.
-- ==================================================================
