# Handoff: Sprint 0 verification + Sprint 1.0 design + Sprint 0.5 memory

**Date:** 2026-05-06
**Repo:** solodesk
**Branch:** `main` (head: `fd147f6`, all commits pushed to origin)
**Session type:** Build (multi-sprint — Sprint 0 deploy verification, Sprint 1.0 design migration, Sprint 0.5 memory layer code)
**Author:** Claude (Opus 4.7) under Tim's harness

Earlier session HANDOFFs in `.archive/handoffs/` (Sprint 0 build session 1; the AIOS planning update from earlier today).

---

## Sprint 0 — Deploy verification

**Status:** Live, mostly green. One real bug isolated to your inbox config.

| Verified ✅ | What |
|---|---|
| Vercel deploy | All recent commits READY (no ERROR states since env vars landed) |
| DNS + SSL | `solodesk.ai`, `www.solodesk.ai`, `app.solodesk.ai` all resolving with TLS |
| Hostname routing | All eight runbook §6 grid checks pass — including landing → 302 to `/`, app `/api/waitlist` → 404, app `/dashboard` → 302 to `/login` |
| Webhook auth | Missing-secret + wrong-secret both → 401 |
| Supabase reachable | Proxy `allowed_users` query succeeds on every authed request — implicit confirmation env vars are set, project is reachable, schema exists |
| Waitlist contract | Fresh → 200 `{status:"ok"}`; duplicate → 200 `{status:"ok",duplicate:true}`; malformed → 400 `{error:"Invalid email"}` |
| Resend pipeline | Diagnostic confirmed Resend → Migadu link is healthy. Test message `dc124f40-4e04-4527-abd1-d98627d587cc` reached `delivered` status at +20s — Migadu's MX returned 250 OK to the SMTP transaction |

| Outstanding 📋 | Why you |
|---|---|
| **Email delivery to inbox** | Resend says delivered, Migadu accepted, but messages don't appear in `tim@`/`hello@` inboxes. Almost certainly Migadu spam quarantine (new sender reputation + `p=quarantine` DMARC) or Identity/alias routing. **Action: check Migadu Spam folder for `tim+claude-diag-resend-1778067936895@solodesk.ai` and `tim+claude-smoke-1778066721@solodesk.ai`. If found there, allowlist `hello@solodesk.ai`. If not, check Migadu Identity settings for plus-addressing on the `tim@` mailbox.** Resend dashboard for the message id above shows the literal SMTP banner Migadu returned. |
| Magic-link round-trip | Submit `tim@solodesk.ai` on `/login`, click the link, land on `/dashboard`. Goes through Supabase Auth's separate SMTP path, not Resend. May surface its own SMTP issue. |
| Lighthouse ≥ 90 on landing | Run from your browser. Sprint 1.0 just migrated styles, so re-run after viewing. |
| Visual verification | Sprint 1.0 design migration is live but unreviewed — eyeball every page against `/.claude/design-system.md` |
| Supabase 0001 + seed | If migration `0001_initial_schema.sql` and `seed.sql` aren't applied yet, do that via Studio SQL editor. The proxy works → strongly implies it's already applied, but worth confirming. |

Diagnostic that resolved the email question (commit `47db345`/`86b3885`) was deployed, run, then reverted at `09c9f2e`. Repo is clean.

---

## Sprint 1.0 — Design migration

**Status:** Code complete, deployed (`7f3cfda`). Visual verification still on you.

Pure visual refactor of the Sprint 0 surfaces against `/.claude/design-system.md`. No new features.

What changed:
- **Type & icons.** Geist removed (Vercel/AI trope per spec); Inter + JetBrains Mono now load via `next/font/google` with CSS variables. Lucide removed; `@phosphor-icons/react` installed but unused on Sprint 1.0 surfaces (sidebar is type-only per spec, buttons are text-only). `tw-animate-css` removed (motion is mostly disallowed).
- **Palette.** All shadcn oklch neutrals replaced with the eight SoloDesk tokens in `app/globals.css`'s `@theme` block: `ink/ink-strong/ink-mute/ink-faint`, `paper/paper-card`, `rule/rule-strong`, `accent` (Prussian blue `#1F3A5F`). Four semantic tokens (`positive/caution/negative/info`) with 8% tint backgrounds for badges. Dark mode is warm-dark (ink-and-paper inverted), not iOS-grey. `prefers-reduced-motion` eliminates the 80–120ms transitions.
- **Components restyled.** `AppSidebar` (type-only, 2px Prussian-blue active border, no icons, no card border), `PhaseBadge` (square corners, 11px medium uppercase, semantic 8% tints — purged the violet `scale` colour), `EventsTable` (no surrounding card, 1px rule between every row, no zebra, mono numerics, paper-card hover lift), `WaitlistForm` (bottom-border-only inputs, square ink-strong primary button), Markdown body (16px reading prose, square code blocks, accent-bordered blockquotes).
- **Pages restyled.** All routes (`/`, `/login`, `/dashboard`, `/events`, `/ventures`, `/ventures/new`, `/ventures/[slug]`, `/settings`) migrated off shadcn tokens. Page titles use the load-bearing pattern: 28px bold ink-strong + 1px Prussian-blue rule beneath at 50% opacity. Form inputs are bottom-border-only, focus thickens to 2px Prussian blue. Empty states are facts only ("No events yet."). Login error copy tightened to design-spec voice ("Email invalid.").

Quality:
- `pnpm typecheck` clean
- `pnpm lint` clean
- 41 vitest tests pass (32 from Sprint 0 + 9 new for Sprint 0.5 chunker/recall)
- `pnpm build` clean — all 14 routes generate including Sprint 0.5's

**Untested:** rendered pixels in a browser. No way for me to verify visual correctness server-side. Go to `solodesk.ai` and `app.solodesk.ai/login` and confirm: Inter (not Geist) is loading; the page background is warm off-white `#F7F6F1` (not pure white); the title rule beneath is Prussian blue at 50%; phase badges are square; sidebar has no icons.

---

## Sprint 0.5 — Memory layer code

**Status:** Code complete, deployed (`fd147f6`). External steps still pending — those gate it being *useful*, not its existence.

The migration `supabase/migrations/0002_memory_layer.sql` was already drafted in repo. This commit added the libs, the on-write integration, the cron, the UI, and tests.

What's now in the codebase:
- `lib/memory/voyage.ts` — tiny fetch wrapper. The official `voyageai` SDK has un-extensioned ESM imports that don't resolve under Next 16's Turbopack (`ERR_UNSUPPORTED_DIR_IMPORT`); a ~80 LOC wrapper does the same job without fighting the bundler.
- `lib/memory/embed.ts` — `embedText`, `embedBatch`, `embedRow`, `processBacklog`. Locked to `voyage-3` (1024 dims). Idempotent. Cost-tracked to `loop_runs`. Failure events landed in `events` for backlog visibility.
- `lib/memory/recall.ts` — `recallContext({ ventureId, query, k, types, minSimilarity })`. **`ventureId` is required and the SQL functions enforce filtering at the database** — cross-venture recall is impossible by construction, not just by application convention. Tested.
- `lib/memory/chunk.ts` + `lib/memory/company-md.ts` — chunker (`## ` heading splits, ~500-token windowing with 50-token overlap) and the orchestration helper that runs on venture create.
- `lib/agents/prompt.ts` — `buildAgentPrompt`. Composition order: skill prompt + top-3 venture chunks + top-5 recall hits + task. Sub-budgets enforced (skill 2k / company 3k / recall 4k / task remaining).
- `app/api/cron/embeddings/route.ts` — Vercel cron target for `processBacklog(100)`, gated on `Authorization: Bearer ${CRON_SECRET}`. Configured at `*/5 * * * *` in `vercel.json`. Allowlisted in `proxy.ts` under `/api/cron`.
- `app/(authed)/ventures/[slug]/memories/` — list + form for manual capture. Append-only in v0. Linked from venture detail page.

Migration 0002 was extended with four RPC helpers — `match_decisions / match_artifacts / match_memories / match_venture_chunks`. Each takes `venture_id` as a required arg and filters at the SQL layer. Recall calls these via supabase-js `.rpc()`.

### What you need to do externally for Sprint 0.5 to come alive

1. **Apply migration `0002_memory_layer.sql`** via Supabase SQL editor (or psql). Includes pgvector extension, embedding columns, two new tables, HNSW indexes, embedding-text triggers, and the four match_* RPC functions. Reversible via `drop` of the new tables + `alter table drop column` on the embeddings + `drop extension vector cascade`.
2. **Voyage account** at voyageai.com. Generate an API key.
3. **Vercel env vars** (Production + Preview): `VOYAGE_API_KEY`, `CRON_SECRET` (generate fresh: `openssl rand -hex 32`).
4. **Verify cron**: after deploy, hit `https://app.solodesk.ai/api/cron/embeddings` with `Authorization: Bearer <CRON_SECRET>` — should return `{status:"ok",processed:0,failed:0}` on an empty backlog.
5. **End-to-end test**: visit `/ventures/kounta/memories`, add a note. Within ~5 min the cron picks it up; the embedded indicator on the row flips from `pending` (caution) to `embedded` (positive).

---

## What's NOT done

| Sprint | Status | Why parked |
|---|---|---|
| Sprint 1.1 — Document substrate | Not started | Needs migration 0003 (not yet drafted), and benefits from visual verification of Sprint 1.0 first. Big sprint — 3-4 hours of code. |
| Sprint 1.2 — Decision Document UI | Not started | Depends on 1.1 |
| Sprint 1.3 — Connections layer | Not started; migration `0004_connections.sql` already drafted in repo (planning session) | Spec is at `/.claude/sprints/sprint-1.3-connections-layer.md`. Independent of memory layer; can be next. |
| Sprints 2-6 — Loops | Not started | Need 1.1+ |

Tim's call on which to do next when the deploy + Voyage + Migadu items are sorted. My recommendation: visual verification of Sprint 1.0 first, then Sprint 1.1 (substrate everyone else depends on), then Sprint 1.3 (connections — independent), then 2 onward.

---

## Repository state

- All commits pushed. Working tree clean. Origin/main = local main.
- Recent commits (top of `git log --oneline`):
  ```
  fd147f6  Sprint 0.5 — memory layer code (migration + libs + cron + memories UI)
  7f3cfda  Sprint 1.0 — design migration: SoloDesk palette, Inter, Phosphor
  09c9f2e  Revert TEMP SMTP-probe diagnostic (Sprint 0 deploy verification)
  47db345  TEMP: allow /api/diag through proxy for SMTP-probe diagnostic   ← reverted
  86b3885  TEMP: add SMTP-probe diagnostic route for Sprint 0 deploy …     ← reverted
  0d5cc94  Incorporate AIOS-framework insights into roadmap
  ```
- Routes in production build: 14, including `/api/cron/embeddings` and `/ventures/[slug]/memories`.
- 41 vitest tests passing.

---

## Exact next step

1. Visit the live site and eyeball Sprint 1.0 — confirm Inter renders, palette is warm-paper not white, phase badges are square, sidebar has no icons.
2. Check Migadu Spam folder for the test emails. If found, allowlist `hello@solodesk.ai`. If not, check Migadu's Identity / plus-addressing settings on `tim@solodesk.ai`.
3. Apply migration `0002_memory_layer.sql` to the Sydney Supabase project (if not already).
4. Set `VOYAGE_API_KEY` and `CRON_SECRET` in Vercel project env (both Production + Preview).
5. After redeploy, hit the cron endpoint with the bearer token to confirm 200.
6. Add a test memory at `/ventures/kounta/memories`, wait 5 min, confirm `pending` → `embedded`.
7. Then pick the next sprint (1.1 Documents, 1.3 Connections, or both).
