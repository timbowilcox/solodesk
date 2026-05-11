# CLAUDE.md — SoloDesk

**This is the initialiser spec for Claude Code sessions in this repo. Read it fully before doing anything.**

This file is not a README. It encodes the assumptions you operate under when working on SoloDesk. If you find yourself reasoning about something not covered here, stop and ask.

---

## Project context

SoloDesk is Tim Wilcox's operating system for running 6+ ventures (Kounta, Counsel, Corum, CaneMate, RealStyler, Realtelligence). It's a Next.js 16 app on Vercel backed by Supabase, deployed across two domains: `solodesk.ai` (public landing + waitlist) and `app.solodesk.ai` (authed app). Single user (Tim) plus invited members in v0. Architecture is three layers: substrate (this app), agents (skills + loops), human (Tim) — see README.md.

The build is organised in phases. **Phase A (substrate) is complete in code** — Sprints 0 through 11 shipped the foundations: auth, schema, memory layer, design migration, Document/Section/Comment primitive, connections layer, Loop scheduler, the live loops (Strategy / Content / Intel / Support / Metrics), and the experience-layer surfaces (venture identity, the Bridge, the Watch, the Day, streaming Sections, command bar, Loop 8 reactive). Live deploy verification of Loop 8 webhooks and the threshold cron is operator-driven and outstanding.

**Phase B (autonomy + modal foundation) is the current direction.** It adds the autonomy control plane (Advise / Operate / Steward levels, gateway enforcement, guardrails, trust ratchet, kill switch) and the Atrium modal language (eight modal archetypes that become the calm-first interruption layer on top of the substrate). The full architecture is specified in `AUTONOMY-MODEL.md` and `MODAL-ARCHETYPES.md` — those two files are authoritative.

Read SPRINT.md for current scope. Read ROADMAP.md for phase sequence.

This repo extends the agent-harness skill (`~/.claude/skills/user/agent-harness`). The build of SoloDesk itself is governed by that harness — SPRINT.md, HANDOFF.md, evaluator sessions, the lot. Dogfooding the methodology while building the platform that operationalises it.

---

## Stack decisions (do not reinvent)

- **Framework:** Next.js 16 (App Router). TypeScript strict mode. Server Actions where possible, route handlers for webhooks and the waitlist endpoint.
- **Hosting:** Vercel, region `syd1`. Node runtime everywhere (Anthropic SDK requires it). No edge runtime.
- **Database:** Supabase, own project. Postgres direct via `@supabase/supabase-js`. SQL migrations in `/supabase/migrations`, versioned.
- **Auth:** Supabase Auth, magic link. Allowlist enforced via `allowed_users` table with `role in ('admin','member')`. RLS **disabled** in v0 because single-org logically.
- **Email:** Resend SDK. Domain `solodesk.ai` verified at Resend (SPF/DKIM/DMARC).
- **Styling:** Tailwind v4 with the SoloDesk palette (every shadcn primitive restyled). See `/.claude/design-system.md` — the chrome design spec — and `MODAL-ARCHETYPES.md` — the Atrium modal language spec. Söhne (or Inter as fallback) for type, never Geist. Phosphor "regular" weight icons only, never Lucide.
- **Inference:** `@anthropic-ai/sdk` direct. Default model: `claude-opus-4-7`. Use `claude-haiku-4-5-20251001` for cheap classification.
- **Embeddings:** Voyage AI, model `voyage-3` (1024 dims). Locked. Changing dimensions later means a full reembed across every row.
- **Memory layer:** pgvector + the helper functions in `/lib/memory/recall.ts` and `/lib/agents/prompt.ts`. Every loop's prompt construction goes through `buildAgentPrompt` — never assemble prompts manually.
- **Autonomy gateway (Phase B):** every tool call routes through the MCP gateway at `/lib/autonomy/gateway.ts` (planned). Skills never check their own autonomy level — the gateway is the only enforcement point. See `AUTONOMY-MODEL.md` §6.
- **Cron:** Vercel Cron Jobs.
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

Adding a user in v0: SQL `insert into allowed_users (email, role) values (...)`. No UI. Build admin UI when friction warrants it.

---

## Naming and conventions

- File names: `kebab-case.ts`. React components: `PascalCase.tsx`.
- DB tables: `snake_case`, plural (`ventures`, `events`, `loop_runs`, `allowed_users`, `waitlist_signups`, `autonomy_levels`, `guardrails`, `escalations`, `actions`, `modal_events`).
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
level: <advise | operate | steward — default autonomy level for this skill>
hard_advise_only: <true | false — if true, skill can never be promoted regardless of trust ratchet>
guardrails: <inline yaml or path to /.claude/guardrails/<name>.yaml>
---
```

The `level` and `guardrails` fields are read by the autonomy gateway at runtime, never by the skill itself.

### Single responsibility (Barry's rule)

One skill, one job, named in the description. If you find a skill description with "and" in it, split the skill.

### Adversarial counterpart

No skill ships without its critic. The critic is a separate skill, separate session, separate context. The critic's job is to find what's wrong, never to approve by default. **Critics are orthogonal to autonomy** — the critic checks quality inside a run; the autonomy gateway decides whether to surface the result to the operator. Both layers stay.

### Budget tracking (Barry's rule)

Every loop invocation logs to `loop_runs` with `tokens_in`, `tokens_out`, `cost_cents`, `duration_ms`. Runs that exceed budget are marked `blown_budget` and surfaced in the next Brief modal.

### Think-like-the-agent exercise (mandatory before shipping a skill)

Before any new SKILL.md ships:
1. Take a real example task that the skill would handle
2. Dump exactly the context the skill would see (system prompt + tools + first user message + retrieved context)
3. Read it. Ask: is this sufficient and coherent? Could I do this task with only this?
4. If no — fix the skill before shipping. Document what was missing in the skill's changelog.

### Anti-patterns (hard prohibitions)

- No agent writes to production data without an approval gate (decisions, artifacts go to `status='draft'`, never published directly).
- No agent touches payments, credentials, or executes financial transactions.
- No agent sends communications on behalf of any human (drafts only, human approves).
- No cross-venture context. Every invocation scopes to one `venture_id`. **`recallContext()` requires `venture_id` and never returns rows from other ventures.** This is a bright line.
- **Cross-venture credential leakage is a bright line.** `getConnection({ ventureId, provider })` is the only path to read external-provider credentials, and it never returns a row from another venture. Direct reads of `connections.vault_secret_id` or `vault.decrypted_secrets` outside `/lib/connections/` are an anti-pattern.
- **Loops are venture-portable.** A Loop is defined once and takes `ventureId` at runtime via `buildAgentPrompt()`. Venture-specific behaviour lives in venture-scoped Document context (COMPANY.md chunks, memories, prior Decisions, connections inventory) — never in the Loop or skill definition. If you find yourself adding `if (ventureId === 'kounta')` branches to a SKILL.md or Loop file, you're violating this. Cross-venture comparison of Loop outcomes must remain architecturally possible at all times — that's the portfolio differentiator and the prerequisite for Loop 11 (portfolio audit).
- No agent runs without a budget. If you don't know the budget, the skill isn't ready.
- **No agent constructs its own prompt.** Every loop's invocation goes through `buildAgentPrompt()` from `/lib/agents/prompt.ts`. If you find yourself string-concatenating context into a system prompt manually, you're violating this rule. Add what you need to the helper instead.
- **No agent adds events as memories.** Events are SQL aggregation surface, not semantic recall. If a specific event matters enough to recall, promote it to a `memories` row explicitly.
- **All venture-displaying surfaces use the venture identity component system from `/components/venture/`.** No inline marks, no inline state dots, no inline sparklines elsewhere.
- **Internal Loop activity is observation, not communication.** Agent generating, critic reviewing, Document state transitions all surface in the Watch as narrative without explicit operator click. External communication (customer email, vendor message, Slack outbound) still requires explicit click.
- **Command bar queries enforce membership scoping at the `buildAgentPrompt()` layer, not the client layer.**
- **No skill checks its own autonomy level.** The gateway is the only enforcement point. If a skill's code branches on `level === 'steward'`, that's an anti-pattern. See AUTONOMY-MODEL.md §6.

---

## Autonomy conventions

The autonomy model (`AUTONOMY-MODEL.md`) is authoritative. The rules below are the hard prohibitions that protect the trust contract with the operator.

- **Gateway is the only enforcement point.** Every tool call routes through `/lib/autonomy/gateway.ts`. Skill code never reads `autonomy_levels`, `guardrails`, or `escalations` directly. If you find skill code importing the autonomy module, that's an anti-pattern.
- **No skill ships without a default level.** SKILL.md frontmatter must include `level` (advise | operate | steward). New skills default to `advise`.
- **No skill ships without a budget guardrail.** The gateway refuses to invoke any skill missing `budget_tokens` and `budget_cents`.
- **Hard-advise-only is sticky.** A scope flagged `hard_advise_only=true` can never be promoted by the trust ratchet. Operators can flag any scope via the command palette; the flag survives across promotion eligibility checks.
- **Kill switch is global and DB-backed.** One bit on the operator record. While killed, no autonomous execution — every action surfaces as a Decision modal. State survives process restarts; restore is a separate explicit action.
- **Every tool call writes an `actions` row.** Audit trail is the substrate for the trust ratchet. Skill_id, tool, params, autonomy_level, modal_surfaced (bool), result, timestamp — every call, every level.
- **Anomaly downgrades are single-skill, time-bounded, restorable.** The system never barrels through weirdness because the level allows it. See AUTONOMY-MODEL.md §7.
- **Hard exclusions are enforced at registration, not at invocation.** Sensitive personal/family, HR, board-level, legal-sensitive, and first-of-kind work cannot be registered above Advise. See AUTONOMY-MODEL.md §9.

---

## Modal conventions

The modal archetypes (`MODAL-ARCHETYPES.md`) are authoritative. Eight archetypes only. The rules below protect modal scarcity — the core of the calm-first philosophy.

- **Eight archetypes only.** Decision, Brief, Insight, Alert, Completion, Question, Promotion, Escalation. If a system event doesn't fit one, the default is *don't surface it* — log it, store it, make it queryable in the audit trail, but don't pull the operator out of calm for it.
- **Frequency budgets are enforced.** Hard ceilings per archetype are wired to instrumentation. If the system breaches a ceiling for anything other than Escalation, the *system* is wrong, not the operator — fix the surfacing logic.
- **No modal without a visual hero.** Every archetype carries one. Heroes are either rendered artefacts (Decision, Completion), live charts in Atrium aesthetic (Insight, Alert), or commissioned library illustrations (Brief, Question, Promotion). See MODAL-ARCHETYPES.md §3 for per-archetype rules.
- **Modal queue, never simultaneous.** Multiple modals queue. High-priority (Escalation, Alert) jump the queue. Operators tab through queue with `→` / `←`. Queue persists across sessions.
- **Every modal surfacing writes a `modal_events` row.** Telemetry feeds the trust ratchet, the Brief rollups, and surfacing-threshold tuning.
- **Dismissal contracts are honoured per archetype.** Decision and Escalation are non-dismissable. Esc on Escalation opens the kill switch confirmation, not dismissal.
- **No new archetype without spec update.** Adding a ninth archetype requires: (a) clear failure of all eight to handle the event, (b) target frequency budget, (c) visual hero design commissioned, (d) update to MODAL-ARCHETYPES.md, (e) implementation in a planned sprint.

---

## Design conventions

These rules are non-negotiable. They make SoloDesk look like SoloDesk and not like every other Next.js project.

The design system is **split into two coexisting layers**:

- **Chrome** (everything that's not a modal — pages, lists, tables, Documents, the Bridge, the Watch, the Day, command bar) — `/.claude/design-system.md` is authoritative. Square corners, no shadows, the SoloDesk palette, three-letter author tags, Söhne, Phosphor regular.
- **Modals** (the eight Atrium archetypes) — `MODAL-ARCHETYPES.md` §2 is authoritative. Glass cards (12–16px backdrop blur, 70% white overlay), 20px radius, soft warm-tinted shadow, autonomy-coded badge accents (warm coral / lavender / sage). Editorial typeface for headlines.

The two coexist because modals are spatially distinct — centred overlay, dim backdrop. Different visual language is unambiguous, not inconsistent.

### Chrome anti-patterns (hard prohibitions — design-system.md scope)

- **No purple, no pink, no teal, no sienna, no warm cream paper.** The chrome palette is closed. Don't introduce new accent colours.
- **No gradients.** Anywhere. Solid colours only.
- **No drop shadows on chrome.** Borders only, where needed for hierarchy. (Modals are exempt — they're a separate visual layer per Atrium.)
- **No rounded corners on chrome except form inputs (4px).** Square corners on cards, badges, buttons, Documents.
- **No emoji in UI chrome.** Not in button labels, not in empty states, not in error messages, not in status badges. The interface speaks like a precision tool, not a friend.
- **No avatar circles.** Three-letter mono author tags (`tim`, `crt`, `agt`) instead.
- **No motivational empty-state copy.** "No decisions in review." is the entire text. No "Let's get started!" button, no illustration.
- **No icons on chrome buttons.** Text-only. If the label is unclear, fix the label.
- **No Geist font.** Söhne preferred (paid licence), Inter as fallback. System UI fallback only after that.
- **No Lucide icons.** Phosphor "regular" weight only.
- **No shadcn defaults.** Use shadcn for headless logic (Dialog, DropdownMenu, Tooltip, Command). Restyle every visual token. Slate-grey neutrals, rounded-md cards, soft shadows are all forbidden on chrome.
- **No animated typing indicators, pulsing orbs, or "thinking..." reveals.** Loading is a static state — `Loading…` in `ink-mute` italic, no spinner.

### Modal anti-patterns (hard prohibitions — Atrium scope)

- **No modal without a visual hero.** See MODAL-ARCHETYPES.md §2.
- **No modal pulled outside the eight archetypes.** See MODAL-ARCHETYPES.md §5.
- **No modal stack — they queue.** Two modals never display simultaneously.
- **No modal that bypasses telemetry.** Every surfacing writes a `modal_events` row.
- **No autonomy badge using anything other than the three sanctioned colours.** Warm coral (Advise), lavender (Operate), sage (Steward).

### Document anti-patterns (hard prohibitions)

- **No agent writes a flat artifact directly.** Every loop output is a Document with typed Sections. The `decisions` and `artifacts` tables are the queryable record; the Document UI is the editing surface. A Document with `type=decision` writes to `decisions` only when its status flips to `approved`.
- **No critic ships a global review note.** Comments anchor to specific Sections. Every critic comment must include an evidence pointer (memory hit, anti-pattern reference, prior decision id, external URL). "This feels off" with no pointer is auto-rejected by the critic rubric.
- **No agent regenerates more than the Section it's responding to.** If an adjacent Section also needs change, the agent leaves a comment on that Section, doesn't edit it.
- **No Document flips to `approved` while it has unresolved `agent_note` Sections.** Every elicitation must be confirmed, revised, or explicitly deferred — never silently approved through.
- **Document approval is a single operator action.** Section-level state (resolved, agent_note open, etc.) is enforced at approval time — operator cannot approve while any `agent_note` Section is unresolved. Operator can edit any Section pre-approval. Critic comments still anchor to specific Sections with mandatory evidence pointers.
- **No auto-send on external communication.** Customer email, vendor messages, outbound Slack, public posts — explicit operator click required for every external send action. Internal Loop-to-Loop and Loop-to-Document handoffs do not require operator click. Internal Loop activity surfaces in the Watch as observation, not as outbound communication.
- **Streaming Loop output emits typed Section events.** The parser is the single source of truth — Loop output that does not parse into typed Sections is rejected, not coerced.

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

This section grows. When a session fails, document the mode here so subsequent sessions don't repeat it.

- *(populate as failure modes are encountered across Phase B)*

---

## Pointers

- **Current sprint:** SPRINT.md
- **Sprint sequence:** ROADMAP.md
- **Schema:** `/supabase/migrations`
- **Skills:** `/.claude/skills`
- **Loops:** `/.claude/loops`
- **Chrome design system (authoritative for non-modal UI):** `/.claude/design-system.md`
- **Modal language (authoritative for all modal surfaces):** `MODAL-ARCHETYPES.md`
- **Autonomy model (authoritative for gateway, levels, guardrails, ratchet):** `AUTONOMY-MODEL.md`
- **Document/Section/Comment interface spec:** `/.claude/decision-document-interface.md`
- **Memory layer spec:** `/.claude/sprints/sprint-0.5-memory-layer.md`
- **Connections layer spec:** `/.claude/sprints/sprint-1.3-connections-layer.md`
- **Agent harness skill (parent):** `~/.claude/skills/user/agent-harness/SKILL.md`
- **TCOS architecture doc:** `/TCOS.md` (separate, in repo root)

When working on chrome UI, **read `/.claude/design-system.md` before writing any styles**. When working on modal surfaces, **read `MODAL-ARCHETYPES.md` before writing any styles**. When working on agent output rendering, **read `/.claude/decision-document-interface.md` before writing any components**. When working on anything that invokes a tool through an agent, **read `AUTONOMY-MODEL.md` §6 before writing any gateway-adjacent code**. These specs supersede convention and shadcn defaults.
