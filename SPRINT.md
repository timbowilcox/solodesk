# Sprint B.5 — agent_note enforcement fix (decision/assumption field rename)

**Repo:** solodesk
**Phase:** B (autonomy + modal foundation), post-bridge fix sprint
**Spec authority:** CLAUDE.md anti-pattern (*"No Document flips to `approved` while it has unresolved `agent_note` Sections"*), `.archive/handoffs/agent-note-enforcement-diagnosis.md`
**Estimated build sessions:** 1

## Scope

Live dogfood on production surfaced a substrate bug in the autonomy contract: Loop 1 office-hours and Loop 6 support-replier produce Documents whose `agent_note` Sections silently pass the resolution check at approval time, letting operators approve through without confirming the agent's assumptions. The CLAUDE.md anti-pattern reads:

> *No Document flips to `approved` while it has unresolved `agent_note` Sections. Every elicitation must be confirmed, revised, or explicitly deferred — never silently approved through.*

The diagnosis (`.archive/handoffs/agent-note-enforcement-diagnosis.md`) identified the root cause: the field `content.decision` carries two conflicting meanings depending on which loop wrote the Section.

| Loop | `content.decision` semantics | Written by |
|---|---|---|
| Loop 1 (streaming runner) | Operator's response — empty until they fill it | Operator |
| Loop 1 (office-hours generator) | LLM's assumption that resolved the ambiguity | LLM at generation time |
| Loop 6 (support-replier) | LLM's assumption | LLM at generation time |

`isAgentNoteResolved` checks `content.decision` non-empty as the resolution signal. For office-hours and support-replier generated Sections, the field is pre-filled by the LLM, so the gate always passes regardless of operator action. The enforcement is intact in code; it's defeated by the field-naming collision.

This sprint splits the two meanings into two named fields:

- `content.assumption` — the LLM's narrative of what it decided on its own. Pre-filled at generation time. Read-only context for the operator.
- `content.decision` — the operator's explicit response. Empty by default. Required non-empty for the Section to be resolved.

UI gains a per-agent_note affordance (Confirm / Revise / Defer) that writes `content.decision`. Operator must act on each agent_note before bulk-approve becomes available.

**Substitutions and deviations from spec:**

- **No migration.** `content` is jsonb; field rename is a content-shape change, no schema change. Existing Documents in production with the old shape (LLM's assumption sitting in `content.decision`) are migrated by a one-off backfill that copies `decision` → `assumption` and clears `decision` for any Section where the Document is still in `draft` or `reviewing` status. Already-approved Documents are left alone (their approvals are historical record; rewriting them would muddy the audit trail).
- **Confirm / Revise / Defer affordance — Confirm is the default action.** The operator can resolve an agent_note in one tap by selecting Confirm, which writes `content.decision = content.assumption` (signalling "I agree with the agent's call"). Revise opens a text input for the operator's own decision. Defer pushes a Question-modal-like deferred state — sets the agent_note's `status='deferred'` and writes a follow-up reminder.
- **Bulk-approve preserved but gated.** The Approve decision button remains a single click, but it is disabled in the UI and refused by the server action while any agent_note in the Document is unresolved. UI shows a count: "Approve (3 elicitations to resolve first)".

## Acceptance criteria

### Loop-side rename — office-hours

- [ ] `lib/agents/loops/office-hours.ts` system prompt updated: the agent_notes array schema documents `question`, `assumption`, `alternatives` (no `decision` field). The prompt explicitly tells the LLM: *"`assumption` is your reasoning, `decision` is for the operator — never fill it."*
- [ ] `composeSections()` writes `content: { question, assumption: note.assumption.trim(), alternatives: note.alternatives?.trim() ?? undefined, decision: "" }`. The empty-string `decision` initialisation is explicit and load-bearing.
- [ ] The filter `if (!note.question || !note.decision) continue` becomes `if (!note.question || !note.assumption) continue` — notes without an assumption are still dropped, but the gate is now on the LLM's pre-fill, not on the operator's response.

### Loop-side rename — support-replier

- [ ] `lib/agents/loops/support-replier.ts` same changes as office-hours. Same prompt language, same composeSections shape, same filter swap.

### Loop-side rename — any other generator that emits agent_notes

- [ ] Grep `git grep -nE 'kind:\s*"agent_note"' lib/agents/` and audit every generator. If any other loop emits agent_notes with pre-filled `decision`, apply the same rename. Document any found in HANDOFF.

### Enforcement — isAgentNoteResolved

- [ ] No change to `isAgentNoteResolved` in `lib/db/documents.ts`. The function is correct — it just needs the input data to follow Loop 1 streaming's convention (empty decision = unresolved). The rename makes every generator follow that convention.
- [ ] Verify by reading: the function should remain checking `content.decision` non-empty as the resolution signal.

### Backfill — existing in-flight Documents

- [ ] One-off SQL script or migration committed at `supabase/migrations/0017_agent_note_field_rename.sql` (or equivalent) that:
  - Selects all `sections` where `kind='agent_note'`, `status='draft'`, and the parent Document is in `draft` or `reviewing` status (i.e., not yet approved)
  - Updates `content = jsonb_set(jsonb_set(content, '{assumption}', content->'decision'), '{decision}', '""')` — moves `decision` value into `assumption`, clears `decision`
- [ ] Approved Documents (status='approved' or 'active') are NOT touched. Their historical state stays.
- [ ] Test the backfill on a Supabase snapshot before applying to production. Document the count of rows affected in HANDOFF.

### UI — per-agent_note affordance

- [ ] The agent_note section component in `components/document/sections/` (or wherever) renders the `assumption` field as read-only context ("Agent assumed: …") with appropriate visual treatment (lighter weight, the existing `ink-mute` token).
- [ ] Below the assumption, three action affordances: **Confirm** (default focus), **Revise**, **Defer**.
  - Confirm — one tap, writes `content.decision = content.assumption` via a server action. Section flips to `status='approved'`.
  - Revise — opens an inline textarea, operator types their own decision. On submit, writes `content.decision = <operator text>` and flips status to approved.
  - Defer — writes `status='deferred'` on the section. A Question-style follow-up is scheduled. Document cannot approve while any section is deferred; deferred sections re-surface at next briefing per the existing Question archetype pattern.
- [ ] Section visually shows resolution state: unresolved (default styling), Confirmed (subtle tick), Revised (subtle pencil), Deferred (subtle clock).

### UI — Approve button gating

- [ ] Approve decision button disabled while any agent_note section in the Document has `content.decision === ""` (or is deferred)
- [ ] Button label reflects state: "Approve (3 elicitations to resolve first)" with the count of unresolved agent_notes
- [ ] On hover/focus while disabled, surface tooltip explaining the gate
- [ ] Server-side `approveDecisionDocument` keeps its existing enforcement check — defence in depth. UI gating prevents the bad request; server check rejects it if somehow bypassed (direct API call, race, etc.)

### Tests

- [ ] `tests/lib/db/documents.test.ts` — new test case: agent_note with `content.assumption='X'` and `content.decision=''` is NOT resolved
- [ ] `tests/lib/db/documents.test.ts` — new test case: agent_note with `content.assumption='X'` and `content.decision='X'` IS resolved (operator confirmed)
- [ ] `tests/lib/db/documents.test.ts` — new test case: agent_note with `status='deferred'` is treated as a gate (Document cannot approve)
- [ ] `tests/lib/agents/loops/office-hours.test.ts` — new test verifying composeSections writes the new shape (assumption populated, decision empty) for a synthetic LLM payload
- [ ] `tests/lib/agents/loops/support-replier.test.ts` — same test for support-replier
- [ ] If component tests exist for the agent_note section UI, add cases for the three action affordances. If component tests don't exist yet (per the cancel-fix HANDOFF's note about JSDom), defer with explicit gap disclosure in HANDOFF.

## Definition of done

- [ ] All AC checked with proof
- [ ] HANDOFF.md (Sprint B.5) committed
- [ ] ROADMAP.md updated — B.5 marked shipped, note added to Phase B section
- [ ] All work committed with conventional-commit messages on a feature branch (suggest `b5-agent-note-fix`)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all clean
- [ ] Backfill executed on production (with row count noted) before merge
- [ ] **Operator-verified DOD:** re-run the dogfood scenario that surfaced this bug — fire a Loop 1 office-hours invocation on Kounta, watch Approve be disabled, resolve each agent_note via Confirm or Revise, watch Approve enable, complete the approval, verify `decisions` row writes with `status='active'` AND every agent_note section has `content.decision` non-empty

## Quality rubric

| Criterion | What to check |
|-----------|---------------|
| Bright line: agent_note enforcement is real | After this sprint, no Document with an unresolved agent_note can flip to approved. Verified by: (a) operator-verified DOD above, (b) server-side test that calls approveDecisionDocument on a Document with an unresolved agent_note and confirms rejection |
| Bright line: no silent field collisions | Grep test: no file outside `lib/db/documents.ts` reads `content.decision` for the resolution-check purpose. All generators write to `assumption`; only operator action writes to `decision` |
| Backfill correctness | Snapshot test: synthetic in-flight Document with old-shape agent_note → run backfill → check assumption populated, decision empty. Approved Document with old-shape → run backfill → check untouched |
| No regression on Loop 1 streaming | Loop 1 streaming agent_notes (the original convention) keep working — text/decision pair, operator fills decision, gate passes when filled |
| UI affordance discoverability | The three actions (Confirm / Revise / Defer) are visible on every agent_note section. The Approve button's gated state is obvious, not hidden |
| TypeScript | `AgentNoteContent` is a typed shape with `assumption: string`, `decision: string`, optional `alternatives`, optional `question`. No `any` |
| Test coverage delta | 5+ new test cases covering the rename, the backfill behaviour, the enforcement, and the loop-side composeSections output |

**Score threshold:** 7/7. Bright lines non-negotiable. This sprint exists to make the autonomy contract real — half-measures defeat the purpose.

## Out of scope

- Visual library illustrations for the agent_note section (placeholder treatment is fine — agent_notes are inline section UI, not modal heroes)
- Migration of *approved* Documents to the new shape (audit trail preservation — leave them alone)
- Rewriting of the office-hours system prompt beyond the rename (the prompt is large; only the agent_notes section needs editing)
- The Refine action full flow on Decision modals (still B.4.5 stubbed — separate sprint)
- Question modal free-text answer routing (same as Refine — separate sprint)
- Loop 1 streaming runner changes (its convention is the model, no changes needed)
- Component test infrastructure (JSDom + testing-library) — out of scope; deferred per cancel-fix HANDOFF

## Adversarial check questions (to be answered in HANDOFF)

- A generator writes an agent_note with both `assumption` and a pre-filled non-empty `decision`? Expected: `isAgentNoteResolved` returns true. The check doesn't distinguish source. This is an anti-pattern at the generator level; the rename + prompt update is the fix. Document this as a discipline gap: any future generator that's added must follow the convention. Add a linter rule or test fixture as a guard.
- Operator clicks Revise, types decision text, then refreshes the page before saving? Expected: text is lost; section stays unresolved. The Revise flow doesn't have draft persistence — that's Phase C. Document this UX gap.
- Operator clicks Defer on every agent_note in a Document? Expected: Document stays in `reviewing` status indefinitely. Deferred sections re-surface at next briefing per Question archetype pattern. After N deferrals on the same section, surface an Alert ("This decision has been deferred 4 times — is it stuck?"). Defer the Alert wiring to Phase C; just count deferrals in the section state for now.
- Backfill races with a generator writing a new agent_note mid-execution? Expected: the backfill is a single transaction; the generator's insert is also single transaction. Worst case is one new agent_note in the old shape that survives the backfill. Document and run a second pass if found.
- Operator approves a Document, then someone (Phase C teammate, or operator on a different machine) views the Document and tries to take action on an already-approved agent_note? Expected: actions are no-ops on approved sections. Surface a toast: "This section was already resolved when the Document was approved."
- The system prompt rename causes the LLM to output the old shape (no `assumption` field, sticking `decision` in by habit)? Expected: composeSections's filter (`!note.assumption`) drops the note. The Document loses content but stays consistent. Add a one-off prompt-evaluation test against opus-4-7 with 5 example questions to verify the LLM honours the new schema; if it doesn't, strengthen the prompt or add a renaming pass before composeSections.
- Pre-existing Documents in production have approved agent_notes with the old shape — what happens on next view? Expected: no rendering change. The component reads `assumption` first, falls back to `decision` for legacy display, so old-shape approved Documents still render correctly. Add the fallback explicitly.
