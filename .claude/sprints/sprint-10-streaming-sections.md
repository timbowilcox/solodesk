# Sprint 10 — Streaming Sections + Loop 1 conversation

Date drafted: 2026-05-07
Phase: Experience layer (4 of 5)
Estimated build sessions: 3-4
Depends on: Sprints 7-9 (visual identity, Bridge, Watch)

## Position

Documents come alive. The Watch narrates that work is happening; this sprint is what the operator sees when they click into a Document being written. Loop 1 ships as the first conversation surface, replacing the request-response Loop 1 implementation.

## Rationale

Streaming Section generation is the thing that makes the substrate's typed-Section discipline feel rewarding rather than ceremonial. The operator watches the Recommendation appear, then Evidence fills in, then Risk, then the Critic arrives with anchored comments. Without this, a Document materializes whole and the work feels invisible.

Loop 1 as conversation thread is where the COO feeling lives in a single interaction — agent, critic, and operator visibly participating in the production of a Decision Document.

## Scope

### Streaming Section endpoint

New endpoint pattern: `POST /api/loops/[loopId]/invoke` returns `text/event-stream`.

Server-side flow:
1. Receive Loop invocation request (loopId, ventureId, task)
2. Call `buildAgentPrompt({ skill, ventureId, task })` (existing single funnel)
3. Stream Anthropic API response, parsing into Sections as they complete
4. Persist each Section to DB as it completes (incremental save)
5. Emit SSE event per Section: `{ type: 'section', kind, content, sectionId }`
6. After all Sections written, invoke critic skill with full Document context
7. Stream critic comments as `{ type: 'comment', sectionId, content, evidence }`
8. Final event: `{ type: 'done', documentId }`

Disconnect handling: if client disconnects mid-stream, server completes the run and saves Document to DB. Document is marked `state: drafting_orphaned` if disconnected before critic finishes — operator can resume from Document view.

### Streaming Document view

Frontend `/ventures/[slug]/documents/[id]` (existing route) gains a streaming mode when the Document is in `state: drafting`.

Subscribe to SSE for that Document. Render Sections as they arrive:
- Empty Section placeholder appears immediately (typed shape with skeleton text)
- Content streams in token-by-token as available (text-typewriter effect at 30-50 tokens/sec)
- Section state pill (drafting → ready → critic_reviewing → resolved) visible per Section
- Critic comments appear as margin annotations after each Section completes review

User can interrupt mid-stream:
- "Pause" button stops the SSE on the client; server still completes (idempotent save)
- "Cancel" button calls `POST /api/loops/runs/[runId]/cancel` which kills the server-side run
- Cancelled Document state: `state: cancelled`, partial sections persisted

User can edit a Section after it streams in (does not interrupt other Sections being written). Edits write to DB, do not regenerate other Sections.

### Loop 1 conversation surface

New route `/ventures/[slug]/strategy` invokes Loop 1.

Layout:
- Top: Conversation thread, scrollable
- Bottom: Operator input (textarea + send button)
- Right rail: Watch (per-venture filter)

Message types in thread (visually distinct):
- Operator: right-aligned, plain text bubble, no avatar
- Agent: left-aligned, with the agent's name and role in mono ("strategy.draft"), in a card
- Critic: left-aligned indented, with critic's name in mono ("strategy.critic"), in a thinner card with a vertical accent bar
- Document precipitate: appears as a card with the streaming Document inline, expandable

Operator initiates: types a strategy question, hits send. Agent message starts streaming immediately. Document card appears in thread when agent decides to crystallize the conversation into a Decision Document. Critic engages on the Document, posts comments inline in the Document card. Operator approves/edits/rejects.

### buildAgentPrompt() extensions

Add streaming mode flag: `{ streaming: true | false }`. Default false (preserves existing call sites).

When streaming, the function returns a ReadableStream parser that:
- Emits typed events (section_start, section_token, section_end, comment_added, done)
- Handles Anthropic API rate-limit and transient error retries internally
- Single source of truth for Loop output structure

## Acceptance criteria

### Streaming Sections
- [ ] `POST /api/loops/[loopId]/invoke` returns text/event-stream
- [ ] Streamed Sections persist incrementally (verify by killing client mid-stream and refreshing — partial Document is in DB)
- [ ] SSE events include section_start, section_token (or batched section_chunk), section_end, comment_added, done
- [ ] Document view detects streaming state and subscribes to SSE
- [ ] Sections appear with skeleton placeholders, then content streams in
- [ ] Critic comments arrive after agent finishes, visibly anchored to specific Sections
- [ ] User can pause client SSE without affecting server run (server completes anyway)
- [ ] User can cancel server run (kills the run cleanly)
- [ ] User can edit a streamed Section after it completes without affecting other Sections

### Loop 1
- [ ] `/ventures/[slug]/strategy` invokes Loop 1
- [ ] Conversation thread renders agent, critic, operator messages with distinct styling
- [ ] Operator can type a question, hit send, and see agent response stream
- [ ] When agent crystallizes to a Document, Document card appears inline in thread
- [ ] Critic engages on the Document, comments appear anchored to Sections
- [ ] Operator can approve or reject the Document from inline view
- [ ] Conversation history persists; user can leave and return to the route and see prior threads

### Cross-cutting
- [ ] buildAgentPrompt({ streaming: true }) returns the typed event stream parser
- [ ] All existing non-streaming Loop call sites continue to work unchanged
- [ ] No console errors or unhandled promise rejections during a streaming run

## Definition of done

- All acceptance criteria checked with proof (recorded screen captures of streaming run committed to `.archive/screenshots/sprint-10/`)
- SSE connection has reconnect logic with exponential backoff (max 3 retries)
- Section rendering uses stable React keys — no flicker when content updates
- Agent and critic identity visually distinct — operator can identify who said what without reading labels
- Loop 1 produces a complete Decision Document on success
- Cancelled runs leave Document in `state: cancelled` (queryable but excluded from active counts)
- HANDOFF.md committed
- Test: invoke Loop 1 with a real strategy question, observe full streaming run end-to-end
- Test: invoke Loop 1, cancel mid-stream, verify partial Document persisted with state: cancelled

## Quality rubric (SoloDesk specific)

| Criterion | What to check |
|-----------|--------------|
| Bright line: every loop through buildAgentPrompt | New streaming endpoint MUST call buildAgentPrompt — no parallel prompt construction path |
| Bright line: typed Sections | Streamed output is parsed into typed Sections, not free text. Verify Section kind is one of the existing enum values |
| Bright line: comments anchored to Sections with evidence | Critic comments include a sectionId reference and an evidence pointer. Reject any path that emits a global comment |
| Incremental persistence | Killing client mid-stream leaves partial Document in DB. Verify with a hard SIGTERM on browser tab |
| Idempotent server run | Server run completes on disconnect. Re-invoking same Loop with same request hash returns existing run, doesn't double-fire |
| Streaming hygiene | No memory leak with 100 sequential streams. Verify with manual stress test |
| TypeScript | SSE event types are a discriminated union. No `any` in event handlers |
| Error surfacing | Anthropic API rate limit, network error, malformed Section all surface visibly to operator (not silent failure) |

**Score threshold:** Must pass 7/8. The three bright-line criteria are non-negotiable.

## Out of scope

- Voice input on the conversation thread
- Multi-user concurrent edit on a streaming Document
- Real-time collaboration cursors
- Streaming critic-of-critic (one critic pass only)
- Branching conversation threads in Loop 1
- Conversation export / share
- Conversation thread search

## Adversarial check questions

- What if the agent stalls mid-Section (Anthropic API hangs)? Visible spinner per Section, retry button after 30s
- What if the user navigates away mid-stream? Document saved as far as it got; state: drafting_orphaned. Returnable.
- What if the critic disagrees on every Section? Operator sees a pile of agent_notes; can resolve or reject each. No stuck state.
- What if the network drops mid-SSE? Client reconnects with exponential backoff, fetches missed events from a checkpoint endpoint
- What if the operator edits a Section while another Section is still streaming? Edit applies to that Section; other Sections continue. No conflict.
- What if Loop 1 produces no Document (just a conversation that doesn't crystallize)? Conversation thread persists; no Document created. Documented behavior.
- What if multiple operators (in same venture) hit Loop 1 simultaneously? Each gets their own conversation thread. No cross-pollination.
- Does the streaming endpoint enforce membership scoping? Yes — ventureId in URL must match operator's membership.
- Does the Watch reflect Loop 1 activity? Yes — events.invoked, events.section_streamed, etc. fire and surface in The Watch.

## Files affected

New files:
- `app/api/loops/[loopId]/invoke/route.ts` (SSE endpoint)
- `app/api/loops/runs/[runId]/cancel/route.ts`
- `app/api/loops/runs/[runId]/checkpoint/route.ts` (for SSE reconnect)
- `app/ventures/[slug]/strategy/page.tsx` (Loop 1 route)
- `lib/loops/streaming.ts` (server-side SSE wrapper)
- `lib/loops/parser.ts` (Anthropic stream → typed Section events)
- `lib/loops/runner.ts` (server run state + idempotency)
- `components/document/StreamingDocument.tsx`
- `components/document/StreamingSection.tsx`
- `components/loop1/ConversationThread.tsx`
- `components/loop1/MessageBubble.tsx`
- `components/loop1/DocumentInline.tsx`

Modified files:
- `lib/agent/buildAgentPrompt.ts` (add streaming mode)
- `app/ventures/[slug]/documents/[id]/page.tsx` (detect streaming state, subscribe to SSE)
- `supabase/migrations/0008_loop_runs.sql` (loop_runs table for idempotency + cancel state)

Tests:
- `lib/loops/parser.test.ts` (SSE parser handles partial chunks, malformed JSON, etc.)
- `lib/loops/streaming.test.ts` (idempotency, cancel, disconnect)
- `lib/agent/buildAgentPrompt.test.ts` (streaming mode preserves all existing behavior)

## Dependencies on prior work

- Sprints 7-9 complete
- Document/Section/Comment substrate in place (Sprint 1.1)
- buildAgentPrompt() exists (Sprint 0.5)
- Loop 1 stub exists (Sprint 3 substrate work)
- Anthropic API key and budget set in Vercel env

## Bright-line tension to resolve in this sprint

The "per-Section approval state machine" bright line currently means each Section requires individual operator click. With streaming, this stalls the operator every few seconds while the Document is still being written. Per `experience-layer-doc-updates.md`, the rule changes to:

> Document approval is a single click; Section-level state (resolved, agent_note open) is enforced at approval time. Operator can edit any Section pre-approval. Critic comments still anchor to Sections with evidence pointers.

Verify the doc edit lands before this sprint starts.

The "explicit-click send on all communication" bright line stays absolutely for external comms. For Loop 1 internal flow (agent → critic → operator), the agent-to-critic handoff does not require a click. Document the distinction in CLAUDE.md before this sprint.
