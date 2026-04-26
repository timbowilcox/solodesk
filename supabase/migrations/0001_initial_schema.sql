-- SoloDesk — Initial Schema
-- Migration: 0001
-- Date: 2026-04-26
--
-- Creates all tables SoloDesk needs through Sprint 6. Some tables won't be
-- written to until later sprints, but they exist from day one to avoid
-- migration churn. Empty tables cost nothing.
--
-- Single-org logically in v0. RLS off. Enable RLS at productisation time.

set search_path = public;

-- ==================================================================
-- ALLOWED_USERS — auth allowlist with role
-- ==================================================================

create table allowed_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  role          text not null default 'member' check (role in ('admin','member')),
  invited_by    uuid references allowed_users(id) on delete set null,
  invited_at    timestamptz default now() not null,
  last_login    timestamptz,
  active        boolean default true not null,
  notes         text
);

create index allowed_users_email_idx on allowed_users (email) where active = true;

-- ==================================================================
-- WAITLIST_SIGNUPS — public landing page signups
-- ==================================================================

create table waitlist_signups (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  source          text default 'landing',     -- 'landing','social','direct', etc.
  meta            jsonb default '{}'::jsonb,
  confirmed_at    timestamptz,                -- when Resend confirmation succeeded
  invited_at      timestamptz,                -- when promoted from waitlist to allowed_users
  notes           text,
  created_at      timestamptz default now() not null
);

create index waitlist_signups_created_at_idx on waitlist_signups (created_at desc);

-- ==================================================================
-- VENTURES
-- ==================================================================

create table ventures (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  phase           text not null check (phase in ('discovery','build','launch','scale','dormant')),
  north_star      text,
  company_md      text,
  loops_enabled   jsonb default '[]'::jsonb,
  intel_sources   jsonb default '[]'::jsonb,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

create index ventures_phase_idx on ventures (phase);

-- ==================================================================
-- EVENTS — universal append-only log
-- ==================================================================

create table events (
  id              uuid primary key default gen_random_uuid(),
  ts              timestamptz default now() not null,
  venture_id      uuid references ventures(id) on delete cascade,
  source          text not null,        -- 'stripe','github','vercel','resend','manual','agent:<name>'
  type            text not null,        -- domain event type
  actor           text,                 -- email, agent name, system
  payload         jsonb default '{}'::jsonb not null,
  hash            text                  -- idempotency key for webhook ingestion
);

create index events_venture_ts_idx on events (venture_id, ts desc);
create index events_type_idx on events (type);
create index events_source_idx on events (source);
create unique index events_hash_idx on events (hash) where hash is not null;

-- ==================================================================
-- DECISIONS — Loop 1 + Loop 10 artifacts
-- ==================================================================

create table decisions (
  id                uuid primary key default gen_random_uuid(),
  venture_id        uuid references ventures(id) on delete cascade,
  ts                timestamptz default now() not null,
  title             text not null,
  recommendation    text,
  alternatives      text,
  kill_criteria     text,
  status            text not null default 'proposed'
                    check (status in ('proposed','approved','rejected','active','killed','superseded')),
  outcome           text,
  generator_agent   text,
  reviewer_agent    text,
  reviewer_notes    text,
  reviewer_score    int check (reviewer_score between 1 and 10),
  human_decision    text,
  reviewed_at       timestamptz,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

create index decisions_venture_status_idx on decisions (venture_id, status);
create index decisions_ts_idx on decisions (ts desc);

-- ==================================================================
-- ARTIFACTS — content posts, intel digests, support replies, strategy docs
-- ==================================================================

create table artifacts (
  id                uuid primary key default gen_random_uuid(),
  venture_id        uuid references ventures(id) on delete cascade,
  ts                timestamptz default now() not null,
  loop_name         text not null,
  type              text not null,
  status            text not null default 'draft'
                    check (status in ('draft','reviewing','approved','rejected','published','archived')),
  content           jsonb default '{}'::jsonb not null,
  generator_agent   text,
  reviewer_agent    text,
  reviewer_notes    text,
  reviewer_score    int check (reviewer_score between 1 and 10),
  published_at      timestamptz,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

create index artifacts_venture_loop_idx on artifacts (venture_id, loop_name);
create index artifacts_status_idx on artifacts (status);

-- ==================================================================
-- LOOP_RUNS — budget tracking for every agent invocation
-- ==================================================================

create table loop_runs (
  id                  uuid primary key default gen_random_uuid(),
  ts                  timestamptz default now() not null,
  loop_name           text not null,
  venture_id          uuid references ventures(id) on delete cascade,
  trigger             text,
  input               jsonb default '{}'::jsonb not null,
  output_artifact_id  uuid references artifacts(id) on delete set null,
  output_decision_id  uuid references decisions(id) on delete set null,
  status              text not null
                      check (status in ('running','succeeded','failed','blown_budget','cancelled')),
  tokens_in           int default 0,
  tokens_out          int default 0,
  cost_cents          int default 0,
  duration_ms         int,
  budget_tokens       int,
  budget_cents        int,
  model               text,
  error_message       text
);

create index loop_runs_loop_ts_idx on loop_runs (loop_name, ts desc);
create index loop_runs_venture_ts_idx on loop_runs (venture_id, ts desc);
create index loop_runs_status_idx on loop_runs (status);

-- ==================================================================
-- METRIC_SNAPSHOTS — Loop 8 daily rollups
-- ==================================================================

create table metric_snapshots (
  id              uuid primary key default gen_random_uuid(),
  venture_id      uuid references ventures(id) on delete cascade,
  metric_name     text not null,
  ts              date not null,
  value           numeric,
  meta            jsonb default '{}'::jsonb,
  created_at      timestamptz default now() not null,
  unique (venture_id, metric_name, ts)
);

create index metric_snapshots_venture_metric_idx on metric_snapshots (venture_id, metric_name, ts desc);

-- ==================================================================
-- ANOMALIES — Loop 8 anomaly tracking
-- ==================================================================

create table anomalies (
  id              uuid primary key default gen_random_uuid(),
  ts              timestamptz default now() not null,
  venture_id      uuid references ventures(id) on delete cascade,
  metric_name     text not null,
  observed_value  numeric,
  expected_low    numeric,
  expected_high   numeric,
  severity        text check (severity in ('low','medium','high')),
  explanation     text,
  status          text default 'open'
                  check (status in ('open','investigating','explained','dismissed')),
  loop_run_id     uuid references loop_runs(id) on delete set null
);

create index anomalies_venture_status_idx on anomalies (venture_id, status);

-- ==================================================================
-- SUPPORT_TICKETS — Loop 6
-- ==================================================================

create table support_tickets (
  id                uuid primary key default gen_random_uuid(),
  venture_id        uuid references ventures(id) on delete cascade,
  ts                timestamptz default now() not null,
  external_id       text,
  from_address      text,
  subject           text,
  body              text,
  classification    text check (classification in ('bug','question','churn_risk','feature_request','spam','unclear')),
  classifier_score  numeric,
  status            text default 'new'
                    check (status in ('new','classified','drafted','approved','sent','escalated','closed')),
  draft_reply_id    uuid references artifacts(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

create index support_tickets_venture_status_idx on support_tickets (venture_id, status);
create unique index support_tickets_external_id_idx on support_tickets (external_id) where external_id is not null;

-- ==================================================================
-- updated_at triggers
-- ==================================================================

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger ventures_updated_at before update on ventures
  for each row execute function set_updated_at();
create trigger decisions_updated_at before update on decisions
  for each row execute function set_updated_at();
create trigger artifacts_updated_at before update on artifacts
  for each row execute function set_updated_at();
create trigger support_tickets_updated_at before update on support_tickets
  for each row execute function set_updated_at();
