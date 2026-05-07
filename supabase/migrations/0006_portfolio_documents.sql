-- SoloDesk — Portfolio-scoped documents
-- Migration: 0006
-- Date: 2026-05-07
-- Sprint: 7 (Loop 11 — portfolio audit)
--
-- Loop 11 is the deliberate exception to the "venture-scoped Document"
-- pattern. Its output is portfolio-scope — a Document that aggregates
-- findings across every venture. Drop the NOT NULL constraint on
-- documents.venture_id so portfolio docs can exist.
--
-- The recall layer is unaffected: match_sections joins on
-- documents.venture_id = p_venture_id, so portfolio docs (venture_id
-- IS NULL) are naturally filtered out of every venture-scoped recall
-- call. Cross-venture context isolation remains intact.

set search_path = public;

alter table documents alter column venture_id drop not null;

-- For Loop 11 idempotency: one portfolio audit per date_key.
create index if not exists documents_portfolio_idx
  on documents (type, (metadata->>'date_key'))
  where venture_id is null;
