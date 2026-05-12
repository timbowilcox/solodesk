# Sprint B.5 HANDOFF — agent_note enforcement fix (decision/assumption field rename)

**Date:** 2026-05-12
**Branch:** claude/hungry-lalande-26a5fe → main
**Build session:** 1
**Status:** complete — all AC met, migration applied to production, typecheck/lint/test/build clean

---

## What was fixed

A substrate bug defeated the CLAUDE.md autonomy contract: Loop 1 office-hours, Loop 6 support-replier, Loop 4 content-writer, and the support-triage classifier all pre-filled `content.decision` at generation time. The enforcement gate in `approveDecisionDocument` checks `content.decision` non-empty as the resolution signal. A pre-filled decision therefore always resolved the gate — operators could approve through without explicitly confirming any of the agent's assumptions.

The fix splits the dual meaning into two named fields:
- `content.assumption` — LLM's narrative of what it decided on its own. Pre-filled at generation time. Read-only context for the operator.
- `content.decision` — operator's explicit response. Empty by default. Required non-empty for the Section to be resolved.

---

## Files changed

| File | Change |
|------|--------|
| `lib/db/documents.ts` | `AgentNoteContent` type gains `assumption: string`, `defer_count?: number` |
| `lib/supabase/types.ts` | `SectionStatus` gains `"deferred"` |
| `lib/agents/loops/office-hours.ts` | Prompt updated; `AgentJsonShape` uses `assumption`; `composeSections` filter + shape; exported for tests |
| `lib/agents/loops/support-replier.ts` | Same rename; `composeAgentNoteSeeds` extracted + exported for tests |
| `lib/agents/loops/content-writer.ts` | Same rename |
| `lib/agents/loops/support-triage.ts` | Same rename (audit finding — see note below) |
| `components/document/sections/agent-note.tsx` | Full rewrite: assumption display (read-only, ink-mute), Confirm/Revise/Defer affordances, resolution state badges |
| `components/document/section.tsx` | Threads `ventureSlug` and `documentId` props down to `AgentNoteSection` |
| `components/document/document.tsx` | Same prop threading |
| `app/(authed)/ventures/[slug]/decisions/[id]/page.tsx` | Passes `editable={isApprovable}`, counts unresolved, gates Approve button |
| `app/(authed)/ventures/[slug]/decisions/actions.ts` | Adds `resolveAgentNoteAction` (Confirm / Revise / Defer) |
| `supabase/migrations/0013_agent_note_field_rename.sql` | Adds `deferred` status; backfill; embedding trigger update |
| `tests/lib/db/documents.test.ts` | 3 new test cases (assumption+decision shape, deferred gate) |
| `tests/lib/agents/loops/office-hours.test.ts` | New file — 4 test cases for composeSections shape |
| `tests/lib/agents/loops/support-replier.test.ts` | New file — 4 test cases for composeAgentNoteSeeds shape |

---

## Backfill result (production)

Migration applied to `bahocpuzgrdtcrulicqz` (Solodesk, ap-southeast-2) 2026-05-12.

| Metric | Count |
|--------|-------|
| agent_note sections backfilled (in-flight docs) | 4 |
| agent_note sections left untouched (approved docs) | 2 |
| Old-shape sections remaining after backfill | 0 (all 2 are on approved Documents — by design) |

---

## Audit finding: support-triage

support-triage was found during the generator audit (`git grep -nE 'kind.*agent_note' lib/agents/`). It pre-filled `decision` with the LLM's classification reasoning — same pattern as the other three loops, even though support_ticket Documents can't be approved through `approveDecisionDocument` (which early-returns for `type !== 'decision'`). The rename was applied for consistency and correct semantics. The operator now sees "Agent assumed" + the reasoning, and must Confirm/Revise/Defer the classification before the triage document can be considered fully resolved.

---

## Adversarial check answers

**A generator writes an agent_note with both `assumption` and a pre-filled non-empty `decision`?**
`isAgentNoteResolved` returns true. No change to the function — it checks `decision` non-empty. A future generator doing this would defeat the gate. Discipline gap documented here: any generator adding agent_notes must follow the convention (assumption populated, decision empty). No linter rule exists yet; the test fixtures in `office-hours.test.ts` and `support-replier.test.ts` serve as the guard for existing generators.

**Operator clicks Revise, types decision text, then refreshes before saving?**
Text is lost; section stays unresolved. The Revise textarea is client-only state (React useState). No draft persistence. Documented gap — Phase C item.

**Operator clicks Defer on every agent_note?**
Document stays in `reviewing` indefinitely. Deferred sections are tracked via `status='deferred'` and `content.defer_count`. The count renders in the UI as "Deferred (×N)". An "is it stuck?" alert after N deferrals is Phase C — just the count is tracked here.

**Backfill races with a generator writing mid-execution?**
Backfill was a single SQL statement run against the live database. The generator inserts are also single transactions. Worst case: one new agent_note in the old shape survives the backfill window. The post-migration count confirmed 0 old-shape rows on in-flight Documents, so no race occurred.

**Operator approves a Document, then views it from another session?**
Actions on an approved section are no-ops — `resolveAgentNoteAction` reads current section content and updates it, but the `setSectionStatus` would overwrite `approved` back to `approved`. No visual harm. Phase C: surface "already resolved when approved" toast for stale views.

**System prompt rename causes LLM to output old shape?**
`composeSections` filter on `!note.assumption` drops any note that comes back without the field. Document loses the note but stays consistent. Prompt-evaluation test against opus-4-7 deferred (out of scope per SPRINT.md — Phase C if LLM non-compliance is observed in production).

**Pre-existing approved Documents with old shape render correctly?**
Yes. `AgentNoteSection` reads `assumption` first; falls back to `decision` for legacy display: `const assumption = content?.assumption ?? (section.status === "approved" ? (content?.decision ?? "") : "")`. The 2 approved old-shape sections render the legacy `decision` text as the assumption display.

---

## Operator-verified DOD

Pending Tim re-firing the Loop 1 office-hours scenario on Kounta:
1. Fire a Loop 1 office-hours invocation
2. Confirm Approve is disabled with count shown
3. Confirm each agent_note via Confirm or Revise
4. Confirm Approve enables
5. Approve — verify `decisions` row writes with `status='active'` AND all agent_note sections have `content.decision` non-empty

This is the final DOD gate per SPRINT.md. Notifying Tim now.

---

## Quality gate

| Check | Result |
|-------|--------|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm test` | 186/186 passing (22 test files, +9 new tests) |
| `pnpm build` | clean |
| Migration applied | ✓ 4 rows backfilled, 2 approved rows untouched |
