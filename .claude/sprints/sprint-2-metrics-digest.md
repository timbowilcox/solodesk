# Sprint 2 — Metrics Digest + Anomaly Detection (Loop 8) — STUB

**Status:** stub — full SPRINT.md content authored when Sprint 1.3 ships
**Position:** after Sprint 1.3 (connections layer); first feature sprint that consumes external venture credentials
**Loops added:** Loop 8 (daily metrics digest + anomaly explainer)

This file is a placeholder. Full scope, acceptance criteria, rubric, and adversarial prompt are written when Sprint 1.3 is approved by the evaluator. Until then, see ROADMAP.md for the live one-paragraph summary.

---

## Hard dependencies (must land first)

- **Sprint 0.5** — `buildAgentPrompt`, `recallContext`. Anomaly explainer agent calls both.
- **Sprint 1.1** — Document/Section/Comment substrate. Daily Digest is a Document.
- **Sprint 1.3** — Connections layer. Loop 8 reads Stripe (MRR), Resend (email volume), Vercel (deploys), GitHub (PR velocity) per venture through `getConnection`. No direct env-var credentials in Loop code.

If Sprint 2 starts before any of these, it ships a retrofittable shim — particularly for credentials. Don't skip.

## Substrate deliverable (the bit that's reusable)

Sprint 2 introduces the **general-purpose Loop scheduler** — cron-style, venture-scoped, observable, reusable by any subsequent Loop. Loop 8 (this sprint) is the first consumer. Loops 4, 5, 6 and any post-v0 Loop with periodic execution all reuse it.

The scheduler is a substrate, not a Loop 8 implementation detail. Specific shape TBD when this sprint's full SPRINT.md is authored, but the constraints are:

- A Loop is registered with a cron expression and a venture scope (single venture, all ventures, or a subset).
- Each fire generates a `loop_runs` row before invocation; `trigger='schedule'`.
- Failures don't crash the scheduler — one bad Loop run is logged and the next firing proceeds.
- Schedule definitions live in code (typed), not in the database, so they're version-controlled. Per-venture enablement lives in `ventures.loops_enabled` jsonb.
- Operator-visible: the venture settings UI surfaces enabled scheduled Loops, last-run status, next-run time.

Loop 11 (portfolio audit, post-Sprint-6) is the canonical proof that this is a substrate, not a Loop-8-specific cron. If Loop 11 needs a parallel scheduling implementation, the substrate failed.

## Loop 8 deliverables (high-level)

- Webhook handlers for Stripe, Resend, Vercel, GitHub — each calls `getConnection` for venture-scoped signing keys / API tokens.
- SQL views: `mrr_by_venture`, `email_volume_7d`, `deploy_frequency`, `pr_velocity`.
- Daily 6am cron (via the scheduler above) computes deltas, flags moves >2σ from 30-day mean.
- `metric_snapshots` table populated daily.
- `anomaly-explainer` skill runs per flagged anomaly. Adversarial counterpart `anomaly-critic` rejects unsupported explanations.
- **Daily Digest is a Document** (`type=daily_digest`) per `/.claude/decision-document-interface.md`, with Sections: `prose` (headline), `metric_block` (KPIs), `prose` (anomalies list with proposed cause), `agent_note` (unexplained anomalies — yellow flag), `prose` ("Your three decisions today" with Document links).
- Email sent via Resend at 6am links to the Document at `/dashboards/daily/[date]`.
