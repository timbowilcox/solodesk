# Handoff: Planning update — incorporate AIOS-framework insights

**Date:** 2026-05-06
**Repo:** solodesk
**Branch:** `main`
**Session type:** Planning (spec/docs only — no implementation, no migration applied)
**Author:** Claude (Opus 4.7) under Tim's harness
**Source:** AIOS-framework insights (Nate's portfolio operator stack — service-account pattern, scheduling discipline, portfolio-level audit, team inbound)

---

## Sprint 0 deploy verification status

Unchanged. Sprint 0 build session 1 HANDOFF moved to `.archive/handoffs/sprint-00-build-session-1.md` for the deploy verification session to reference. Deploy runbook remains at `.claude/runbooks/sprint-00-deploy-runbook.md`. Nothing in this planning session touches Sprint 0 scope.

---

## What this session changed

Five planning updates across the meta-docs. No app code, no migration applied, no implementation.

### Change 1 — Loop portability bright line (CLAUDE.md)

Added a new bright line to `CLAUDE.md` under Agent conventions / Anti-patterns (hard prohibitions):

> **Loops are venture-portable.** A Loop is defined once and takes `ventureId` at runtime via `buildAgentPrompt()`. Venture-specific behaviour lives in venture-scoped Document context (COMPANY.md chunks, memories, prior Decisions, connections inventory) — never in the Loop or skill definition. Cross-venture comparison of Loop outcomes must remain architecturally possible at all times — that's the portfolio differentiator and the prerequisite for Loop 11 (portfolio audit).

Rationale: existing rules ("no cross-venture context", "no agent constructs its own prompt") govern data flow but not Loop *definition* shape. Without the portability rule, nothing prevents `if (ventureId === 'kounta') { ... }` branches accumulating in skills until Loop 11 (portfolio audit) becomes architecturally impossible. Verified the rule doesn't contradict Sprint 0.5 (`buildAgentPrompt` already takes `ventureId` at runtime) or the document substrate spec (Section kinds are venture-agnostic).

Verified the bright lines don't also live in `/.claude/decision-document-interface.md`. DDI carries section-scoped UX anti-patterns (Comments, Tables, Comment threads) and a "New constraints to add to CLAUDE.md" block; cross-cutting agent rules live in CLAUDE.md only. No DDI edit needed.

Also added a parallel new bright line for cross-venture credential leakage (sister rule to the recall scope rule), pointing forward to the Sprint 1.3 substrate.

### Change 2 — Connections layer (new Sprint 1.3)

- New spec: `/.claude/sprints/sprint-1.3-connections-layer.md` — full sprint spec with rationale, scope, OOS, acceptance criteria, DOD, rubric, adversarial review prompt, build-session notes.
- New migration: `supabase/migrations/0004_connections.sql` — **draft only, not applied**. Defines `connections` (id, venture_id, provider, display_name, vault_secret_id, scope_metadata, created_by, created_at, revoked_at) with an exclusion constraint guaranteeing one active connection per (venture, provider, display_name); plus `connection_audit` (connection_id, action, called_by_loop_id, called_at, request_summary, response_status). Encryption via Supabase Vault. RLS policy stubs commented out — v0 stays single-org.
- ROADMAP.md updated: new Sprint 1.3 entry inserted between Sprint 1.2 and Sprint 2; top-of-file structure paragraph updated.
- Single accessor pattern: every Loop fetches credentials through `getConnection({ ventureId, provider, loopRunId, requestSummary })`, which writes a `connection_audit` row before returning the credential. Audit-before-return ordering is enforced — audit insert failure fails the call.
- Service-account discipline documented: encrypted payloads are always for service accounts at the provider, never the operator's personal credentials. Same logic as Nate's UpAI/ClickUp pattern.

Position rationale: Sprint 2 (Loop 8) is the first Loop that needs external venture credentials (Stripe/Resend/Vercel/GitHub). Without the substrate, Sprint 2 ships a retrofittable shim that every subsequent Loop has to copy. Slotting 1.3 between 1.2 (decision document) and 2 (metrics digest) makes the bright line architecturally enforceable from day one of external integrations.

### Change 3 — Generalise scheduling in Sprint 2

- ROADMAP.md Sprint 2 retitled "Metrics digest + Loop scheduler substrate (Loop 8)". Explicit deliverable added: "general-purpose Loop scheduler — cron-style, venture-scoped, observable, reusable by any subsequent Loop." Loop 8 is named the first consumer; Loops 5 (weekly intel), 10 (Sunday retrospective digest), 11 (portfolio audit) listed as downstream consumers.
- Sprint 5's existing "weekly Friday cron" wording was already neutral about whether it introduces or reuses a scheduler — left unchanged. Sprint 5 doesn't currently claim to introduce a scheduling primitive in the live ROADMAP; the brief's "Sprint 5's 'adds Table primitive + scheduling' becomes 'adds Table primitive'" referred to a draft state that's no longer present (Tables are introduced via the Document substrate in Sprint 1, not Sprint 5).
- New stub: `/.claude/sprints/sprint-2-metrics-digest.md` — skeleton with hard dependencies (Sprints 0.5, 1.1, 1.3) and the substrate framing for the scheduler. Full SPRINT.md content authored when Sprint 1.3 is approved by the evaluator.

### Change 4 — Loop 11 (portfolio audit) as Nov 1 gate item

- ROADMAP.md "After Sprint 6" rewritten — Loop 11 added with full description (stale priorities, unused capabilities, missing connections, divergence findings; portfolio-scope Document output).
- README.md productisation criteria gained: "Has Loop 11 (portfolio audit) shipped and run?" — described as gating the productise call. Without Loop 11, the "OS for portfolio operators" claim doesn't hold operationally; productise call defaults to "not yet."
- New stub: `/.claude/sprints/sprint-7-portfolio-audit.md` — placeholder with hard dependencies, finding catalogue, and explicit bright-line preservation (Loop 11 is the deliberate exception to "no cross-venture context" but remains constrained: never mixes venture context windows; never decrypts credentials across ventures; aggregation happens at the data layer, not the prompt layer).

### Change 5 — Team inbound surface as Nov 1 gate item

- ROADMAP.md "After Sprint 6" entry includes team inbound — per-venture inbox via subdomain/recipient routing, role-gated visibility (`venture_members` table), reuses Resend pipeline and Corum-derived ingest patterns.
- README.md productisation criteria gained: "Has the team-inbound surface shipped, with at least one teammate working a venture's inbox?" — also gates the productise call.
- New stub: `/.claude/sprints/sprint-7-team-inbound.md` — placeholder with hard dependencies, deliverables, bright-line preservation (cross-venture leakage forbidden at server-action level, no relaxed recall scope, no unaudited send path).

---

## Files changed

```
modified:
  CLAUDE.md                                        new bright lines + pointer to 1.3 spec
  README.md                                        productisation criteria — Loop 11 + team inbound
  ROADMAP.md                                       Sprint 1.3 inserted; Sprint 2 scheduler substrate;
                                                    After-Sprint-6 expanded with Loop 11 + team inbound
new:
  .claude/sprints/sprint-1.3-connections-layer.md  full sprint spec
  .claude/sprints/sprint-2-metrics-digest.md       stub flagging scheduler dependency
  .claude/sprints/sprint-7-portfolio-audit.md      Loop 11 stub
  .claude/sprints/sprint-7-team-inbound.md         team inbound stub
  supabase/migrations/0004_connections.sql         DRAFT — not applied
renamed:
  HANDOFF.md → .archive/handoffs/sprint-00-build-session-1.md
                                                    preserved for Sprint 0 deploy verification session;
                                                    this file replaces it for the planning session
```

---

## Adversarial check (run before commit, recorded for transparency)

The brief asked: does any change soften an existing bright line? Does the connections spec leave a path for cross-venture credential access? Does the Loop portability rule contradict anything in sprint-0.5 or the document substrate spec?

**Verdict: clean.**

- **Soft bright lines:** none. The Loop portability rule reinforces the existing "no cross-venture context" rule by extending it to the Loop definition layer. The cross-venture credential rule is parallel to the existing recall-scope rule, not a relaxation of it. The connections spec channels what would otherwise be ad-hoc env-var reads through one accessor — strictly tighter than the alternative.
- **Cross-venture credential paths:** none identified. `getConnection` requires `ventureId`; grep test enforces `vault.decrypted_secrets` references only inside `/lib/connections/`; Loop 11's `getConnectionInventory` returns metadata only, never decrypts; RLS prep exists for v1 multi-tenant flip.
- **Contradictions with sprint-0.5 or document substrate:** none. `buildAgentPrompt` already takes `ventureId` at runtime (matches portability rule). Document Section kinds are venture-agnostic by design (matches portability rule). Document substrate's anti-patterns (no agent regenerates more than the commented Section, etc.) are orthogonal to Loop portability.

One edge case noted in the Sprint 1.3 spec: when `getConnection` finds no active connection, there's no `connection_id` to anchor the audit row to. Resolution recorded in build-session notes — denied attempts go to `events` (with `type='connection_denied'`) rather than `connection_audit`, since `events` is the existing append-log surface. This needs to be reflected in the migration's comment block and the `getConnection` implementation when Sprint 1.3 builds.

---

## Decisions deferred

- **Sprint 2 scheduler shape (cron expression vs typed schedule object).** The Sprint 2 stub flags the substrate but defers the API shape to the build session, when Loop 8's actual cadence requirements are concrete.
- **`venture_members` table shape.** Team-inbound stub flags the dependency but defers the schema until Sprint 7 build; v0 keeps the implicit single-operator model.
- **OAuth flows for providers.** Sprint 1.3 spec is paste-API-key only. OAuth lands when the first Loop needs a provider that doesn't support API keys.
- **Vault secret retention policy for orphaned secrets after rotation.** Deferred — at v0 scale, Vault retention is Supabase's responsibility; cleanup cron only built if it becomes an actual concern.
- **Whether to renumber migration 0004 if Sprint 1.1's `0003_documents.sql` lands at a different number.** Decision: don't renumber. The brief explicitly forbade renumbering existing migrations; if Sprint 1.1 is forced to use 0005 because 0003 is reserved for something else, that's fine. Migrations are timestamped logically by sprint, not by strict integer ordering.

---

## Out of scope (per brief)

Confirmed not touched this session:
- No Loop implementation code
- Connections migration NOT applied to Supabase (`mcp__5423045f-..__apply_migration` not called; no `supabase db push`)
- Sprint 0 SMTP fix or deploy verification — orthogonal, still pending in session 2
- No renumbering of existing migrations 0001/0002/0003
- `/.claude/design-system.md` not touched

---

## Exact next step

Tim has two parallel tracks:

1. **Sprint 0 deploy verification (still in progress).** Pick up at `.claude/runbooks/sprint-00-deploy-runbook.md`. Reference `.archive/handoffs/sprint-00-build-session-1.md` for what was built in session 1. When verification passes the evaluator (≥7), Sprint 0 closes and Sprint 0.5 begins.

2. **Review this planning session's changes.** Adversarial-review the five edits before committing — particularly Sprint 1.3's spec internals (audit-before-return ordering, the `denied` event-table fallback, RLS-readiness commenting). When approved, the commit message reads:

   ```
   Incorporate AIOS-framework insights into roadmap

   - Loop portability bright line (CLAUDE.md)
   - Sprint 1.3 connections layer spec + draft migration 0004
   - Sprint 2 gains general-purpose Loop scheduler substrate
   - Loop 11 (portfolio audit) added as Nov 1 gate item
   - Team inbound surface added as Nov 1 gate item
   ```

   Single consolidated commit chosen over per-change commits — the five changes form a coherent thesis (operationalising portfolio-platform claims), and splitting would obscure the Loop 11 / team-inbound dependency on the Sprint 1.3 substrate and Sprint 2 scheduler.
