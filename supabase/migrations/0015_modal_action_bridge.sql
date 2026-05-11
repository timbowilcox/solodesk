-- 0015_modal_action_bridge.sql
--
-- Closes the modal→action loop: modal button taps now write back to the DB.
--
-- New columns:
--   actions.via_modal         — marks action rows that were invoked via modal approval
--   modal_events.payload      — archetype-specific context (e.g., promotion target level)
--
-- New table:
--   deferred_actions          — carries the full replay payload for gated tool calls.
--                               Written by the gateway on every gate, consumed by:
--                               (a) applyModalAction on Decision approve (immediate replay)
--                               (b) the deferred-replay cron for Promotion "decide later"
--                                   (retry_at = fired_at + 7 days)

-- ─── actions.via_modal ───────────────────────────────────────────────────────

ALTER TABLE actions ADD COLUMN IF NOT EXISTS via_modal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN actions.via_modal IS
  'True when this action row represents a re-execution triggered by an operator '
  'approving a Decision or Escalation modal (not an autonomous run).';

-- ─── modal_events.payload ────────────────────────────────────────────────────

ALTER TABLE modal_events ADD COLUMN IF NOT EXISTS payload jsonb;

COMMENT ON COLUMN modal_events.payload IS
  'Archetype-specific context stored at fire time. '
  'Promotion: {"from_level":"advise","to_level":"operate","approvals":20}. '
  'Question: {"options":[...]}. '
  'Decision: {"skill_id":"...","tool":"..."}. '
  'Other archetypes: null or empty.';

-- ─── deferred_actions ────────────────────────────────────────────────────────
-- One row per gated tool call. Carries the full replay payload so the
-- deferred-replay cron can re-invoke without any runtime context.
--
-- status flow:
--   pending  → approved (Decision/Escalation approve) → replayed | failed
--   pending  → rejected (Decision reject / Escalation reject)
--   pending  → deferred (Promotion "decide later"; retry_at = +7d)
--   deferred → approved (on next surfacing and approval)

CREATE TABLE IF NOT EXISTS deferred_actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  modal_event_id  uuid        REFERENCES modal_events(id) ON DELETE CASCADE,
  action_id       uuid        REFERENCES actions(id)      ON DELETE CASCADE,
  skill_id        text        NOT NULL,
  tool            text        NOT NULL,
  params          jsonb       NOT NULL DEFAULT '{}',
  venture_id      uuid        REFERENCES ventures(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected','deferred','replayed','failed')),
  retry_at        timestamptz NOT NULL DEFAULT now(),
  replayed_at     timestamptz,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup for the cron: approved/pending rows ready to replay now.
CREATE INDEX IF NOT EXISTS deferred_actions_ready_idx
  ON deferred_actions(retry_at, status)
  WHERE status IN ('approved', 'pending');

-- Lookup by modal for the action bridge.
CREATE INDEX IF NOT EXISTS deferred_actions_modal_idx
  ON deferred_actions(modal_event_id);
