# Decision Document Interface — UX Spec

**Version:** 0.1
**Date:** 2026-04-27
**Status:** Design spec, not yet a sprint
**Applies to:** Sprints 1, 3, 4, 5, 6 (every loop that produces an artifact)
**Built on:** Jacob Beckerman's "agents need more than chat" framing (Legora, AI Engineer Summit Paris 2026), Barry's verifier's-rule discipline, the existing TCOS architecture.

---

## Why this exists

The substrate (Sprint 0) and memory layer (Sprint 0.5) are correctly designed. The *interface* through which Tim interacts with agent outputs is currently under-specified: it defaults to "form + table + maybe a chat." That's the wrong primitive for collaborating with agents on complex work.

Jacob's argument: chat collapses a tree of work into one dimension. For tasks that are hard to verify (strategy, content, intel), chat forces the human to either accept the whole output or reject the whole output. Both are bad. The right primitive is a *durable, structured artifact* that the human and the agent can both work in — addressed by section, comment-able inline, revisable in place.

This spec defines that primitive — the **Document** — and the patterns built on top of it (Comments, Tables, Diffs). Sprints 1-6 implement variations on these. Get the design right once, reuse everywhere.

---

## Core primitive: the Document

A Document is a structured, persistent, addressable artifact. Every agent output that requires human judgment lands as a Document — never as a chat transcript, never as a flat textarea, never as an opaque blob.

### Properties every Document has

- **Addressable structure.** Every Document is composed of typed Sections. Each Section has a stable `id`, a `kind`, an `order`, and content. The Section is the unit of comment, edit, approve, and revise.
- **Status per Section.** Not just per Document. Sections move independently through `draft → reviewing → approved | revising | rejected`. The Document is "approved" when every Section is.
- **Versioned.** Every edit creates a new Section version. Old versions retained, diffable.
- **Persistent.** A Document URL is permanent. You can link to it in Slack, in another Document, in a HANDOFF.
- **Citable.** Every Section can be cited as a memory hit (recallContext returns Section-level results, not Document-level).

### Section kinds

Loops produce different Section kinds. The renderer dispatches on `kind`:

| Kind | Purpose | Sprints using it |
|---|---|---|
| `prose` | Free-form markdown | All |
| `recommendation` | A claim with confidence score | 1, 3, 5 |
| `alternatives` | List of options the agent considered | 1, 3 |
| `kill_criteria` | Conditions under which to abandon | 1, 3 |
| `evidence` | Citations to memory hits or external links | All |
| `risk` | Identified risk + severity + mitigation | 1, 3, 5, 6 |
| `metric_block` | Embedded chart or numeric KPI | 8 |
| `intel_signal` | Single competitive signal: source, observation, severity, suggested action | 5 |
| `support_reply_block` | Drafted reply with classification + reasoning | 6 |
| `content_block` | Drafted content for a channel + audience | 4 |
| `comment_thread` | Inline conversation anchored to a Section | All |
| `agent_note` | Private note from agent to itself or to next-stage critic | All |

This is the catalogue. New kinds get added when a loop genuinely needs one — not before.

---

## Comments

Comments are inline conversations anchored to a Section. They're the bandwidth Tim uses to give judgment without rewriting the agent's output.

### Lifecycle

1. Agent produces a Document with one or more Sections.
2. Critic reviews. If it has objections, it leaves comments anchored to specific Sections — not a global review note. Comments link to evidence (memory hits, prior decisions, anti-patterns from COMPANY.md).
3. Tim opens the Document. He sees comments inline, in margin or as a sidebar. He can:
   - **Accept** — applies the suggested change to the Section.
   - **Revise** — agent regenerates *that Section only*, not the whole Document, with the comment as input.
   - **Dismiss** — comment is closed, original Section stands.
   - **Reply** — Tim adds a counter-comment that becomes input to a re-review.
4. When all comments are resolved (accepted, dismissed, or replied-and-resolved), the Section can be approved.

### Anti-patterns

- **No global "approve all" without per-Section consideration.** Every Section gets its own approval state. If Tim wants to approve everything quickly, that's a UI affordance (one click that approves all Sections currently in `reviewing`), not a data-model shortcut.
- **No silent comment dropping.** Dismissing a comment requires a reason recorded as `dismiss_reason`. This is the audit log.
- **No critic comments without evidence pointer.** Every critic comment must link to *something* — a memory hit, a COMPANY.md anti-pattern, a prior decision, an external URL. Opinionated comments without evidence are a smell and the critic skill rubric should reject them.

---

## Tables

For batch work (Jacob's "tabular review" primitive), the artifact is a Table where each row is a Document. The Table renders only the columns Tim needs to triage; clicking a row opens the full Document.

### Use cases

- **Loop 5 intel scout:** rows = signals, columns = source / observation / severity / suggested action / decision.
- **Loop 6 support triage:** rows = tickets, columns = from / subject excerpt / classification / urgency / draft status.
- **Loop 4 content batch:** rows = drafts ready for review, columns = channel / audience / hook / approval status.
- **Decision retrospective (Sprint 1):** rows = decisions made > 30 days ago, columns = title / outcome status / effort spent / blank "outcome notes" cell to fill in.

### Table affordances

- **Bulk actions.** Tim selects multiple rows, applies the same decision (approve, dismiss, escalate). Each row still records the decision individually for audit.
- **Filters.** By severity, status, age, venture. Default views are pre-saved filters.
- **Inline editing.** Single-cell edits (decision, outcome notes) without opening the full Document. Heavier edits open the Document.
- **Keyboard-first.** j/k to move between rows, enter to open, a to approve, x to dismiss, c to comment. This sounds fussy until you have 30 intel signals to triage on a Sunday evening.

### Anti-patterns

- **No table without a filter applied.** Default views always have a filter — pending review, severity ≥ medium, this venture. "Show me everything" is one click away but not the default.
- **No bulk approve without confirmation if any row's severity is high.** Soft guardrail.

---

## Diffs

When an agent revises a Section in response to a comment, the result is a Diff — old Section vs new Section, with the comment that triggered the revision shown alongside.

### Display

- Side-by-side or unified diff (Tim's preference, persistent).
- Comments preserved with their resolution state.
- Approve-the-revision is a single action that closes the comment and approves the Section.
- Reject-the-revision rolls back to the previous version and reopens the comment.

### Why this matters

Without diffs, "revise this Section" produces opaque output and Tim has to re-read the whole Section. With diffs, Tim sees only what changed and decides in 10 seconds instead of 2 minutes. This is the bandwidth multiplier.

---

## Comment threads as agent input

Critical design choice: comment threads are *not* just for human-to-human collaboration. They're the channel by which Tim gives input to the agent.

### Pattern

1. Agent produces a Section.
2. Tim opens it. Sees something off. Adds a comment: "this conflicts with the Corum anti-pattern about director outreach."
3. The comment surfaces the relevant memory hit automatically (the recall layer is venture-scoped — it can find the anti-pattern).
4. Tim hits Revise. The agent gets:
   - The original Section
   - Tim's comment text
   - The auto-surfaced memory hit
   - The Section's history of revisions
5. The agent regenerates that Section only. New version diffed against old.
6. Tim approves the diff or comments again.

This is the loop Jacob describes — high-bandwidth, artifact-mediated, narrow context. The agent never sees the whole Document context window full of every conversation Tim has ever had; it sees this Section, this comment, this memory hit. Cheap, fast, debuggable.

### Anti-patterns

- **No agent regenerates more than the commented Section.** Hard rule. If the agent thinks an adjacent Section also needs change, it leaves a comment on that Section, doesn't edit it.
- **No multi-turn agent debates in comment threads.** Critic agent can leave one comment per pass. Tim is the one who threads. This stops agents from filibustering.

---

## Elicitation: when the agent needs input

Jacob's elicitation point: agents shouldn't block waiting for human input on every uncertainty, but they should record the decisions they made when they hit ambiguity.

### Pattern

When an agent hits ambiguity mid-generation:

1. **Default action:** make a best-effort decision and proceed. Don't block.
2. **Log it.** Write an `agent_note` Section with: what was ambiguous, what decision was made, what alternatives were considered, what would change the decision.
3. **Surface in UI.** When Tim opens the Document, agent_note Sections render with a yellow flag and a "Was this right?" affordance. Tim can confirm (becomes durable judgment, written to memories), revise (triggers regeneration), or dismiss (decision stands but is now logged).
4. **Compounding.** Confirmed decisions get embedded as memories with `source = 'elicitation_resolved'`. Future runs of the same skill recall them — same ambiguity → already-resolved decision surfaces, agent uses it without asking again.

This is how the harness genuinely compounds. Every elicitation Tim resolves becomes context for the next run.

---

## Per-loop instantiation

How each loop maps to Documents.

### Loop 1 (Sprint 1 + Sprint 3) — Strategy / decisions

**Document type:** `Decision`.

Sections:
- `prose` (one-line title + context)
- `recommendation` (the claim, with confidence)
- `alternatives` (3-5 options considered, why each was rejected if not chosen)
- `kill_criteria` (when to abandon this)
- `evidence` (memory hits + external citations)
- `risk` (identified risks + mitigations)
- `agent_note` (any ambiguities the agent resolved on its own — yellow flag for Tim)

Tim's flow:
1. Open `/ventures/[slug]/decisions/[id]`
2. Read recommendation + alternatives
3. Comment on anything off, especially flagged agent_notes
4. Approve Section by Section, or one-click approve all
5. Document status flips to `active`. Outcome field opens for retrospective backfill in 30 days.

Anti-pattern: no Decision can be `approved` if it contains an unresolved `agent_note`. Tim must explicitly confirm or revise the elicitation.

### Loop 4 (Sprint 4) — Content

**Document type:** `Content`.

Sections:
- `prose` (brief — channel, audience, CTA, voice notes — Tim writes this)
- `content_block` (the draft itself, written by content-writer)
- `agent_note` (any voice/audience ambiguities resolved)
- `comment_thread` (critic's review, anchored to specific paragraphs of the content_block)

Tim's flow:
1. Tim writes the brief (prose Section).
2. content-writer generates the content_block.
3. content-critic reviews. Leaves comments anchored to specific lines of the draft. Each comment includes the rubric criterion violated and the COMPANY.md voice/anti-pattern hit.
4. Tim opens the Document. Reads draft. Resolves comments by Accept (apply suggestion), Revise (regenerate that paragraph), Dismiss (record reason).
5. When all comments resolved and content_block status is `approved`, publish action available.

Anti-pattern: critic's comments must reference a rubric criterion or anti-pattern by name. "This feels off" without a pointer is auto-rejected.

### Loop 5 (Sprint 5) — Competitive intel

**Document type:** `Intel Digest` (a Document that contains a Table of Signals).

Sections:
- `prose` (week's summary — 2-3 sentences from intel-scout)
- `intel_signals_table` (a Table primitive — each row is an intel_signal Section)

Each `intel_signal` row:
- Source URL
- Observation (what the agent saw)
- Severity (low/medium/high)
- Suggested action (continue monitoring / surface to strategy / kill)
- Tim's decision (the cell Tim fills in)

Tim's flow:
1. Open the weekly digest, default filtered to severity >= medium.
2. Scan rows. j/k to move, enter to open one for full context.
3. For each: a (approve agent's suggestion), r (revise), x (dismiss as noise).
4. High-severity signals with `suggested action = surface to strategy` auto-create a Decision (Loop 1) when Tim approves.

This is the pure tabular-review primitive. Most weeks Tim spends 5 minutes here.

### Loop 6 (Sprint 6) — Support triage

**Document type:** `Support Ticket` for individual replies, `Triage Queue` (Table) for the batch view.

Triage Queue (Table):
- Row = `Support Ticket` Document
- Columns: from / subject / classification / urgency / draft status
- Default filter: status = needs_reply, urgency >= medium

Each `Support Ticket` Document:
- `prose` (original message, read-only)
- `support_reply_block` (drafted reply)
- `agent_note` (classification reasoning + any ambiguities)
- `comment_thread`

Tim's flow:
1. Open Triage Queue, scan urgent rows.
2. Click into one. Read original. Read draft. Comment or approve.
3. Approved drafts queue for send (separate explicit action — never auto-send).

Anti-pattern: no auto-send ever. The send action is a discrete user click, not a status flip side effect.

### Loop 8 (Sprint 2) — Daily metrics digest

**Document type:** `Daily Digest`.

Sections:
- `prose` (headline — one sentence, what changed that matters)
- `metric_block` (north-star + supporting KPIs with sparklines)
- `prose` (anomalies — list, each with proposed cause from anomaly-explainer)
- `agent_note` (any anomaly the agent couldn't explain — yellow flag)
- `prose` ("Your three decisions today")

Tim's flow:
1. Email arrives 6am with link to the digest.
2. Tim opens it. Reads headline, scans metrics.
3. For unexplained anomalies, click "Investigate" — kicks off another anomaly-explainer run with more context.
4. The "three decisions" prose can contain links to Documents needing his approval today (across all loops).

This Document is also the daily entry point — not the dashboard view.

### Loop 10 (Sprint 1) — Decision retrospective

**Document type:** Same as Loop 1 (`Decision`), but the Table view shows decisions older than 30 days with their outcome cell editable.

Tim's flow:
1. Weekly Sunday review opens the retrospective Table.
2. Filtered to active decisions older than 30 days with outcome empty.
3. For each, Tim adds an outcome note (worked / didn't / killed / superseded) and optional learnings.
4. Bulk approve to mark all reviewed.

Outcome notes get embedded into memories. Future office-hours runs recall them — "last time you decided X for similar context, here's what happened."

---

## Database additions

Sprint 0's schema is fine. The Document primitive needs new tables in a future migration (probably `0003_documents.sql` shipped alongside Sprint 1).

```sql
create table documents (
  id              uuid primary key default gen_random_uuid(),
  venture_id      uuid references ventures(id) on delete cascade not null,
  type            text not null,        -- 'decision','content','intel_digest','support_ticket','daily_digest'
  title           text not null,
  status          text default 'draft', -- 'draft','reviewing','approved','rejected','published','archived'
  loop_name       text not null,        -- which loop produced it
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  approved_at     timestamptz,
  metadata        jsonb default '{}'::jsonb
);

create table sections (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid references documents(id) on delete cascade not null,
  kind            text not null,        -- 'prose','recommendation','alternatives', etc.
  ord             int not null,
  content         jsonb not null,       -- shape depends on kind
  status          text default 'draft', -- 'draft','reviewing','approved','revising','rejected','dismissed'
  version         int default 1 not null,
  parent_version  uuid,                 -- previous version of this section if revised
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index sections_document_ord_idx on sections (document_id, ord);

create table comments (
  id              uuid primary key default gen_random_uuid(),
  section_id      uuid references sections(id) on delete cascade not null,
  author          text not null,        -- 'tim' or 'agent:<name>'
  body            text not null,
  evidence        jsonb default '[]'::jsonb,  -- memory_hits, urls, prior decision ids
  status          text default 'open',  -- 'open','accepted','dismissed','replied'
  dismiss_reason  text,
  created_at      timestamptz default now(),
  resolved_at     timestamptz
);

create index comments_section_status_idx on comments (section_id, status);
```

`decisions` and `artifacts` tables from Sprint 0 don't go away — they continue to exist as the *output* surface, written to by Documents on approval. Documents are the editing UX; decisions and artifacts are the queryable record. A Document with type=`decision` writes a row into `decisions` when its status flips to `approved`.

---

## Implementation pattern (React)

A Document renders as:

```
<Document id={id}>
  <DocumentHeader />
  {sections.map(s => (
    <Section key={s.id} section={s}>
      {s.kind === 'prose' && <ProseSection />}
      {s.kind === 'recommendation' && <RecommendationSection />}
      {s.kind === 'intel_signals_table' && <SignalsTable />}
      {s.kind === 'agent_note' && <AgentNoteSection />}
      <CommentThread sectionId={s.id} />
      <SectionActions sectionId={s.id} />
    </Section>
  ))}
</Document>
```

Components live in `/components/document/`. New Section kinds = new components. Same pattern for every loop.

Server actions:
- `approveSection(sectionId)`
- `reviseSection(sectionId, comment)` — fires the agent regeneration
- `dismissComment(commentId, reason)`
- `addComment(sectionId, body, evidenceRefs)`
- `acceptCommentSuggestion(commentId)`

Each action logs to `loop_runs` with `loop_name = 'document:<action>'`. Same observability discipline as agent runs.

---

## What this changes about the sprint plan

### Sprint 1 — was: simple decision-log CRUD. Becomes: Document/Section/Comment substrate + the Decision document type.

This is more work than the original Sprint 1 — probably 3 sessions instead of 1-2. The payoff: every subsequent loop sprint is faster because it just defines new Section kinds.

### Sprints 3, 4, 5, 6 — the agent skills don't change.

The agents still do the same generation. What changes is they output to Documents (with typed Sections) instead of writing single artifacts. That's a thin wrapper, not a redesign.

### Sprint 2 (metrics) — small change.

Daily Digest becomes a Document with `metric_block` Sections instead of a plain markdown email. Email becomes a link to the Document.

### Sprint 0 + Sprint 0.5 — no change.

Substrate and memory layer are correct as designed.

### New constraints to add to CLAUDE.md

- No agent writes a flat artifact directly. Agents always write Documents with typed Sections.
- No skill ships a critic that leaves a global review note. Comments anchor to Sections.
- No agent regenerates more than the Section it's responding to.
- No decision flips to `approved` while it has unresolved `agent_note` Sections.

---

## Why this matters for productisation

If SoloDesk pivots to a product in November 2026, the Document primitive *is* the moat. The agents are commoditising; the rubrics are valuable; but the artifact-first UX where humans actually do operational work with agents — that's what nobody else has built well. Linear is a Document with one type. Notion is a Document without typed Sections. Both are general-purpose. SoloDesk's Document, with kind-aware rendering and per-Section agent collaboration, is a vertical-AI primitive specific to portfolio operation work.

The longer Tim runs SoloDesk before deciding to productise, the more refined the Section catalogue gets. That catalogue is the product.

---

## What to do next

Don't start Sprint 1 yet. The current SPRINT.md draft (decision log + retrospective) is sized for the *old* design. It needs rewriting against this spec.

Recommended sequence:

1. Finish Sprint 0 deploy verification (current state).
2. Build Sprint 0.5 (memory layer) per existing plan.
3. **Pause before Sprint 1.** Spend one session designing the Section catalogue more rigorously — what kinds are needed in v1, what each looks like rendered, what each looks like in the database.
4. **Rewrite SPRINT.md for Sprint 1** as: "Document/Section/Comment substrate + Decision document type." Acceptance criteria expand.
5. Build it.
6. Sprints 2-6 follow with new SPRINT.md rewrites that reference this spec.

This adds roughly 2-3 sprint sessions of total work versus the original plan but produces a meaningfully better tool to use *and* a meaningfully more defensible product if/when commercialised.
