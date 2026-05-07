-- SoloDesk — Bridge aggregation (Sprint 8 / Experience layer)
-- Migration: 0009
-- Date: 2026-05-07
--
-- Adds bridge_tiles(p_user_id, p_is_admin) — a SQL function that returns one
-- row per venture the user can see, with all derived state needed to render
-- the Bridge tile in a single roundtrip. The Sprint 8 quality rubric calls
-- for single-query aggregation as a non-negotiable; this function is the
-- mechanism that makes it true.
--
-- BRIGHT LINE — VENTURE ISOLATION
--
-- Membership filtering happens INSIDE the function at the SQL layer, not on
-- the client. p_is_admin=true bypasses the venture_members filter (admin
-- sees all ventures). p_is_admin=false intersects against venture_members.
-- A member with two assigned ventures gets exactly two rows back; the
-- client cannot widen the set.
--
-- ACTIVITY DERIVATION (Sprint 8 caveat)
--
-- documents.status='drafting' is reserved for Sprint 10 (streaming Sections).
-- Until then, the Bridge derives "active" purely from loop_runs activity in
-- the last 5 minutes. Idle = activity in the last 24h but not 5 min. Quiet =
-- no activity in 24h+. Once Sprint 10 lands, the active branch extends to
-- include any document in drafting state for the venture.
--
-- Bumped to 0009 because 0007 (the spec's number) is taken by venture_members
-- and 0008 by venture_identity. Documented in SPRINT.md.

set search_path = public;

-- ==================================================================
-- bridge_tiles — one row per visible venture, all tile state
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
  state             text,                  -- 'active' | 'idle' | 'quiet'
  pending_count     int,                   -- documents in draft|reviewing
  last_activity_at  timestamptz,           -- greatest of relevant timestamps
  vital_sign        text,                  -- short string for tile
  sparkline         jsonb,                 -- jsonb array of 8 numbers (oldest -> newest)
  connections       jsonb                  -- jsonb array of provider strings (max 3)
)
language sql
stable
as $$
  with visible_ventures as (
    -- Membership-scoped selection. Admin sees all; members see only assigned.
    -- This is the bright line enforced at the SQL layer.
    select v.*
    from ventures v
    where p_is_admin = true
       or v.id in (
         select vm.venture_id
         from venture_members vm
         where vm.user_id = p_user_id
       )
  ),

  -- Per-venture loop activity windows
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

  -- Per-venture document pending count (draft + reviewing). Capped at 99 by
  -- the client; we still return the true count here for accuracy.
  doc_pending as (
    select
      v.id as venture_id,
      count(d.id) filter (where d.status in ('draft','reviewing'))::int as pending_count,
      max(d.updated_at) as last_doc_updated_at
    from visible_ventures v
    left join documents d on d.venture_id = v.id
    group by v.id
  ),

  -- Per-venture event recency (any event ts)
  event_recency as (
    select
      v.id as venture_id,
      max(e.ts) as last_event_at
    from visible_ventures v
    left join events e on e.venture_id = v.id
    group by v.id
  ),

  -- Sparkline: events-per-day for last 8 days (oldest -> newest). Cheap and
  -- always populated. Replace later with metric_snapshots when each venture
  -- has a canonical sparkline metric.
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

  -- Latest meaningful event for vital_sign string (best-effort).
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

  -- Connections: first 3 distinct active providers per venture (alphabetical).
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
      when greatest(
        coalesce(la.last_24h_run,    'epoch'::timestamptz),
        coalesce(dp.last_doc_updated_at, 'epoch'::timestamptz),
        coalesce(er.last_event_at,   'epoch'::timestamptz)
      ) > now() - interval '24 hours' then 'idle'
      else 'quiet'
    end as state,
    coalesce(dp.pending_count, 0) as pending_count,
    -- last_activity_at = max of (latest run, latest doc edit, latest event)
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
    -- Slice to first 3 providers; jsonb_path_query_array gives a clean cap.
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
  left join doc_pending   dp on dp.venture_id = v.id
  left join event_recency er on er.venture_id = v.id
  left join latest_event  le on le.venture_id = v.id
  left join sparkline_agg sa on sa.venture_id = v.id
  left join conn_agg      ca on ca.venture_id = v.id
  order by
    case
      when la.last_active_run is not null then 0
      else 1
    end,
    coalesce(la.last_run_ever, dp.last_doc_updated_at, er.last_event_at, v.created_at) desc nulls last,
    v.name asc;
$$;

-- ==================================================================
-- DOWN MIGRATION (for reference; not auto-applied):
--
--   drop function if exists bridge_tiles(uuid, boolean);
--
-- No data dropped — function-only migration.
-- ==================================================================
