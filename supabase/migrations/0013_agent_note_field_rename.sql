-- SoloDesk — agent_note field rename: decision → assumption + deferred section status
-- Migration: 0013
-- Date: 2026-05-12
-- Sprint: B.5
--
-- Root cause: `content.decision` carried two conflicting meanings depending on
-- which loop wrote the Section:
--   - Loop 1 streaming runner: operator's response (empty until they fill it)
--   - office-hours, support-replier, content-writer, support-triage generators:
--     LLM's assumption pre-filled at generation time
--
-- `isAgentNoteResolved` checks `content.decision` non-empty as the resolution
-- signal, so LLM-pre-filled Sections always appeared resolved. The enforcement
-- gate in `approveDecisionDocument` was defeated at the data layer.
--
-- This migration:
--   1. Adds 'deferred' to the sections.status check constraint so the Defer
--      affordance can write a valid status.
--   2. Backfills in-flight Documents (status 'draft' or 'reviewing'): copies
--      `content.decision` → `content.assumption`, clears `content.decision`.
--      Already-approved Documents are left untouched (historical record).
--   3. Updates the embedding text trigger to prefer `assumption` over `decision`
--      so new-shape agent_notes remain recall-searchable.
--
-- Approved Documents are NOT touched. Their approval is historical record;
-- the component reads `assumption` with a fallback to `decision` for legacy
-- display, so old-shape approved Documents still render correctly.

set search_path = public;

-- ==================================================================
-- 1. Add 'deferred' to sections.status check constraint
-- ==================================================================

alter table sections drop constraint if exists sections_status_check;
alter table sections add constraint sections_status_check
  check (status in (
    'draft',
    'reviewing',
    'approved',
    'revising',
    'rejected',
    'dismissed',
    'deferred'    -- new: operator deferred resolution; re-surfaces at next briefing
  ));

-- ==================================================================
-- 2. Backfill in-flight agent_note Sections
--    Copy decision → assumption, clear decision.
--    Scope: kind='agent_note', decision non-empty, assumption absent,
--           parent Document in draft or reviewing status.
-- ==================================================================

UPDATE sections s
SET content = jsonb_set(
               jsonb_set(s.content, '{assumption}', s.content -> 'decision'),
               '{decision}',
               '""'
             )
WHERE s.kind = 'agent_note'
  AND (s.content ->> 'decision') IS NOT NULL
  AND (s.content ->> 'decision') != ''
  AND s.content -> 'assumption' IS NULL
  AND EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = s.document_id
      AND d.status IN ('draft', 'reviewing')
  );

-- ==================================================================
-- 3. Update embedding text trigger for agent_note sections
--    Prefer assumption; fall back to decision for legacy rows.
-- ==================================================================

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
      'A: ' || coalesce(
        nullif(new.content->>'assumption', ''),
        nullif(new.content->>'decision', ''),
        ''
      ))
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

-- ==================================================================
-- DOWN MIGRATION (for reference; not auto-applied):
--
--   UPDATE sections s
--   SET content = jsonb_set(
--                  jsonb_set(s.content, '{decision}', s.content -> 'assumption'),
--                  '{assumption}',
--                  'null'::jsonb
--                )
--   WHERE s.kind = 'agent_note'
--     AND s.content -> 'assumption' IS NOT NULL;
--
--   alter table sections drop constraint sections_status_check;
--   alter table sections add constraint sections_status_check
--     check (status in (
--       'draft','reviewing','approved','revising','rejected','dismissed'
--     ));
--   -- Restore original trigger by re-running 0003_documents.sql trigger block.
-- ==================================================================
