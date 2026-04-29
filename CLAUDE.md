# CLAUDE.md — SoloDesk

**This is the initialiser spec for Claude Code sessions in this repo. Read it fully before doing anything.**

This file is not a README. It encodes the assumptions you operate under when working on SoloDesk. If you find yourself reasoning about something not covered here, stop and ask.

---

## Project context

SoloDesk is Tim Wilcox's operating system for running 6+ ventures (Kounta, Counsel, Corum, CaneMate, RealStyler, Realtelligence). It's a Next.js 16 app on Vercel backed by Supabase, deployed across two domains: `solodesk.ai` (public landing + waitlist) and `app.solodesk.ai` (authed app). Single user (Tim) plus invited members in v0. Architecture is three layers: substrate (this app), agents (skills + loops), human (Tim) — see README.md.

The v0 build runs through 7 sprints. We are currently in **Sprint 0 (foundation)**. Read SPRINT.md for current scope. Read ROADMAP.md for sequence.

This repo extends the agent-harness skill (`~/.claude/skills/user/agent-harness`). The build of SoloDesk itself is governed by that harness — SPRINT.md, HANDOFF.md, evaluator sessions, the lot. Dogfooding the methodology while building the platform that operationalises it.

---

## Stack decisions (do not reinvent)

- **Framework:** Next.js 16 (App Router). TypeScript strict mode. Server Actions where possible, route handlers for webhooks and the waitlist endpoint.
- **Hosting:** Vercel, region `syd1`. Node runtime everywhere (Anthropic SDK requires it). No edge runtime.
- **Database:** Supabase, own project. Postgres direct via `@supabase/supabase-js`. SQL migrations in `/supabase/migrations`, versioned.
- **Auth:** Supabase Auth, magic link. Allowlist enforced via `allowed_users` table with `role in ('admin','member')`. RLS **disabled** in v0 because single-org logically.
- **Email:** Resend SDK. Domain `solodesk.ai` verified at Resend (SPF/DKIM/DMARC).
- **Styling:** Tailwind v4 with the SoloDesk palette (every shadcn primitive restyled). See `/.claude/design-system.md` — the design spec is authoritative for type, colour, layout, and interaction patterns. Söhne (or Inter as fallback) for type, never Geist. Phosphor "regular" weight icons only, never Lucide.
- **Inference:** `@anthropic-ai/sdk` direct. Default model: `claude-opus-4-7`. Use `claude-haiku-4-5-20251001` for cheap classification.
- **Embeddings:** Voyage AI, model `voyage-3` (1024 dims). Locked. Changing dimensions later means a full reembed across every row.
- **Memory layer:** pgvector + the helper functions in `/lib/memory/recall.ts` and `/lib/agents/prompt.ts`. Every loop's prompt construction goes through `buildAgentPrompt` — never assemble prompts manually. See `/.claude/sprints/sprint-0.5-memory-layer.md` for the full spec; once it's built, this convention is non-negotiable.
- **Cron:** Vercel Cron Jobs (introduced Sprint 2).
- **Validation:** Zod for all external inputs (webhooks, waitlist, forms, agent outputs).
- **Package manager:** pnpm. Single package, no monorepo.

If a request asks to deviate from these decisions, stop and check with Tim. Don't silently swap stacks.

---

## Hostname routing

SoloDesk is a single Next.js app served on two domains. Middleware in `/middleware.ts` inspects the host header and rewrites accordingly:

| Hostname | Behaviour |
|---|---|
| `solodesk.ai` or `www.solodesk.ai` | Allow only `/` (landing page) and `/api/waitlist`. Everything else → 302 redirect to `/`. |
| `app.solodesk.ai` | Full authed app. Unauthenticated users → `/login`. Authenticated but not in `allowed_users` → `/login?error=not_invited`. |
| `localhost` | Treated as `app.solodesk.ai` for development. Use a separate route or query param if landing page needs local testing. |

Route groups in App Router:
- `app/(landing)/` — only routes accessible from `solodesk.ai`
- `app/(authed)/` — only routes accessible from `app.solodesk.ai` (after auth + allowlist)
- `app/api/waitlist/` — accessible from `solodesk.ai` only
- `app/api/webhooks/` — accessible from `app.solodesk.ai` only

If you find yourself adding logic in middleware beyond hostname rewriting + auth checks, you've gone too far.

---

## Auth flow

1. User visits `app.solodesk.ai/login`, enters email
2. Server action: check email is in `allowed_users` AND `active = true`
   - If yes: trigger Supabase magic link, return generic "check your email" message
   - If no: also return generic "check your email" message (don't reveal allowlist state)
3. User clicks magic link → Supabase callback → set session
4. Middleware on every authed request:
   - Verify Supabase session
   - Verify session email is in `allowed_users` with `active = true`
   - Update `allowed_users.last_login` (debounced — once per session)
5. Add admin-only routes via `role = 'admin'` check at server action / route handler level

Adding a user in v0: SQL `insert into allowed_users (email, role) values (...)`. No UI. Build admin UI in Sprint 1+ if friction warrants it.

---

## Naming and conventions

- File names: `kebab-case.ts`. React components: `PascalCase.tsx`.
- DB tables: `snake_case`, plural (`ventures`, `events`, `loop_runs`, `allowed_users`, `waitlist_signups`).
- DB columns: `snake_case`, singular. Timestamps: `created_at`, `updated_at`, `ts`.
- API routes: `/api/<resource>/<action>` or `/api/webhooks/<source>` or `/api/waitlist`.
- Server actions: colocated with the page that uses them, named `<verb><Noun>Action`.
- Skills: `<kebab-case-skill-name>` — same as their directory under `.claude/skills/<n>/SKILL.md`.
- Loops: numbered `01-strategy.md`, `04-content.md`, etc. Numbering aligns with TCOS doc loop IDs.

---

## Database conventions

- Every table gets `id uuid primary key default gen_random_uuid()`.
- Domain tables get `created_at` and `updated_at` (trigger updates `updated_at`).
- FKs to `ventures` cascade on delete in v0.
- JSONB for flexible payloads. If a field is queried > 5 times, promote to a column.
- No raw SQL in app code — go through `supabase-js` or thin query layer in `/lib/db`.
- Schema changes always via migration file, never via Supabase Studio.

---

## Agent conventions

When you build agent code, follow these rules.

### Skill structure

Every skill lives in `.claude/skills/<n>/SKILL.md` with frontmatter:

```markdown
---
name: <skill-name>
description: <one sentence — when this skill should be triggered>
loop: <loop-id, e.g. 01-strategy>
counterpart: <name of adversarial critic skill, or null if this IS the critic>
budget_tokens: <int — max tokens per invocation>
budget_cents: <int — max cost in cents per invocation>
---
```

### Single responsibility (Barry's rule)

One skill, one job, named in the description. If you find a skill description with "and" in it, split the skill.

### Adversarial counterpart

No skill ships without its critic. The critic is a separate skill, separate session, separate context. The critic's job is to find what's wrong, never to approve by default.

### Budget tracking (Barry's rule)

Every loop invocation logs to `loop_runs` with `tokens_in`, `tokens_out`, `cost_cents`, `duration_ms`. Runs that exceed budget are marked `blown_budget` and surfaced in the daily digest.

### Think-like-the-agent exercise (mandatory before shipping a skill)

Before any new SKILL.md ships:
1. Take a real example task that the skill would handle
2. Dump exactly the context the skill would see (system prompt + tools + first user message + retrieved context)
3. Read it. Ask: is this sufficient and coherent? Could I do this task with only this?
4. If no — fix the skill before shipping. Document what was missing in the skill's changelog.

### Anti-patterns (hard prohibitions)

- No agent writes to production data without an approval gate (decisions, artifacts go to `status='draft'`, never published directly)
- No agent touches payments, credentials, or executes financial transactions
- No agent sends communications on behalf of any human (drafts only, human approves)
- No cross-venture context. Every invocation scopes to one `venture_id`. **`recallContext()` requires `venture_id` and never returns rows from other ventures.** This is a bright line.
- No agent runs without a budget. If you don't know the budget, the skill isn't ready.
- **No agent constructs its own prompt.** Every loop's invocation goes through `buildAgentPrompt()` from `/lib/agents/prompt.ts`. If you find yourself string-concatenating context into a system prompt manually, you're violating this rule. Add what you need to the helper instead.
- **No agent adds events as memories.** Events are SQL aggregation surface, not semantic recall. If a specific event matters enough to recall, promote it to a `memories` row explicitly.

---

## Document and design conventions

These rules are non-negotiable from Sprint 1 onwards. They make SoloDesk look like SoloDesk and not like every other Next.js project. See `/.claude/design-system.md` and `/.claude/decision-document-interface.md` for the full spec.

### Design anti-patterns (hard prohibitions)

- **No purple, no pink, no teal, no sienna, no warm cream paper.** The palette in `/.claude/design-system.md` is closed. Don't introduce new accent colours.
- **No gradients.** Anywhere. Solid colours only.
- **No drop shadows.** Borders only, where needed for hierarchy.
- **No rounded corners except form inputs (4px) and modals (6px).** Square corners on cards, badges, buttons, documents.
- **No emoji in UI chrome.** Not in button labels, not in empty states, not in error messages, not in status badges. The interface speaks like a precision tool, not a friend.
- **No avatar circles.** Three-letter mono author tags (`tim`, `crt`, `agt`) instead.
- **No motivational empty-state copy.** "No decisions in review." is the entire text. No "Let's get started!" button, no illustration.
- **No icons on buttons.** Text-only. If the label is unclear, fix the label.
- **No Geist font.** Söhne preferred (paid licence), Inter as fallback. System UI fallback only after that.
- **No Lucide icons.** Phosphor "regular" weight only.
- **No shadcn defaults.** Use shadcn for headless logic (Dialog, DropdownMenu, Tooltip, Command). Restyle every visual token. Slate-grey neutrals, rounded-md cards, soft shadows are all forbidden.
- **No animated typing indicators, pulsing orbs, or "thinking..." reveals.** Loading is a static state — `Loading…` in `ink-mute` italic, no spinner.

### Document anti-patterns (hard prohibitions)

- **No agent writes a flat artifact directly.** Every loop output is a Document with typed Sections. The `decisions` and `artifacts` tables are the queryable record; the Document UI is the editing surface. A Document with `type=decision` writes to `decisions` only when its status flips to `approved`.
- **No critic ships a global review note.** Comments anchor to specific Sections. Every critic comment must include an evidence pointer (memory hit, anti-pattern reference, prior decision id, external URL). "This feels off" with no pointer is auto-rejected by the critic rubric.
- **No agent regenerates more than the Section it's responding to.** If an adjacent Section also needs change, the agent leaves a comment on that Section, doesn't edit it.
- **No Document flips to `approved` while it has unresolved `agent_note` Sections.** Every elicitation must be confirmed, revised, or explicitly deferred — never silently approved through.
- **No bulk-approve action without per-Section status updates.** "Approve all" can be one user click but the data model records each Section's approval individually for audit.
- **No auto-send on any communication.** Send actions require an explicit user click. Approving a draft does not send it.

---

## Definition of Done (universal)

- [ ] All acceptance criteria in current SPRINT.md ticked, with proof
- [ ] Tests written and passing (Vitest unit, Playwright e2e where relevant)
- [ ] No TypeScript errors (`pnpm tsc --noEmit` clean)
- [ ] No ESLint errors
- [ ] Migration applied and reversible
- [ ] HANDOFF.md updated and committed
- [ ] Commit pushed
- [ ] Deployed to Vercel and reachable on the live domain (not just preview URL)

---

## Failure modes already known

This section grows. When a session fails, document the mode here.

- *(none yet — Sprint 0 is the first build)*

---

## Pointers

- **Current sprint:** SPRINT.md
- **Sprint sequence:** ROADMAP.md
- **Schema:** `/supabase/migrations`
- **Skills:** `/.claude/skills`
- **Loops:** `/.claude/loops`
- **Design system (authoritative for all UI):** `/.claude/design-system.md`
- **Document/Section/Comment interface spec:** `/.claude/decision-document-interface.md`
- **Memory layer spec:** `/.claude/sprints/sprint-0.5-memory-layer.md`
- **Agent harness skill (parent):** `~/.claude/skills/user/agent-harness/SKILL.md`
- **TCOS architecture doc:** `/TCOS.md` (separate, in repo root)

When working on UI, **read `/.claude/design-system.md` before writing any styles**. When working on agent output rendering, **read `/.claude/decision-document-interface.md` before writing any components**. These specs supersede convention and shadcn defaults.
