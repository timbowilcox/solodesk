# Sprint 10 — Streaming Sections + Loop 1 conversation

**Date:** 2026-05-07
**Repo:** solodesk
**Phase:** Experience layer (4 of 5)
**Spec:** `/.claude/sprints/sprint-10-streaming-sections.md`
**Estimated build sessions:** 3-4

## Scope

Largest sprint of the phase. Three substrate pieces and two surfaces:

1. **Document `drafting` / `cancelled` / `drafting_orphaned` states.** The schema enum extends. `bridge_tiles`'s "active" derivation (Sprint 8) updates to include drafting documents.

2. **Loop output protocol.** A simple line-prefixed format the agent emits:
   ```
   ###section: recommendation
   ...prose...
   ###section: evidence
   ...prose...
   ###comment: section=recommendation, ref=memory:abc
   ...critic comment...
   ###done
   ```
   `lib/loops/parser.ts` is a streaming state machine: scan tokens for `###` line prefixes, accumulate Section bodies between markers, emit typed events (`section_start`, `section_token`, `section_end`, `comment_added`, `done`). This is the single source of truth for Loop output structure — output that doesn't parse is rejected, not coerced (per CLAUDE.md streaming rule).

3. **Streaming runner.** `lib/loops/runner.ts` orchestrates: creates the `loop_runs` row, calls the Anthropic streaming SDK, feeds tokens through the parser, persists each Section as it closes, supports cancellation via a per-run flag in the DB.

4. **SSE endpoint.** `POST /api/loops/[loopId]/invoke` returns `text/event-stream`. Wraps the runner. On client disconnect, server completes idempotently and saves the Document (state: `drafting_orphaned` if critic hasn't finished). `POST /api/loops/runs/[runId]/cancel` sets a cancel flag the runner polls.

5. **Streaming Document view.** `components/document/StreamingDocument.tsx` (client) subscribes to SSE for a Document in `state='drafting'`, renders Sections with skeleton placeholders that fill in token-by-token, shows critic comments anchored to Sections after agent finishes. Pause / Cancel buttons.

6. **Loop 1 conversation surface.** New route `/ventures/[slug]/strategy`. Conversation thread (operator + agent + critic messages, distinct styling). Operator types question, hits send, agent message streams in. When agent crystallizes to a Decision Document, the Document streams inline in the thread.

**Substitutions and deviations from spec:**

- **Migration number bump.** Spec calls for `0008_loop_runs.sql`; that slot is taken. Sprint 10 uses `0011_streaming_sections.sql`. (`loop_runs` already exists from Sprint 0.)
- **Document approval ceremony updated** per CLAUDE.md / experience-layer-doc-updates: Document approval is a single operator action; Section-level state (resolved, agent_note open) enforced at approval time. Already landed in CLAUDE.md in Phase 0 (`88e7a8b`).
- **Live Loop 1 invocation verification is operator-driven.** The DoD line "Test: invoke Loop 1 with a real strategy question, observe full streaming run end-to-end" requires real Anthropic API spend. The substrate (parser, runner, SSE endpoint, StreamingDocument view) is fully unit-tested in this sprint; the live end-to-end test happens on Tim's first invocation post-deploy. Documented in HANDOFF, mirroring Sprint 7's Lighthouse note.
- **Loop 1 conversation persistence.** Spec is silent on the exact storage schema for conversation threads. Sprint 10 introduces `loop_threads` + `loop_thread_messages` tables (light, append-only). Decision Documents that crystallize from a thread link via `documents.metadata.thread_id`.
- **Reconnect/checkpoint endpoint** (spec's `/api/loops/runs/[runId]/checkpoint`) deferred to a follow-up in the experience-layer phase. SSE reconnects cleanly because incremental Section persistence means a page reload picks up wherever the run is. The dedicated checkpoint stream-replay path is over-engineered for the current invocation count.
- **Phosphor regular** continues. No new icon primitives.

## Acceptance criteria

### Streaming Sections

- [ ] Migration `0011_streaming_sections.sql` applies cleanly via Supabase MCP
- [ ] `documents.status` enum extends to include `drafting`, `cancelled`, `drafting_orphaned`
- [ ] `bridge_tiles` RPC updated so `state='active'` includes documents in `drafting` (Sprint 8 caveat now resolves)
- [ ] `lib/loops/parser.ts` is a pure streaming state machine — pushes tokens, emits typed events
- [ ] Parser handles partial chunks, fenced markers, and malformed input without throwing
- [ ] `lib/loops/runner.ts` calls `buildAgentPrompt()` (no parallel prompt construction path)
- [ ] Runner persists each Section incrementally as it closes
- [ ] Runner respects a `cancel_requested_at` flag set by the cancel endpoint
- [ ] `POST /api/loops/[loopId]/invoke` returns `text/event-stream`
- [ ] `POST /api/loops/runs/[runId]/cancel` sets the cancel flag and returns 202
- [ ] `StreamingDocument` component renders Sections as they arrive with skeleton placeholders
- [ ] Pause button stops client SSE without affecting server run
- [ ] Cancel button calls cancel endpoint; resulting Document is `state='cancelled'`
- [ ] Operator can edit a streamed Section after it completes; edit does not interrupt other Sections still streaming

### Loop 1

- [ ] `/ventures/[slug]/strategy` route reachable
- [ ] Thread persistence via `loop_threads` + `loop_thread_messages`
- [ ] Operator can type a question and hit send
- [ ] Agent message streams into the thread
- [ ] When agent emits Sections, an inline Document card appears in the thread streaming the Document
- [ ] Critic comments arrive after agent completes, anchored to Sections
- [ ] Operator can approve / reject the Document from the inline view
- [ ] Conversation history persists; navigating away and returning shows prior messages

### Cross-cutting

- [ ] `buildAgentPrompt({ streaming: true })` returns the parser-ready stream wrapper
- [ ] All existing non-streaming Loop call sites continue to work unchanged
- [ ] No console errors on a full streaming run
- [ ] Watch narrates Loop 1 events as they happen (`document.created`, `document.section_streamed`, `agent_note.opened`, `loop.invoked`, `loop.succeeded`)

## Definition of done

- [ ] All AC checked with proof (unit tests for substrate; operator-driven live invocation post-deploy noted in HANDOFF)
- [ ] SSE event types are a discriminated union; no `any` in handlers
- [ ] Cancelled runs leave Document in `state='cancelled'` (queryable but excluded from active counts)
- [ ] HANDOFF.md committed (root + archive)
- [ ] All work committed with conventional-commit messages
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all clean

## Quality rubric

| Criterion | What to check |
|-----------|---------------|
| Bright line: every loop through `buildAgentPrompt` | Streaming runner calls `buildAgentPrompt()`. No parallel prompt construction path |
| Bright line: typed Sections | Parser only emits Sections whose kind is in the existing enum. Output that doesn't parse is rejected, not coerced |
| Bright line: comments anchored to Sections with evidence | Every emitted comment includes a `section_id` reference and an evidence pointer; no global comments |
| Incremental persistence | Runner saves each Section to the DB as it closes (verified via unit test on the runner's persistence hook) |
| Idempotent server run | Hitting the cancel endpoint twice doesn't double-cancel; client disconnect doesn't kill the server run |
| Streaming hygiene | SSE endpoint cleans up on client abort. No leaked AbortController references |
| TypeScript | SSE event types and parser events are discriminated unions. No `any` |
| Error surfacing | Anthropic rate-limit, parser malformation, network error all surface to the operator (not silent failure) |

**Score threshold:** Must pass 7/8. The three bright-line criteria are non-negotiable.

## Out of scope

- Voice input on the conversation thread
- Multi-user concurrent edit on a streaming Document
- Real-time collaboration cursors
- Streaming critic-of-critic (one critic pass only)
- Branching conversation threads in Loop 1
- Conversation export / share
- Conversation thread search
- SSE checkpoint/replay endpoint (page-reload picks up incremental state instead)
- Token-by-token client-side typewriter rendering with throttling — for v1 we render Section content as it arrives in chunks; per-token CSS animation is polish, not required by AC

## Adversarial check questions (to be answered in HANDOFF)

- What if the agent stalls mid-Section? Expected: visible "stalled" indicator on the Section after 30s of silence; operator can cancel the run
- What if the user navigates away mid-stream? Expected: Document saved in DB up to the last completed Section; status `drafting_orphaned` if critic hasn't finished. Returning to the route resumes from DB state
- What if the critic disagrees on every Section? Expected: each Section gets an `agent_note` Section appended; Document holds in `reviewing` until operator resolves. No stuck state
- What if the network drops mid-SSE? Expected: client refetches via page reload; server completes the run idempotently; partial Document is in DB
- What if the operator edits a Section while another Section is still streaming? Expected: edit applies to that Section (writes to DB); other Sections continue streaming. No conflict
- What if Loop 1 produces no Document (just a conversation that doesn't crystallize)? Expected: thread persists; no Document created. Documented behavior
- What if multiple operators in same venture invoke Loop 1 simultaneously? Expected: each gets their own thread (`loop_threads.user_id` keyed per operator). No cross-pollination
- Does the streaming endpoint enforce membership scoping? Expected: yes — `ventureId` from URL must match operator's membership via `requireVentureAccess`
- Does the Watch reflect Loop 1 activity? Expected: yes — runner inserts `loop.invoked`, `document.created`, `document.section_streamed`, `agent_note.opened`, `loop.succeeded` events; Watch's narrate formatter (Sprint 9) handles all of them
- Does the parser reject non-protocol output? Expected: yes — characters before the first `###section:` are dropped; unrecognised `###` directives raise a parser error event
