# Sprint 7 — Team Inbound (per-venture inbox) — STUB

**Status:** stub — full SPRINT.md content authored after Sprint 6 ships and before the Nov 1 productise gate
**Position:** post-Sprint-6, Nov 1 gate item; can run in parallel with Sprint 7 portfolio audit if capacity allows
**Loops added:** none directly; substrate that lets Loops 4 (content), 6 (support), and any future Loop receive inbound mail per venture

This file is a placeholder. Full scope is written when Sprint 6 is approved by the evaluator. Until then, see ROADMAP.md "After Sprint 6" for the live summary.

---

## Why this exists

v0 SoloDesk has one human (Tim). Loop 6 (Sprint 6) ingests support mail per venture, but everything routes back to Tim's eyes. The "OS for portfolio operators" claim only holds if SoloDesk extends to teammates — the venture-specific operators who handle a single venture's day-to-day while Tim runs the portfolio.

Team inbound is the smallest substrate that makes this real:

- Inbound mail forwarder routes per-venture messages to the right venture context.
- Role-gated visibility: a teammate assigned to Kounta sees only Kounta's inbound; Tim (operator) sees all.
- Replies and triage outputs flow back through the existing Sprint 6 substrate — no parallel send pipeline.

This isn't multi-tenant productisation (that's a much bigger lift). It's the simplest test that the venture/role data model works for more than one human.

## Hard dependencies

- **Sprint 6** — support triage substrate. Team inbound layers on top, doesn't replace.
- **Sprint 1.3** — connections layer. Per-venture mail provider credentials (sending account, forwarding routes) live in the connections table.
- **`allowed_users.role`** — already in place from Sprint 0. Needs an additional table mapping users to ventures (`venture_members(venture_id, user_id, role)`) before the role-gated visibility lands.

## Substrate deliverables (high-level)

- **Inbound forwarder** — DNS + Resend (or alternative inbound provider) configured to receive `<anything>@<venture-slug>.solodesk.app` (or per-venture verified domain alongside). Each inbound message lands in `events` with `source='inbound_mail'`, payload includes from/to/subject/body/attachments.
- **Routing rule** — `to` address (subdomain, plus-tag, or recipient field) maps to `venture_id`. Misroutes go to a portfolio-level "unrouted" inbox visible only to the operator.
- **`venture_members` table** — `(venture_id, user_id, role)` with role in `('operator','viewer','editor')`. Operator (Tim) is implicit on all ventures; teammates are explicit.
- **Role-gated views** — every per-venture page checks `venture_members` plus `allowed_users.role='admin'` (admin = portfolio operator with all ventures visible).
- **Outbound** — replies go via the existing Resend integration with the venture's send-from connection (`connections` row, provider=`resend`). Same explicit-click send rule as Loop 6.
- **Reuse Corum-derived ingest patterns** — Tim has prior art in Corum (his stakeholder ingest project) on routing high-volume inbound mail. Patterns lift across.

## Bright-line preservation

- **Cross-venture leakage forbidden.** A teammate assigned to Kounta cannot see Counsel's inbox. Server-action level role check, not just UI.
- **No agent reads inbound across ventures.** Loop 6 already enforces venture scope; team inbound doesn't change that. The portfolio operator (Tim) sees aggregated views by querying each venture's data and merging in the application layer — never by relaxing recall scope.
- **No unaudited send.** Outbound mail goes through the connection layer's audit (Sprint 1.3), and through Loop 6's per-Section approval gate (Sprint 6). Team inbound doesn't introduce a new send path.

## Productisation criterion

Like Loop 11, team inbound is a Nov 1 gate item. The "OS for portfolio operators" claim implies more than just the operator at the centre — it implies the platform can host the operators who run individual ventures alongside the one running the portfolio. If team inbound doesn't ship and prove out with at least one teammate working a venture's inbox, the productise call defaults to "not yet" — because the multi-human capability isn't demonstrated.
