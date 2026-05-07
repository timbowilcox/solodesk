-- SoloDesk — Team membership (Sprint 7 / Loop team-inbound)
-- Migration: 0007
-- Date: 2026-05-07
--
-- venture_members maps allowed_users to the ventures they have access to.
-- Required for role-gated visibility: a teammate assigned to one venture
-- can't see another venture's data; the operator (admin role on
-- allowed_users) sees all.
--
-- Cross-venture leakage is enforced at the application layer in v0
-- (RLS off everywhere). When productisation flips RLS on, venture_members
-- becomes the authorisation hinge across every authed surface.

set search_path = public;

create table venture_members (
  id            uuid primary key default gen_random_uuid(),
  venture_id    uuid references ventures(id) on delete cascade not null,
  user_id       uuid references allowed_users(id) on delete cascade not null,
  role          text not null default 'viewer'
                check (role in ('operator','editor','viewer')),
  -- 'operator' = full access (read + write + invoke loops)
  -- 'editor'   = read + write (cannot revoke connections)
  -- 'viewer'   = read-only
  created_by    uuid references allowed_users(id) on delete set null,
  created_at    timestamptz default now() not null,
  unique (venture_id, user_id)
);

create index venture_members_user_idx on venture_members (user_id);
create index venture_members_venture_idx on venture_members (venture_id);
