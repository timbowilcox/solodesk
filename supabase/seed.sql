-- SoloDesk — Sprint 0 seed
-- Run AFTER `0001_initial_schema.sql` is applied.
-- Idempotent: re-running should be a no-op.

-- Admin allowlist row.
insert into allowed_users (email, role, active, notes)
values ('tim@solodesk.ai', 'admin', true, 'Sprint 0 seed — sole admin')
on conflict (email) do nothing;

-- Kounta venture (stub COMPANY.md — real content lands in Sprint 1).
insert into ventures (slug, name, phase, north_star, company_md)
values (
  'kounta',
  'Kounta',
  'build',
  'MRR',
  'AI-native accounting infrastructure — COMPANY.md to be filled in Sprint 1.'
)
on conflict (slug) do nothing;
