-- SoloDesk — The Day item dismissals (Sprint 9 / Experience layer)
-- Migration: 0010
-- Date: 2026-05-07
--
-- The Day surface curates items needing operator attention. Click-to-dismiss
-- is an operator-explicit action — per design-system.md it is observation/
-- curation, not communication, so it does not require the external-send
-- ceremony. The dismissal expires at next 06:00 local time, so a still-pending
-- item reappears the following day.
--
-- Schema: (user_id, item_type, item_id, dismissed_at). user_id keys the row
-- to the operator (admin or member) who dismissed it; admin and member have
-- their own dismissal sets so role changes don't leak state.
--
-- Bright line: dismissals are user-scoped. No path here that touches
-- venture-scoped data — the items themselves are filtered at curate time
-- by membership; the dismissal table just records which (user_id, item_id)
-- combos to suppress.
--
-- Bumped to 0010 because 0007 (the spec's number) is taken by venture_members,
-- 0008 by venture_identity, 0009 by bridge_aggregation. Documented in SPRINT.md.

set search_path = public;

create table day_item_dismissals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references allowed_users(id) on delete cascade not null,
  item_type     text not null check (item_type in (
    'document',         -- pending_review documents
    'agent_note',       -- open agent_note sections
    'anomaly',          -- recent open anomalies
    'support_ticket'    -- new support tickets ('inbound' surface in v0)
  )),
  item_id       uuid not null,
  -- Reference is loose because items live across multiple tables.
  -- curate.ts joins back to source rows and filters out dismissals.
  dismissed_at  timestamptz default now() not null,

  -- One active dismissal per (user, item). If the operator un-dismisses
  -- (toggle), we delete the row rather than tracking history.
  unique (user_id, item_type, item_id)
);

create index day_item_dismissals_user_idx
  on day_item_dismissals (user_id, dismissed_at desc);

create index day_item_dismissals_lookup_idx
  on day_item_dismissals (user_id, item_type, item_id);

-- ==================================================================
-- DOWN MIGRATION (for reference; not auto-applied):
--
--   drop table if exists day_item_dismissals;
--
-- All dismissal state lost on rollback. Items will all re-appear in The
-- Day next render — recoverable by the operator simply re-dismissing.
-- ==================================================================
