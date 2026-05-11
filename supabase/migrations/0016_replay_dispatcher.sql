-- 0016_replay_dispatcher.sql
--
-- Extends the deferred-replay infrastructure from migration 0015.
--
-- Changes:
--   1. deferred_actions.status — adds 'executing' (row is being replayed by
--      the cron) and 'executed' (replay succeeded) to the CHECK constraint.
--      'replayed' is kept for backwards compatibility.
--
--   2. actions.deferred_action_id — FK back to the deferred_actions row that
--      triggered this replay. NULL on original (non-replayed) actions rows.
--
--   3. actions.modal_event_id — FK back to the modal_events row that approved
--      the replay. NULL on original actions rows.
--
-- These columns allow the audit trail to link: modal approval → replay → action.

-- ─── deferred_actions: extend status CHECK ───────────────────────────────────

ALTER TABLE deferred_actions DROP CONSTRAINT IF EXISTS deferred_actions_status_check;

ALTER TABLE deferred_actions
  ADD CONSTRAINT deferred_actions_status_check
  CHECK (status IN (
    'pending', 'approved', 'rejected', 'deferred',
    'replayed', 'failed',
    'executing', 'executed'
  ));

-- ─── actions: replay FK columns ──────────────────────────────────────────────

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS deferred_action_id uuid REFERENCES deferred_actions(id);

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS modal_event_id uuid REFERENCES modal_events(id);

CREATE INDEX IF NOT EXISTS actions_deferred_action_idx
  ON actions(deferred_action_id)
  WHERE deferred_action_id IS NOT NULL;

COMMENT ON COLUMN actions.deferred_action_id IS
  'Set on replayed actions only. Links this action row to the deferred_actions '
  'row that triggered the replay after operator approval.';

COMMENT ON COLUMN actions.modal_event_id IS
  'Set on replayed actions only. Links this action row to the modal_events row '
  'through which the operator granted approval.';
