-- 0013_autonomy_control_plane.sql
--
-- Autonomy control plane tables for Phase B.
-- Four behavioural tables + three substrate tables.
--
-- Tables created:
--   autonomy_levels   — scope-level autonomy settings (operator/venture/loop/skill)
--   guardrails        — declarative constraints per scope
--   actions           — audit trail for every tool call through the gateway
--   escalations       — records gateway escalations (guardrail breach, anomaly)
--   eval_runs         — substrate for B.4 trust ratchet
--   modal_events      — telemetry for every modal surfacing (substrate for B.2)
--   operator_kill_switch — single-row-per-operator global kill switch state
--
-- RLS: disabled in v0 (single-org). Stubs prepared as comments.
-- Phase C flips RLS on; autonomy + connections tables go first.

-- ─── autonomy_levels ──────────────────────────────────────────────────────────

CREATE TABLE autonomy_levels (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type      text        NOT NULL CHECK (scope_type IN ('operator', 'venture', 'loop', 'skill')),
  scope_id        uuid        NOT NULL,
  level           text        NOT NULL CHECK (level IN ('advise', 'operate', 'steward')),
  set_at          timestamptz NOT NULL DEFAULT now(),
  set_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  hard_advise_only boolean   NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One effective row per scope (most recent set_at wins at query time; the
-- gateway resolves precedence in application code).
CREATE INDEX idx_autonomy_levels_scope ON autonomy_levels(scope_type, scope_id);
CREATE INDEX idx_autonomy_levels_scope_at ON autonomy_levels(scope_type, scope_id, set_at DESC);

-- Phase C RLS stub (enable and uncomment when multi-tenant):
-- ALTER TABLE autonomy_levels ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "tenant_isolation" ON autonomy_levels
--   USING (scope_id IN (SELECT id FROM ventures WHERE workspace_id = auth.jwt()->>'workspace_id'));

-- ─── guardrails ───────────────────────────────────────────────────────────────

CREATE TABLE guardrails (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type     text        NOT NULL CHECK (scope_type IN ('operator', 'venture', 'loop', 'skill')),
  scope_id       uuid        NOT NULL,
  guardrail_type text        NOT NULL CHECK (guardrail_type IN (
    'budget_cap',
    'communication_cap',
    'recipient_allowlist',
    'brand_voice',
    'topic_blocklist',
    'time_window',
    'volume_cap'
  )),
  config         jsonb       NOT NULL DEFAULT '{}',
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guardrails_scope ON guardrails(scope_type, scope_id);
CREATE INDEX idx_guardrails_scope_active ON guardrails(scope_type, scope_id, active);

-- ─── actions ─────────────────────────────────────────────────────────────────
-- Audit trail. Written BEFORE any tool is invoked (fail-closed).
-- A missing actions row means the tool was never attempted.

CREATE TABLE actions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id       text        NOT NULL,
  venture_id     uuid        REFERENCES ventures(id) ON DELETE CASCADE,
  tool           text        NOT NULL,
  params         jsonb       NOT NULL DEFAULT '{}',
  autonomy_level text        NOT NULL CHECK (autonomy_level IN ('advise', 'operate', 'steward')),
  modal_surfaced boolean     NOT NULL DEFAULT false,
  result         jsonb,
  error          text,
  duration_ms    integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_actions_skill_created  ON actions(skill_id, created_at DESC);
CREATE INDEX idx_actions_venture_created ON actions(venture_id, created_at DESC);
CREATE INDEX idx_actions_tool_created   ON actions(tool, created_at DESC);

-- ─── escalations ─────────────────────────────────────────────────────────────

CREATE TABLE escalations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    uuid        NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  skill_id     text        NOT NULL,
  reason       text        NOT NULL,
  trigger_type text        NOT NULL CHECK (trigger_type IN (
    'guardrail_breach',
    'anomaly',
    'classifier_fail',
    'config_error'
  )),
  escalated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  resolution   text        CHECK (resolution IN ('approved', 'rejected', 'demoted'))
);

CREATE INDEX idx_escalations_skill_escalated ON escalations(skill_id, escalated_at DESC);
CREATE INDEX idx_escalations_action ON escalations(action_id);
CREATE INDEX idx_escalations_unresolved ON escalations(escalated_at DESC)
  WHERE resolved_at IS NULL;

-- ─── eval_runs ───────────────────────────────────────────────────────────────
-- Substrate for B.4 trust ratchet. Populated when an operator approves,
-- rejects, or defers a Decision modal action.

CREATE TABLE eval_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    uuid        REFERENCES actions(id) ON DELETE SET NULL,
  skill_id     text        NOT NULL,
  outcome      text        NOT NULL CHECK (outcome IN (
    'approved',
    'rejected',
    'deferred',
    'anomaly',
    'breach'
  )),
  notes        text,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eval_runs_skill_evaluated ON eval_runs(skill_id, evaluated_at DESC);
CREATE INDEX idx_eval_runs_skill_outcome   ON eval_runs(skill_id, outcome, evaluated_at DESC);

-- ─── modal_events ────────────────────────────────────────────────────────────
-- Telemetry for every modal surfacing. B.2 reads this to render the queue.
-- B.4 trust ratchet reads approved/rejected rows via eval_runs.

CREATE TABLE modal_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype        text        NOT NULL CHECK (archetype IN (
    'decision',
    'brief',
    'insight',
    'alert',
    'completion',
    'question',
    'promotion',
    'escalation'
  )),
  scope_id         uuid        NOT NULL,
  scope_type       text        NOT NULL CHECK (scope_type IN ('operator', 'venture', 'loop', 'skill')),
  action_id        uuid        REFERENCES actions(id) ON DELETE SET NULL,
  fired_at         timestamptz NOT NULL DEFAULT now(),
  dismissed_at     timestamptz,
  action_taken     text,
  time_to_action_ms integer
);

CREATE INDEX idx_modal_events_scope_fired  ON modal_events(scope_id, fired_at DESC);
CREATE INDEX idx_modal_events_archetype    ON modal_events(archetype, fired_at DESC);
CREATE INDEX idx_modal_events_undismissed  ON modal_events(fired_at DESC)
  WHERE dismissed_at IS NULL;

-- ─── operator_kill_switch ────────────────────────────────────────────────────
-- Single row per operator. Global kill switch state.
-- kill_state survives process restarts (DB-backed, not in-memory).
-- Restore is a separate explicit action (restored_at timestamp; no toggling).

CREATE TABLE operator_kill_switch (
  operator_id  uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  killed       boolean     NOT NULL DEFAULT false,
  killed_at    timestamptz,
  killed_reason text,
  restored_at  timestamptz
);

-- ─── helper: upsert kill switch row for a user ────────────────────────────────
-- Called by killAllAutonomy / restoreAutonomy server actions.
-- Idempotent; safe to call on every login in future.
CREATE OR REPLACE FUNCTION ensure_kill_switch_row(p_operator_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO operator_kill_switch (operator_id)
  VALUES (p_operator_id)
  ON CONFLICT (operator_id) DO NOTHING;
END;
$$;
