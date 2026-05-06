-- SoloDesk — Connections layer
-- Migration: 0004
-- Date: 2026-05-06
-- Sprint: 1.3
--
-- STATUS: DRAFT — DO NOT APPLY YET.
--
-- This migration is pre-written and committed alongside Sprint 1.3's spec
-- (`/.claude/sprints/sprint-1.3-connections-layer.md`). It will be applied
-- during the Sprint 1.3 build session, AFTER Sprint 1.1's `0003_documents.sql`
-- ships and BEFORE Sprint 2 (metrics digest), which is the first Loop that
-- needs external venture credentials (Stripe, Resend webhook signing key, etc).
-- Holding the migration in draft form keeps the substrate decision visible in
-- the repo without committing the schema until the design has been reviewed.
--
-- WHY THIS LAYER
--
-- Sprint 2 ships the first Loop (Loop 8 — daily metrics digest) that needs to
-- read from venture-owned external systems. Without a substrate for connections,
-- Sprint 2 ships a one-off shim — env vars per venture, hand-rolled secret
-- handling, no audit trail, no revocation. Every subsequent Loop (Loop 4
-- publishing via Resend, Loop 5 web fetches, Loop 6 reading support inbox,
-- and post-v0 Loops touching NetSuite, Mixpanel, Plausible, Twilio) would
-- copy that shim and tax it further.
--
-- Building it once, here, makes the bright line architecturally enforceable:
-- every Loop's external API call goes through `getConnection({ ventureId, provider })`
-- which writes a `connection_audit` row before returning credentials.
--
-- BRIGHT LINE — CROSS-VENTURE CREDENTIAL ISOLATION
--
-- Identical to the recallContext bright line: a `getConnection` call scoped
-- to venture A can never return credentials for venture B. Enforced at the
-- application layer in v0 (RLS policies prepared but not enabled — see notes
-- at end of file). When productisation flips RLS on, these are the FIRST two
-- tables to enable it on.
--
-- ENCRYPTION AT REST
--
-- Credential payloads are stored in `vault.secrets` (Supabase Vault, which
-- wraps pgsodium). The `connections` table holds only a `vault_secret_id`
-- reference plus non-sensitive metadata. This means:
--   - Direct dumps of `connections` never leak credentials
--   - Backups handle credential encryption transparently
--   - Rotation is decoupled from connection identity
-- Supabase Vault is enabled by default on modern Supabase projects. If for
-- some reason it isn't on this project, enable it via Studio → Vault before
-- applying this migration.

set search_path = public;

-- ==================================================================
-- CONNECTIONS — venture-scoped credentials for external providers
-- ==================================================================

create table connections (
  id              uuid primary key default gen_random_uuid(),
  venture_id      uuid not null references ventures(id) on delete cascade,
  provider        text not null,
  -- Provider name — lowercase short slug. Examples:
  --   'stripe', 'resend', 'plausible', 'mixpanel', 'netsuite',
  --   'twilio', 'github_app', 'vercel_team', 'webflow'
  -- Per-venture per-provider connections may be repeated when a venture has
  -- multiple environments (sandbox + prod) or sub-accounts. `display_name`
  -- disambiguates.
  display_name    text not null,
  -- Operator-facing label, e.g. 'Kounta Production Stripe',
  -- 'Counsel Sandbox NetSuite'. Shown in the venture settings UI.
  vault_secret_id uuid not null,
  -- References vault.secrets.id (Supabase Vault). The decrypted payload is
  -- a provider-shaped JSON object: { api_key, refresh_token, account_id,
  -- base_url, ... } depending on the provider's auth shape.
  scope_metadata  jsonb default '{}'::jsonb not null,
  -- Non-sensitive descriptors that survive in plain text, queryable.
  -- Examples: { environment: 'prod' | 'sandbox', region, account_email,
  -- service_account_subject }. NEVER put credential material here.
  created_by      uuid references allowed_users(id) on delete set null,
  -- The operator who created this connection (Tim, in v0). Distinct from the
  -- credential's principal: `created_by` is a SoloDesk identity; the encrypted
  -- payload is for a service account at the provider, never the operator's
  -- personal credentials. Enforced by convention + connection-creation UI copy.
  created_at      timestamptz default now() not null,
  revoked_at      timestamptz,
  -- Soft delete. Revoked rows retain audit history; new connections for the
  -- same (venture, provider, display_name) tuple are allowed once the prior
  -- one is revoked (see exclusion constraint below).

  -- One ACTIVE connection per (venture, provider, display_name). Multiple
  -- revoked rows can coexist for the same tuple — they're history.
  constraint connections_unique_active
    exclude using btree (
      venture_id with =,
      provider with =,
      display_name with =
    )
    where (revoked_at is null)
);

create index connections_venture_provider_idx
  on connections (venture_id, provider)
  where revoked_at is null;

create index connections_provider_idx
  on connections (provider)
  where revoked_at is null;

-- ==================================================================
-- CONNECTION_AUDIT — every fetch, rotation, creation, revocation
-- ==================================================================
-- Application contract: getConnection({ ventureId, provider, loopRunId,
-- requestSummary }) writes ONE row here per call, BEFORE handing back
-- the decrypted credential. Direct SQL reads of `connections` for credential
-- access bypass the audit trail and are an anti-pattern — surfaced by the
-- evaluator agent as a hard fail.

create table connection_audit (
  id                  uuid primary key default gen_random_uuid(),
  connection_id       uuid not null references connections(id) on delete cascade,
  action              text not null check (action in (
    'fetched',     -- credential decrypted and returned to a caller
    'rotated',     -- secret payload replaced (vault_secret_id changed)
    'created',     -- connection inserted
    'revoked',     -- revoked_at stamped
    'denied'       -- access attempted but rejected (e.g. wrong venture scope)
  )),
  called_by_loop_id   uuid references loop_runs(id) on delete set null,
  -- The loop_runs row that triggered the call. Null for operator-initiated
  -- actions ('created', 'rotated', 'revoked' from the settings UI) or for
  -- system-level fetches that aren't loop-attributable.
  called_at           timestamptz default now() not null,
  request_summary     text,
  -- Human-readable summary of what the credential was used for, e.g.
  -- 'GET https://api.stripe.com/v1/charges?limit=100' or 'POST email/send'.
  -- Caller-supplied; getConnection enforces presence.
  response_status     int
  -- HTTP response status if applicable, populated by the caller after the
  -- external request completes. Null for non-HTTP actions and for fetches
  -- where the caller never reports back. Best-effort; the row landing at
  -- 'fetched' time is the audit guarantee, response_status is convenience.
);

create index connection_audit_connection_called_idx
  on connection_audit (connection_id, called_at desc);

create index connection_audit_loop_called_idx
  on connection_audit (called_by_loop_id, called_at desc)
  where called_by_loop_id is not null;

-- ==================================================================
-- RLS READINESS — DO NOT ENABLE IN V0
-- ==================================================================
-- v0 is single-org logically (single operator, no team accounts mapping to
-- ventures). Application-layer enforcement via getConnection() is the v0
-- bright line. RLS is prepared here for the productisation flip — when v1
-- introduces multi-operator team membership, these are the FIRST tables to
-- enable RLS on, before any others. Credentials have the highest blast
-- radius if leaked across ventures.
--
-- The policies below are illustrative — they assume a future
-- venture_members(venture_id, user_id) table not in scope for v0. Do not
-- uncomment until that table exists and the productise call is made.
--
-- alter table connections enable row level security;
-- alter table connection_audit enable row level security;
--
-- create policy connections_member_read on connections
--   for select to authenticated
--   using (
--     venture_id in (
--       select venture_id from venture_members where user_id = auth.uid()
--     )
--   );
--
-- create policy connection_audit_member_read on connection_audit
--   for select to authenticated
--   using (
--     connection_id in (
--       select id from connections where venture_id in (
--         select venture_id from venture_members where user_id = auth.uid()
--       )
--     )
--   );
--
-- Mutations remain service-role-only in v1 too — operators create/rotate/
-- revoke through the settings UI which calls server actions running with
-- the service role key.
