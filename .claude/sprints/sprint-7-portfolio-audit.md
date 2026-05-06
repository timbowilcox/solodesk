# Sprint 7 — Portfolio Audit (Loop 11) — STUB

**Status:** stub — full SPRINT.md content authored after Sprint 6 ships and before the Nov 1 productise gate
**Position:** post-Sprint-6, Nov 1 gate item
**Loops added:** Loop 11 — portfolio audit

This file is a placeholder. Full scope is written when Sprint 6 is approved by the evaluator. Until then, see ROADMAP.md "After Sprint 6" for the live summary.

---

## Why this exists

Loop 11 is the cross-venture meta-loop and the differentiator vs running Claude Code per venture. Where Loops 1-10 each run inside one venture's scope (with the recall and connection bright lines enforcing isolation), Loop 11 deliberately operates at the portfolio level — its job is to compare across ventures and surface drift.

Without this Loop, SoloDesk is a high-quality per-venture operator tool. With it, SoloDesk becomes the first thing in the stack that knows the portfolio is a portfolio. That's the Nov 1 productise-gate criterion.

## Hard dependencies

- **Sprint 0.5** — recall layer (Loop 11 reads memory across ventures, but each query is still venture-scoped; Loop 11 itself runs N times, once per venture, then aggregates the results into a portfolio-level Document)
- **Sprint 1.x** — Document substrate; Loop 11's output is a portfolio-scope Document with one Section per finding
- **Sprint 1.3** — connections layer; Loop 11 inspects connection inventory per venture
- **Sprint 2 scheduler** — Loop 11 runs on a cadence (weekly?), via the substrate scheduler, not a parallel cron

## Loop 11 outputs (high-level)

A Document of typed Sections, one per finding. Findings include:

- **Stale priorities** — Documents not updated in N days where the priority field claims active status.
- **Unused capabilities** — a Loop is enabled on a venture (`ventures.loops_enabled`) but `loop_runs` shows zero invocations in M days.
- **Missing connections** — a Loop is enabled on a venture but the connections it needs (per its provider manifest) aren't present or are revoked. E.g. Loop 8 enabled but no Stripe connection.
- **Divergence** — same Loop, different ventures, scoring distribution drifted apart in ways that suggest one venture's rubric tuning has gone stale (or the other has).
- **Coverage gaps** — venture has phase=`build` but no Loop 1 (strategy) Documents in the last quarter, etc.

Each finding renders as a Section with kind=`finding` (a new Section kind introduced for this Loop) plus an evidence pointer (memory hits, prior Decisions, raw counts).

## Bright-line preservation

Loop 11 is the deliberate exception to "no cross-venture context" — but it remains constrained:

- Loop 11 NEVER mixes one venture's COMPANY.md or memories into another venture's context window. Each venture-level inspection is a separate `recallContext` call scoped to its venture. Aggregation happens at the data layer (counts, distributions, presence/absence), not the prompt layer.
- Loop 11 NEVER reads credentials across ventures. It inspects `connections` rows (presence, provider, revoked status) without touching `vault_secret_id`. The accessor `getConnectionInventory({ ventureId })` exists for this — returns metadata only, never decrypts.
- Loop 11's Document is portfolio-scope. There is no `venture_id` on it — it lives in a portfolio-level scope (`documents.scope='portfolio'`, a Sprint 7 schema addition).

If Loop 11's implementation requires breaking either of the first two rules, the design is wrong — fix the design.

## Productisation criterion

Loop 11 is a Nov 1 gate item. If it doesn't ship by then, the productise call defaults to "not yet" — because without Loop 11, SoloDesk's claim to be "the OS for portfolio operators" doesn't hold operationally. Per-venture tooling is well-served by Claude Code with per-venture configuration; the portfolio-level intelligence is what justifies the platform claim.
