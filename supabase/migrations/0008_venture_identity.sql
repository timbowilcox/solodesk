-- SoloDesk — Venture identity (Sprint 7 / Experience layer)
-- Migration: 0008
-- Date: 2026-05-07
--
-- Adds visual identity to ventures: an accent_color (hex) and a mark_slug
-- (enum) that the /components/venture/ component library consumes. Per
-- the design-system.md venture-identity section, accents are scoped to
-- venture-displaying surfaces only (chrome stays SoloDesk palette).
--
-- mark_slug is the discriminator the renderer uses to look up SVG path
-- data in /lib/venture/marks.ts. Six known marks plus a 'generic'
-- fallback for ventures created in the future without a custom mark.
--
-- Migration number is 0008 not 0006 (per spec) because 0006 was used
-- by portfolio_documents (Loop 11) and 0007 by venture_members (team
-- inbound substrate). Spec authored before that knowledge — bumping
-- here keeps the linear sequence intact.

set search_path = public;

alter table ventures add column if not exists accent_color text;
alter table ventures add column if not exists mark_slug text default 'generic';

-- Constrain accent_color to a 7-char hex format. Allows null while
-- backfill rolls; backfill below sets defaults for known slugs.
alter table ventures
  add constraint ventures_accent_color_format
  check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');

-- Constrain mark_slug to known values. Adding a new venture mark =
-- migration to extend this enum + add data to /lib/venture/marks.ts.
alter table ventures
  add constraint ventures_mark_slug_known
  check (mark_slug in (
    'kounta',
    'corum',
    'counsel',
    'canemate',
    'realstyler',
    'realtelligence',
    'generic'
  ));

-- Backfill existing rows by slug. Idempotent — only sets when accent
-- is null so re-running the migration doesn't clobber operator overrides.
update ventures set
  accent_color = '#3B6D11',
  mark_slug = 'kounta'
where slug = 'kounta' and accent_color is null;

update ventures set
  accent_color = '#185FA5',
  mark_slug = 'corum'
where slug = 'corum' and accent_color is null;

update ventures set
  accent_color = '#A32D2D',
  mark_slug = 'counsel'
where slug = 'counsel' and accent_color is null;

update ventures set
  accent_color = '#633806',
  mark_slug = 'canemate'
where slug = 'canemate' and accent_color is null;

update ventures set
  accent_color = '#993C1D',
  mark_slug = 'realstyler'
where slug = 'realstyler' and accent_color is null;

update ventures set
  accent_color = '#2C2C2A',
  mark_slug = 'realtelligence'
where slug = 'realtelligence' and accent_color is null;

-- Any remaining ventures (not in the known six) get the generic fallback
-- with a neutral accent so the bright line "no inline marks" still holds.
update ventures set
  accent_color = '#595959',
  mark_slug = 'generic'
where accent_color is null;

-- Now that all rows have values, make accent_color NOT NULL with a default
-- for new rows. mark_slug already defaults to 'generic'.
alter table ventures alter column accent_color set not null;
alter table ventures alter column mark_slug set not null;
alter table ventures alter column accent_color set default '#595959';

-- ==================================================================
-- DOWN MIGRATION (for reference; not auto-applied):
--
--   alter table ventures alter column accent_color drop default;
--   alter table ventures alter column accent_color drop not null;
--   alter table ventures alter column mark_slug drop not null;
--   alter table ventures drop constraint ventures_accent_color_format;
--   alter table ventures drop constraint ventures_mark_slug_known;
--   alter table ventures drop column accent_color;
--   alter table ventures drop column mark_slug;
--
-- No data loss beyond the column drop itself. accent + slug values are
-- recoverable from this migration file.
-- ==================================================================
