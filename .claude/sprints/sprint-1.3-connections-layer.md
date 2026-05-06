# Sprint 1.3 — Connections Layer

**Status:** pre-written, ready to begin after Sprint 1.2 (decision document) ships and is evaluator-approved
**Position:** between Sprint 1.2 and Sprint 2 — substrate must land before the first Loop that needs external venture credentials
**Loops added:** none directly; foundation that every Loop with external dependencies (Sprint 2 onward) consumes
**Estimated sessions:** 1

When Sprint 1.2 is approved by the evaluator, copy this file's contents into `SPRINT.md` (replacing the prior contents) and begin.

---

## Why this exists

Sprint 2 (metrics digest, Loop 8) is the first Loop that reads from external venture-owned systems — Stripe (MRR, payments), Resend (email volume), Vercel (deploy frequency), GitHub (PR velocity). Every Loop after that compounds the dependency: Loop 4 (content) writes to Resend, Loop 5 (intel) fetches the open web plus configured competitor surfaces, Loop 6 (support) reads inbound mail, post-v0 Loops touch NetSuite, Mixpanel, Plausible, Twilio.

Without a credentials substrate, Sprint 2 ships a one-off shim: env vars per venture, hand-rolled secret handling, no audit trail, no revocation. Every subsequent Loop copies that shim and tax accumulates. Worse, the shim makes the cross-venture credential boundary an honour system — and credentials are the highest-blast-radius leak surface SoloDesk has.

This sprint puts the substrate down so the bright line is architecturally enforceable. Every Loop's external API call routes through a single accessor — `getConnection({ ventureId, provider })` — that decrypts the credential, writes an audit row, and returns the result. There is no other path. Direct credential reads from Loop code are a pattern the evaluator agent rejects.

This is the venture-equivalent of the AIOS-framework move where the operator gives ClickUp a dedicated agent service account rather than handing over personal credentials. The same principle applies per-provider per-venture: the encrypted payload is for a service account at the provider, not the operator's personal session.

## Position rationale

Sprint 1.2 ships the Decision document type. Sprint 2 needs Stripe + Resend + Vercel + GitHub credentials per venture. Slotting the connections layer between them means:

- Loop 8 (Sprint 2) is the first consumer, not the proof-of-concept that gets retrofitted later.
- Sprint 1's Document substrate is unaffected.
- Sprint 0.5's memory substrate is unaffected.
- The migration is incrementally additive — Sprint 0/0.5/1 keep working without it.

If Sprint 1.3 slips past Sprint 2, Sprint 2 either ships without external Loops (kicking the can) or accumulates retrofittable debt. Neither is acceptable. This ordering closes that path.

---

## Scope

1. Apply migration `0004_connections.sql` (already drafted at repo head — review before applying)
2. Confirm Supabase Vault is enabled on the project (Studio → Vault). Enable if not.
3. Build the connection writer: server actions to create, rotate, and revoke connections, encrypting the payload through `vault.secrets`
4. Build `getConnection()` — the single accessor every Loop uses to fetch credentials, with mandatory audit-row write
5. Build the venture settings UI surface: list connections per venture, expose create/rotate/revoke actions, surface audit history
6. Provider adapters for the Sprint 2 minimum: Stripe, Resend, Vercel, GitHub. Each adapter is a thin wrapper that knows the credential shape and exercises `getConnection` correctly.
7. End-to-end test: create a Stripe sandbox connection on Kounta, fetch it through `getConnection` from a fake Loop run, confirm `connection_audit` row landed, confirm cross-venture call against Counsel returns nothing.

## Out of scope

- Any Loop actually using `getConnection` (Sprint 2+ does that). This sprint validates the substrate with a fake Loop run.
- Multi-operator team membership / RLS enablement — single-org v0 still applies. RLS policies are prepared in the migration as commented stubs.
- OAuth flows for providers that require user-driven authorisation (NetSuite, Webflow). v0 supports paste-the-API-key creation only; OAuth lands when the first Loop needs it.
- Automated rotation. Rotation is a manual operator action through the UI in v0.
- Per-provider rate limit tracking. The audit table is enough to derive rate-limit metrics if needed; building a separate counter is premature.
- Cross-venture aggregate views (e.g. "all Stripe connections across portfolio"). The portfolio audit Loop (Loop 11, post-Sprint-6) does this — Sprint 1.3 just stores per-venture rows.

## Acceptance criteria

### Migration

- [ ] `0004_connections.sql` applied successfully against Supabase
- [ ] `connections` and `connection_audit` tables present, confirmed via `\d`
- [ ] All indexes present, confirmed via `\di`
- [ ] Exclusion constraint on `(venture_id, provider, display_name) where revoked_at is null` confirmed by attempting a duplicate insert and seeing it rejected
- [ ] Supabase Vault confirmed enabled — `select * from pg_extension where extname = 'supabase_vault'` returns the row, OR Studio → Vault shows enabled
- [ ] RLS confirmed NOT enabled on either table (intentional for v0); policy stubs remain commented in the migration file

### Vault integration

- [ ] Helper `vaultPut(payload: Record<string, unknown>): Promise<{ secretId: string }>` inserts into `vault.secrets`, returns the new secret id
- [ ] Helper `vaultGet(secretId: string): Promise<Record<string, unknown>>` reads `vault.decrypted_secrets`, returns the JSON-parsed payload
- [ ] Both helpers run as service role only — `lib/connections/vault.ts` imports `server-only`
- [ ] Vault payload is JSON-stringified on put, parsed on get; non-JSON payloads rejected at the helper level
- [ ] Failure modes covered: missing secret id, payload too large, decrypt failure — each surfaces a typed error

### Connection writer (`/lib/connections/manage.ts`)

- [ ] Server action `createConnection({ ventureId, provider, displayName, credentials, scopeMetadata, createdBy })`:
  - Inserts payload into Vault, gets `vault_secret_id`
  - Inserts into `connections` with the returned id
  - Writes `connection_audit` row with `action='created'`
  - Returns the new connection id
- [ ] Server action `rotateConnection({ connectionId, newCredentials, rotatedBy })`:
  - Inserts new payload into Vault
  - Updates `connections.vault_secret_id` to the new id
  - Writes `connection_audit` row with `action='rotated'`
  - Old vault secret left in place (Vault retention is Supabase's responsibility)
- [ ] Server action `revokeConnection({ connectionId, revokedBy, reason })`:
  - Stamps `revoked_at = now()` on the connection row
  - Writes `connection_audit` row with `action='revoked'`, `request_summary = reason`
  - Does NOT delete the row — audit history must survive
- [ ] All three actions Zod-validate inputs; provider name must match `^[a-z][a-z0-9_]{1,31}$`; display name 1-80 chars; scope_metadata validated as JSON-serialisable

### `getConnection` accessor (`/lib/connections/get.ts`)

- [ ] Function signature:
  ```ts
  getConnection(opts: {
    ventureId: string;
    provider: string;
    loopRunId: string | null;       // null only for operator-initiated UI actions
    requestSummary: string;          // human-readable; required, min 1 char
  }): Promise<{
    connectionId: string;
    credentials: Record<string, unknown>;
    scopeMetadata: Record<string, unknown>;
  }>
  ```
- [ ] Implementation:
  1. SELECT from `connections` where `venture_id = $1 AND provider = $2 AND revoked_at IS NULL` ORDER BY created_at DESC LIMIT 1
  2. If no row: write `connection_audit` with `action='denied'` (against a sentinel connection_id? — see notes), throw typed `NoActiveConnectionError`
  3. If row found: write `connection_audit` row with `action='fetched'`, then call `vaultGet(vault_secret_id)`, return `{ connectionId, credentials, scopeMetadata }`
- [ ] Audit row lands BEFORE the credential is returned to the caller. If audit insert fails, the call fails — no silent skips.
- [ ] Hard-scoped to `venture_id` — confirmed by integration test that creates a Stripe connection on Kounta, calls `getConnection` for Counsel + Stripe, asserts `NoActiveConnectionError` thrown and zero rows leaked
- [ ] After the caller's external request completes, an optional `recordResponse({ auditId, responseStatus })` updates `connection_audit.response_status`. Loops should call this. Failure to call is logged but not fatal.

### Provider adapters (`/lib/connections/providers/*.ts`)

For Sprint 2 minimum: Stripe, Resend, Vercel, GitHub. Each adapter:

- [ ] Exports a typed credential shape (e.g. `StripeCredentials = { secretKey: string, accountId?: string }`)
- [ ] Exports a typed scope-metadata shape (e.g. `StripeScopeMetadata = { environment: 'prod' | 'sandbox' }`)
- [ ] Exports a `client(opts: { ventureId, loopRunId, requestSummary })` factory that calls `getConnection` and returns a wired SDK client
- [ ] Wraps the SDK so the caller can't bypass the audit (no raw `secretKey` exposed unless explicitly destructured)

### Venture settings UI

- [ ] `/ventures/[slug]/settings/connections` page lists connections for the venture: provider, display name, environment, created at, revoked status
- [ ] "Add connection" form: provider dropdown (constrained to known providers), display name, credential payload (JSON or guided form per provider), scope metadata
- [ ] Per-row actions: Rotate (modal with new payload), Revoke (confirm dialog, optional reason)
- [ ] Per-row link "View audit" → modal showing recent `connection_audit` rows: action, when, called_by_loop_id (with link if present), request_summary, response_status
- [ ] All UI follows `/.claude/design-system.md`: square corners on cards, no shadows, three-letter mono author tags, no emoji, no purple
- [ ] Admin-only — `role='admin'` check at the server action level

### Tests

- [ ] Vitest unit: `vaultPut` then `vaultGet` round-trips a payload
- [ ] Vitest unit: `createConnection` writes both rows; `getConnection` writes one row per call
- [ ] Vitest integration: create a connection on Kounta; `getConnection` for (Kounta, stripe) succeeds; `getConnection` for (Counsel, stripe) throws `NoActiveConnectionError`
- [ ] Vitest integration: revoke a connection; subsequent `getConnection` for the same (venture, provider) throws (until a replacement is created)
- [ ] Vitest integration: exclusion constraint rejects a duplicate active connection
- [ ] Playwright e2e: create a fake-provider connection through the UI; appears in list; revoke; appears as revoked
- [ ] Mocked Stripe adapter test: client factory calls `getConnection` and the audit row lands

### Quality

- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm lint` clean
- [ ] No `any` types in connections code
- [ ] Every exported function has JSDoc
- [ ] No raw credential reads outside `/lib/connections/` — grep test asserts `vault.decrypted_secrets` is referenced from exactly one file (`vault.ts`)

### Handoff

- [ ] HANDOFF.md committed with: migration verification, Vault enablement screenshot, getConnection trace from a test run, audit table contents after a fake Loop, screenshot of the venture settings connections page, exact next step for Sprint 2 (which providers to wire first)

---

## Definition of Done

- [ ] All acceptance criteria above ticked, with proof in HANDOFF.md
- [ ] Migration applied and reversible (down strategy: `drop table connection_audit; drop table connections;` — Vault secrets created by tests should be cleaned up via `vault.delete_secret`)
- [ ] No TypeScript errors
- [ ] Deployed to Vercel and reachable on `app.solodesk.ai`
- [ ] HANDOFF.md committed
- [ ] Git history clean

---

## Bright lines (hard prohibitions)

- **Cross-venture credential leakage is a bright line.** Same status as the recallContext rule. `getConnection` requires `ventureId` and never returns a row from another venture. Tested end-to-end. If a provider needs a "search across all my Stripe accounts" feature, that's a portfolio-level Loop running per-venture and merging — not a single multi-venture credential read.
- **No direct reads of `connections` for credential access.** Every credential fetch goes through `getConnection()`. The audit trail is the contract. A grep test asserts `vault.decrypted_secrets` and `vault_secret_id` only appear inside `/lib/connections/`.
- **No operator personal credentials in connections.** The encrypted payload is always for a service account at the provider, never Tim's personal account. UI copy reinforces this at creation time. Documented as the "service-account principle" — same logic as the AIOS UpAI/ClickUp pattern.
- **No connection without a venture.** `venture_id` is NOT NULL. There is no "global" connection. If a provider is used by SoloDesk itself (Resend for waitlist, Supabase for auth), those credentials live in Vercel env vars, not in this table.
- **No silent audit skips.** If the `connection_audit` insert fails inside `getConnection`, the function fails. Better to break a Loop run than to ship a credential without an audit row.

---

## Quality rubric

| Criterion | Target |
|---|---|
| Migration correctness — Vault integration, exclusion constraint, indexes | 5 |
| `getConnection` is the only credential read path (grep-enforced) | 5 |
| Cross-venture isolation tested end-to-end | 5 |
| Audit-before-return ordering enforced | 5 |
| Provider adapter ergonomics — Loop code is short and obvious | 4+ |
| TypeScript strictness — no `any`, no `@ts-ignore` | 5 |
| Test coverage — isolation, audit, exclusion, revocation | 4+ |
| UI matches design system spec | 4+ |

---

## Adversarial review prompt

```
You are the evaluator agent for SoloDesk Sprint 1.3 (Connections Layer). Read
CLAUDE.md, ROADMAP.md, /.claude/sprints/sprint-1.3-connections-layer.md,
SPRINT.md, and HANDOFF.md before doing anything else.

Your job: find what's wrong, incomplete, or insecure. Approve only if certain
it's done.

Specifically:
1. Run `pnpm tsc --noEmit` and `pnpm lint`. Report errors.
2. Verify migration applied: connections and connection_audit tables exist,
   indexes present, exclusion constraint in place. Try to insert two active
   rows for the same (venture, provider, display_name) and confirm rejection.
3. Verify Supabase Vault is enabled. Insert a test secret via vaultPut and
   read it back via vaultGet. Confirm round-trip.
4. Test cross-venture isolation: create a Stripe connection on Kounta. Call
   getConnection for ventureId=Counsel, provider=stripe. Confirm
   NoActiveConnectionError thrown and zero credential bytes returned.
5. Test audit-before-return ordering: mock the connection_audit insert to
   fail. Call getConnection. Confirm the function fails — credential must
   not be returned without an audit row.
6. Grep test: `grep -r "vault.decrypted_secrets\|vault_secret_id"
   --include="*.ts" --exclude-dir=node_modules .` — every match must be
   inside `/lib/connections/`. Any other location is a violation.
7. Test revocation: revoke a connection, confirm subsequent getConnection
   throws, confirm a replacement connection (same display_name) can be
   created.
8. Audit completeness: every server action (create, rotate, revoke) writes
   exactly one connection_audit row. Verified by integration test.
9. UI compliance: open `/ventures/kounta/settings/connections`. Confirm no
   purple, no gradients, no rounded cards, no avatars, no emoji. Three-letter
   mono author tags only. Phosphor icons only.
10. RLS check: confirm RLS is NOT enabled on either table (v0 intentional)
    and the policy stubs remain commented in the migration.
11. Score each rubric criterion. Justify any below target.
12. Score overall 1-10. Below 7 → not done.

Do not approve unless verified.
```

---

## Notes for the build session

**Why a sentinel connection_id for `denied` audit rows:** when `getConnection` finds no active connection, there's no `connection_id` to reference in the audit row. Two options: (a) create a synthetic "denied attempts" row in `connections` per (venture, provider) tuple to anchor the audit, (b) write the denied attempt to `events` instead of `connection_audit`. Option (b) is cleaner — `events` is the existing append-log surface. The build session should pick (b): denied attempts go to `events` with `type='connection_denied'`, source='system', payload={ventureId, provider, requestSummary, calledByLoopId}. Update the migration comment to reflect this.

**Provider name canonicalisation:** keep the slug list short and stable. New providers added through code review only — no dynamic provider creation. The dropdown in the settings UI is generated from a TS const array.

**Adapter shape lock-in:** all providers expose the same `client({ ventureId, loopRunId, requestSummary })` shape so Loops don't learn provider-specific factory APIs. The adapter file does the SDK-specific wiring.

**Vault secret retention:** when a connection is rotated, the old `vault_secret_id` is orphaned (the connection row points to the new id; the old row is overwritten). Vault retains old secrets indefinitely. For v0 that's fine; if Vault storage becomes a concern post-launch, add a cleanup cron that deletes vault.secrets for orphaned secret_ids older than N days.

**Why scope_metadata is jsonb not separate columns:** providers vary too widely. Stripe needs `account_id`, NetSuite needs `realm` and `subsidiary_id`, Twilio needs `account_sid` and a phone number — surfacing each as a column would either explode the schema or force null-padding. Keep the bag in jsonb, validate per-provider at the adapter level.

**Audit retention:** `connection_audit` will grow unbounded. At Sprint 2's scale (a few Loops × a few ventures × daily) it's tiny. If it ever becomes a concern, a quarterly archival job to cold storage is the play. Don't pre-optimise.

**Why no automatic rotation:** providers vary in rotation idioms, and v0 has one operator. Manual rotation through the UI is correct for now. When the team-inbound surface lands (post-Sprint-6) and multiple operators touch credentials, automated rotation becomes worth building.

**Operator service-account discipline (the non-technical bright line):** when creating a connection, the UI should remind the operator: "Use a dedicated service account at the provider, not your personal account. If the provider doesn't support service accounts, create a sub-account named `solodesk-<venture>-<env>`." Same logic Nate applies to ClickUp's UpAI account — the credential SoloDesk uses is owned by SoloDesk, not by the human operator.
