-- SoloDesk — Anomaly fingerprints for Loop 8 dedup (Sprint 11)
-- Migration: 0012
-- Date: 2026-05-07
--
-- Loop 8 reactive fires on webhook events, threshold breaches, and command
-- bar manual invocation. Multiple triggers can land in the same anomaly
-- bucket within a short window (e.g. Stripe sends a burst of webhook
-- events for a single batch payment failure). The fingerprint table
-- gives Loop 8 a single source of truth for "have we already produced a
-- Document for this anomaly?"
--
-- Fingerprint shape: SHA-256 over (venture_id || metric_kind || day_bucket).
-- Day-bucket prevents the same metric from re-firing within 24h while
-- still allowing a fresh Document the next day.
--
-- Bumped to 0012 because 0009 (the spec's number) is taken by
-- bridge_aggregation. Documented in SPRINT.md.

set search_path = public;

create table anomaly_fingerprints (
  id            uuid primary key default gen_random_uuid(),
  venture_id    uuid references ventures(id) on delete cascade not null,
  fingerprint   text not null,
  -- SHA-256 hex over (venture_id || ':' || metric_kind || ':' || day_bucket).
  -- Caller computes; we just store + index.
  document_id   uuid references documents(id) on delete set null,
  -- The Document this fingerprint produced. Null means dedup-only (the
  -- caller decided to suppress without producing).
  source        text not null check (source in ('webhook','threshold','manual')),
  payload       jsonb default '{}'::jsonb not null,
  -- Trigger context for audit: webhook body summary, metric stats, or
  -- the operator's command-bar query.
  created_at    timestamptz default now() not null,

  unique (venture_id, fingerprint)
);

create index anomaly_fingerprints_venture_recent_idx
  on anomaly_fingerprints (venture_id, created_at desc);
