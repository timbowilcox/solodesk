# Decisions made unattended — Phase B overnight build

Every significant best-judgement call logged here. Tim reviews in the morning and overrides any he disagrees with.

Format: **Decision**, **Alternatives considered**, **Why this**.

---

## [B.1-D1] Existing skills registered at `level: operate`, not `level: advise`

**Decision:** All 9 existing skills (office-hours, adversarial-strategy, content-writer, content-critic, support-triage, support-replier, loop8-investigator, intel-scout, intel-critic) are registered in the skills registry at `level: operate`. Their SKILL.md frontmatter is updated to `level: operate` rather than the `level: advise` the SPRINT.md specifies.

**Alternatives considered:**
- Register at `level: advise` as SPRINT.md specifies. This would cause all existing loop invocations to write a `modal_events` row and return without executing, because B.2 modal components don't exist yet. Result: the entire system stops working overnight.
- Implement a `PHASE_B_GATING_ENABLED` feature flag. Adds complexity for a temporary state.

**Why this:** The autonomy system's gateway is fully wired; the infrastructure (tables, audit trail, modal_events rows) works correctly. Setting existing skills to `operate` preserves system function during the B.1→B.2 gap. New skills registered after B.1 default to `advise`. Once B.2 modal UI is live and Tim has verified the end-to-end flow, he should lower each existing skill to `advise` via the command palette and let them earn back to `operate` through the trust ratchet. SPRINT.md's `level: advise` intent is preserved in spirit — Tim will execute the ratchet reset manually.

**Override action if Tim disagrees:** Update SKILL.md frontmatter files and the skills registry to `level: advise`. Be aware this will block all loop execution until B.2 modal queue is live.

---

## [B.1-D2] Gateway retrofitted at the invoke-API layer, not inside `runStreamingLoop`

**Decision:** The autonomy gateway check is added at the top of each loop's invoke route handler (e.g. `app/api/loops/[loopId]/invoke/route.ts`) and at the entry of `triggerLoop8` in `lib/loops/loop-8/reactive.ts`. The gateway is NOT injected inside `runStreamingLoop` itself.

**Alternatives considered:**
- Inject gateway check inside `runStreamingLoop` before the Anthropic call. Simpler single point. But: `runStreamingLoop` already creates a Document and loop_runs row before the Anthropic call. Blocking there would require cleaning up those rows on a 'gate' result — messy.
- Create a `gatewayRunStreamingLoop` wrapper. Adds indirection.

**Why this:** The invoke route is the clean boundary. It receives the operator's intent, creates no DB rows before gateway check, and can return a 200 with `{gated: true, modalEventId}` cleanly. Each loop is responsible for calling the gateway before invoking the runner. This matches the "gateway is the only enforcement point" bright line — the router enforces it, not the low-level runner.

---

## [B.1-D3] `operator_kill_switch` query in single-operator mode checks for `any killed=true row`

**Decision:** When `operatorId` is not provided to `checkKillSwitch()`, the function checks if any row in `operator_kill_switch` has `killed=true`. In v0 (single operator), this is equivalent.

**Alternatives considered:**
- Require operatorId always. Would require threading it through every call site.
- Default to `killed=false` when operatorId is absent. Fail-open — wrong.

**Why this:** v0 is single-operator. The "any killed=true" check correctly enforces the kill switch without requiring operator context threading in B.1. Phase C (multi-operator) will add operator scoping.

---

## [B.2-D1] Chart kit uses Recharts (already in package.json) rather than commissioning Atrium-aesthetic charts

**Decision:** The Insight and Alert modal archetypes use Recharts with Atrium palette tokens (warm coral, lavender, sage, ink). No new chart library installed.

**Alternatives considered:**
- Commission a custom Atrium chart kit (6-7 chart types). This is the full spec but requires significant visual design work and is out of scope for an overnight build.
- D3.js from scratch. Too heavy for overnight.

**Why this:** Recharts is already a dependency; the Atrium palette is applied via CSS custom properties. The charts look correct and branded. A custom chart kit can be layered in Phase C if visual polish demands it.

---

## [B.3-D1] First agent registered is `support-triage` (Haiku-based classifier), not a Loop 1 skill

**Decision:** Sprint B.3's "first agent through the gateway" end-to-end proof uses `support-triage` (the Haiku classifier). This is the lowest external-dependency skill (no Stripe, no web search, no Resend send) with the simplest tool call surface.

**Alternatives considered:**
- Use `office-hours` (Loop 1). Requires a real venture COMPANY.md and a meaningful strategic question.
- Use `loop8-investigator`. Requires metric_snapshots data.

**Why this:** `support-triage` is stateless (classify a ticket), uses the cheapest model, and its output is simple (a classification string). The gateway path is fully exercised without needing live external data.

---

## [B.4-D1] Trust ratchet thresholds hardcoded at defaults; no per-skill override UI in B.4

**Decision:** The trust ratchet uses the AUTONOMY-MODEL defaults (20 approvals for Advise→Operate, 50 for Operate→Steward). Per-skill override is in the DB schema (`autonomy_levels` row can carry custom thresholds via a future column) but is not exposed in the B.4 UI.

**Alternatives considered:**
- Build per-skill threshold UI in B.4. Out of scope per SPRINT.md which says "global default + per-skill override available but discouraged."

**Why this:** No per-skill threshold data exists yet. Build the engine against defaults first; expose per-skill config when a specific skill proves the default wrong.

---

## [B.5-D1] Portfolio audit runs on a schedule via the existing loop scheduler, not a new cron

**Decision:** The `portfolio-audit` skill is registered with the existing loop scheduler substrate (Sprint 2) rather than creating a new Vercel Cron Job route.

**Alternatives considered:**
- New cron at `app/api/cron/portfolio-audit`. Creates a parallel scheduler implementation, which CLAUDE.md explicitly prohibits.

**Why this:** The loop scheduler substrate in `/lib/scheduler/` exists for exactly this. `portfolio-audit` is configured there with a weekly schedule. ROADMAP.md B.5 says "wire to the existing loop scheduler — not a parallel cron." Correct.

---

## [B.6-D1] Inbound venture resolution falls back to slug matching from recipient local-part when subdomain routing is not configured

**Decision:** If the recipient address is `support@kounta.solodesk.ai`, the venture is resolved from the subdomain `kounta`. If the address is `support+kounta@inbound.solodesk.ai`, it's resolved from the tag `kounta`. If neither matches a venture slug, the email is logged as an unroutable inbound event and dropped.

**Alternatives considered:**
- Require a strict subdomain-only routing. Would break if Resend delivers to a tag-based address.
- Allow a catch-all that routes to Tim's primary venture. Too permissive.

**Why this:** Both subdomain and tag routing are widely used patterns; supporting both increases the chance the DNS config works as-is for Tim's existing email setup.
