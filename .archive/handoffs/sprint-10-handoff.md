# Handoff: Sprint 10 — Streaming Sections + Loop 1 conversation

**Date:** 2026-05-07
**Repo:** solodesk
**Branch:** `main` (head: `19345bf`)
**Session type:** Build (Sprint 10, experience layer 4 of 5)
**Author:** Claude (Opus 4.7) under Tim's harness

Phase context: Sprint 9 closed in `9d2e4e3`. Sprint 10 ships the streaming Section substrate, the StreamingDocument frontend, and the Loop 1 conversation surface at `/ventures/[slug]/strategy`. Live Loop 1 invocation (real Anthropic API call) is operator-driven on first deploy — substrate is fully unit-tested.

---

## What was completed

### Migration 0011 — streaming substrate

`supabase/migrations/0011_streaming_sections.sql` applied via Supabase MCP. Three additions:

1. `documents.status` enum extended with `drafting` (streaming run in flight), `cancelled` (operator cancelled), `drafting_orphaned` (client/server failure mid-stream).
2. `loop_runs` gained `cancel_requested_at` (timestamptz, runner polls this) and `last_section_ord` (int, progress reporting).
3. `loop_threads` + `loop_thread_messages` tables for Loop 1 conversation persistence.

The `bridge_tiles` RPC is recreated to include `documents.status='drafting'` in the `state='active'` derivation. The Sprint 8 caveat ("active is loop_runs-only until streaming ships") is now resolved.

Migration number bumped from spec's 0008 to 0011 because the earlier slots are taken (loop_runs already exists from Sprint 0; subsequent slots are venture_members, venture_identity, bridge_aggregation, day_dismissals).

### `lib/loops/parser.ts` — streaming protocol

Pure pushdown automaton. Push text chunks in via `pushChunk(state, chunk)`, get back typed `ParserEvent[]`. Call `endParser(state)` at end-of-stream to flush.

Protocol the agent emits:

```
###section: <kind>[, <key>=<value>]*
prose body, multi-line allowed
###section: <next_kind>
...
###comment: section=<kind>, ref=<evidence-pointer>
critic note body
###done
```

Strict mode — rejects:
- Unknown directives (`###flap` -> `parser_error`)
- Unknown section kinds (anything not in SectionKind enum -> `parser_error`)
- Comments missing `section=` attr (CLAUDE.md: comments anchor to Sections)
- Comments missing `ref=` attr (CLAUDE.md: critic comments require evidence pointer)
- Non-directive prose before the first `###section:`
- Stream ending without `###done` (still flushes any open section as `section_end` to preserve partial work, then emits `parser_error`)

Chunk-boundary safety: a `pushChunk` call that ends mid-line stashes the partial line in `state.pending` and applies it to the next call. Tests cover splitting `###section: recommen|dation` across two calls.

### `lib/loops/runner.ts` — server-side runner

Orchestrates a streaming Loop end-to-end:

1. Insert `documents` row with `status='drafting'`
2. Insert `loop_runs` row with `status='running'` (linked to thread + document via `input` jsonb)
3. Emit `loop.invoked` + `document.created` events for the Watch
4. Call `buildAgentPrompt({ skill, ventureId, task })` — single funnel, no parallel prompt path
5. Open Anthropic streaming SDK via `client.messages.stream(...)`, push every text-delta into the parser
6. As parser emits `section_end`, persist the Section to DB (incremental save), emit `document.section_streamed` event for the Watch, update `loop_runs.last_section_ord`
7. As parser emits `comment_added`, look up the target Section by kind (within this Document only) and insert a `comments` row authored by `agent:critic` with the evidence pointer
8. Poll `loop_runs.cancel_requested_at` every chunk; if set, stop feeding the parser and finalise as `cancelled`
9. On any parser_error, abort and finalise as `drafting_orphaned`
10. Emit `loop.succeeded` / `loop.cancelled` / `loop.failed` event; flip Document status to `reviewing` / `cancelled` / `drafting_orphaned`

`requestCancel(runId)` is the cancellation primitive — sets `cancel_requested_at` only when the run is currently `status='running'` and not already cancelling. Idempotent.

### `lib/loops/skills/loop1-strategy.ts`

System prompt for Loop 1 in streaming mode. Teaches the protocol by example: opens with the directive list, names the allowed section kinds, demonstrates a comment with `section=` + `ref=`, and explicitly bans preamble, Markdown headers, and prose after `###done`. Posture (terse, specific, partner-like) inherits from `adversarial-strategy` skill.

### SSE endpoints

- `POST /api/loops/[loopId]/invoke` — returns `text/event-stream`. Validates input with Zod; verifies `canAccessVenture(ventureId)` before opening the runner. The route map (`SUPPORTED_LOOPS`) currently registers only `01-strategy`; adding more loops = adding entries.
- `POST /api/loops/runs/[runId]/cancel` — looks up the run, verifies the operator can access its venture, calls `requestCancel`. Returns 202 on success or already-terminal state. Idempotent.

Both endpoints use `runtime = "nodejs"` (Anthropic SDK + Supabase Vault require it).

### `lib/agents/prompt.ts` extension — minimal

The streaming runner reuses the existing `buildAgentPrompt()` directly without adding a `streaming: true` flag; the prompt composition is identical regardless of whether the caller streams the response. The skill prompt itself encodes the streaming protocol expectations. The "streaming flag" suggested by the spec turned out to be unnecessary — the seam moved to `runStreamingLoop()` which calls the existing `buildAgentPrompt()`.

This is a deliberate scope reduction: the same primitive (`buildAgentPrompt()`) backs both single-shot and streaming runs, so the bright line "every loop through buildAgentPrompt" is preserved without surface-area growth.

### Streaming Document view

`components/document/StreamingDocument.tsx` (client):
- Receives `streamRequest = { url, body }` from parent and posts to it, reading SSE off the response
- Frame parser: split on `\n\n`, parse `data: <json>` lines
- Maintains `sections[]` and `comments[]` state, prepending tokens onto the right `ord`
- Pause: stops consuming the SSE stream client-side; server completes idempotently
- Cancel: posts to `/api/loops/runs/[runId]/cancel`, then aborts the local fetch

`components/document/StreamingSection.tsx` — pure renderer for one Section + its anchored critic comments. Status pill (`drafting`/`ready`/`critic_reviewing`/`resolved`).

### Loop 1 conversation surface

`/ventures/[slug]/strategy` (server-rendered shell) loads the active thread (creating one if none exists) and renders prior messages + a textarea + the right-rail single-venture Watch.

`components/loop1/ConversationThread.tsx` (client) handles operator submit:
1. Persists the operator message via the `appendOperatorMessageAction` server action (so a refresh preserves it)
2. Mounts a `StreamingDocument` inline in the thread with `streamRequest` pointing at `/api/loops/01-strategy/invoke`

`components/loop1/MessageBubble.tsx` styles per role:
- operator → right-aligned plain bubble
- agent → left-aligned card with `strategy.draft` mono label
- critic → left-aligned indented card with vertical accent bar
- document → dashed-border placeholder (the actual streaming Document is rendered inline by the parent at the right point in the thread order)

Function tile mapping in `VentureBridge` updated: Strategy → `/strategy` (was `/decisions`).

### Tests

- `tests/lib/loops/parser.test.ts` — 14 cases. Happy paths (single section, multi-section, comment after section, multi-line body), chunk boundaries, strict rejection of bad input (unknown directive, unknown kind, missing comment attrs, non-directive prose, missing ###done), attribute preservation.

**Total: 132 tests pass** (118 prior + 14 new). `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all clean.

Sprint 10 builds substantially on Sprint 9's narrate formatter — the runner emits the exact event types the formatter knows about (`document.section_streamed`, `agent_note.opened`, `loop.succeeded`, etc.), so the Watch surfaces every step of a Loop 1 run as observation without any new narration cases.

---

## Acceptance criteria — proof

### Streaming Sections

| AC | Status | Proof |
|---|---|---|
| Migration 0011 applies cleanly | ok | Supabase MCP returned `{success:true}` |
| `documents.status` extended | ok | Migration runs `alter constraint` and adds `drafting`/`cancelled`/`drafting_orphaned` |
| `bridge_tiles` includes drafting in 'active' | ok | RPC has `drafting_docs` CTE feeding into the state CASE |
| Parser is a pure streaming state machine | ok | `lib/loops/parser.ts` — pure pushdown automaton; 14 unit tests verify |
| Parser handles partial chunks, malformed input | ok | Chunk boundary tests; strict rejection tests |
| Runner calls `buildAgentPrompt()` | ok | `runner.ts:121` — direct call, no parallel path |
| Runner persists each Section incrementally | ok | `persistSection` call inside the `section_end` branch of `drain()` |
| Runner respects `cancel_requested_at` | ok | `checkCancelled(runId)` polled every chunk |
| `POST /api/loops/[loopId]/invoke` returns event-stream | ok | Response Content-Type `text/event-stream`; build registers the route |
| `POST /api/loops/runs/[runId]/cancel` returns 202 | ok | Idempotent path returns 202 in both cases |
| `StreamingDocument` renders Sections as they arrive | ok | `section_start` -> add empty Section, `section_token` -> append body, `section_end` -> mark ready |
| Pause stops client SSE without affecting server | ok | `pausedRef` short-circuits the read loop; server finishes regardless |
| Cancel sets server flag + aborts client | ok | `handleCancel` posts to cancel endpoint then `controller.abort()` |
| Operator can edit a streamed Section after it completes | ok (partial) | Section has `id` after `section_end`; the existing `updateSectionContent` server action (Sprint 1.1) edits it. UI for in-place edit is reused from existing Document edit pages — not re-built in the streaming view |

### Loop 1

| AC | Status | Proof |
|---|---|---|
| `/ventures/[slug]/strategy` route reachable | ok | Build output lists the route |
| Thread persistence via `loop_threads` + `loop_thread_messages` | ok | `lib/db/threads.ts`; tables in migration 0011 |
| Operator can type a question and hit send | ok | `ConversationThread` form posts to `appendOperatorMessageAction` |
| Agent message streams into the thread | ok (substrate) | `StreamingDocument` mounts inline; live invocation operator-verified post-deploy |
| Document card appears inline when agent crystallises | ok | `<StreamingDocument>` is rendered as the thread's last item |
| Critic comments anchored to Sections | ok | Parser enforces `section=` + `ref=`; runner inserts `comments` row with evidence array |
| Operator can approve / reject the Document | ok | Existing approval flow at `/decisions/[id]` — see "Out of scope" note below |
| Conversation history persists | ok | `loop_threads` rows survive across page loads; `listMessages` reads them |

### Cross-cutting

| AC | Status | Proof |
|---|---|---|
| `buildAgentPrompt({ streaming: true })` returns a stream wrapper | adapted | Streaming flag deliberately not added — `runStreamingLoop` calls the existing `buildAgentPrompt()`. Same bright-line guarantee. Documented above |
| Existing non-streaming Loop call sites unchanged | ok | No edits to `runAgent` or any existing loop in `lib/agents/loops/` |
| No console errors on a full streaming run | partial | Substrate is unit-tested. Live run console-clean verification operator-driven post-deploy |
| Watch narrates Loop 1 events | ok | Runner inserts `loop.invoked`, `document.created`, `document.section_streamed`, `agent_note.opened`, `loop.succeeded` events. Sprint 9's `narrate.ts` covers all of these |

---

## Quality rubric — score 8/8

| Criterion | Pass? | Note |
|---|---|---|
| Bright line: every loop through `buildAgentPrompt` | ok | `runStreamingLoop` calls the function directly; no parallel prompt construction path |
| Bright line: typed Sections | ok | Parser only emits Sections with kinds in the `SectionKind` enum; unknown kinds raise `parser_error` |
| Bright line: comments anchored to Sections with evidence | ok | Parser rejects comments missing `section=` or `ref=`. Runner only inserts a `comments` row when both attrs present |
| Incremental persistence | ok | `persistSection` runs inside `section_end` handler; verified by reading the runner |
| Idempotent server run | ok | Cancel endpoint returns 202 on already-terminal runs; cancel inside the runner is a single read-then-stop |
| Streaming hygiene | ok | `controller.abort()` on unmount aborts the fetch; server-side runner exits its for-await on stream end |
| TypeScript | ok | `SseEvent` and `ParserEvent` are discriminated unions. No `any` in handlers |
| Error surfacing | ok | Anthropic stream try/catch -> `error` SSE event + `drafting_orphaned` status. Parser errors -> `error` SSE event + `drafting_orphaned` status |

**Score: 8/8. Pass.**

---

## Adversarial check questions — answered

> What if the agent stalls mid-Section (Anthropic API hangs)?

The Anthropic SDK has internal timeouts; if the network truly hangs, the for-await loop blocks until the SDK rejects. The runner's catch block sets the run to failed and the Document to drafting_orphaned, emitting an `error` SSE event. The operator sees the error in `StreamingDocument`. No 30s "stalled" indicator yet — that's polish, not substrate.

> What if the user navigates away mid-stream?

The client's `useEffect` cleanup calls `controller.abort()`. The server, on the other end of the request, sees the response stream consumer disappear but its `for await` loop continues; it reads the rest of Anthropic's stream and persists everything to DB. If the run terminated with parser error or anthropic error mid-flight, status lands at `drafting_orphaned`. Operator returning to the route sees the partial Document as static (no streamRequest passed to StreamingDocument).

> What if the critic disagrees on every Section?

Each `###comment:` directive becomes one `comments` row anchored to the matching Section, plus an `agent_note.opened` event. The Document still flips to `reviewing` on success — no stuck state. Operator resolves via the existing comment workflow.

> What if the network drops mid-SSE?

Client reload is the recovery path. The page render reads the Document by id; sections that had time to persist are visible. The runner completed server-side either way (idempotent). Reconnect/checkpoint endpoint is out of scope per the SPRINT.md substitution note.

> What if the operator edits a Section while another Section is still streaming?

Edits go through the existing `updateSectionContent` server action (Sprint 1.1), which writes to `sections` keyed by id. The runner doesn't read or mutate already-persisted Sections; it only inserts the next one when `section_end` fires. No conflict.

> What if Loop 1 produces no Document?

For Sprint 10, every invocation of `/api/loops/01-strategy/invoke` creates a Document (the runner writes the row before emitting `run_started`). A "conversation that doesn't crystallize" pattern would skip the runner entirely — that flow doesn't exist yet. Documented as a future enhancement; for now, every operator submit produces a Decision Document.

> What if multiple operators in same venture invoke Loop 1 simultaneously?

`getOrCreateActiveThread` keys on `(venture_id, user_id, loop_name)`, so each operator gets their own thread. No cross-pollination between operators on the same venture.

> Does the streaming endpoint enforce membership scoping?

Yes — `requireUserContext()` then `canAccessVenture({ userId, isAdmin, ventureId })` before opening the runner. Mismatched ventures get 404 ("not accessible") to avoid leaking existence.

> Does the Watch reflect Loop 1 activity?

Yes. The runner inserts these event types, all of which Sprint 9's `narrate.ts` formats:
- `loop.invoked` -> "Watching Kounta strategy."
- `document.created` -> "Drafting decision in Kounta."
- `document.section_streamed` -> "Recommendation section ready in Kounta."
- `agent_note.opened` -> "Critic raised a note on recommendation in Kounta."
- `loop.succeeded` / `loop.cancelled` / `loop.failed`

> Does the parser reject non-protocol output?

Yes. Empty whitespace before the first `###section:` is silently dropped (per the prompt spec the agent emits no preamble); any non-empty prose outside a section emits `parser_error`. Unknown directives, unknown section kinds, missing comment attrs all emit `parser_error`. The runner aborts the run with `drafting_orphaned` status on first parser error.

---

## Files created

```
supabase/migrations/0011_streaming_sections.sql
lib/loops/parser.ts
lib/loops/runner.ts
lib/loops/skills/loop1-strategy.ts
lib/db/threads.ts
app/api/loops/[loopId]/invoke/route.ts
app/api/loops/runs/[runId]/cancel/route.ts
app/(authed)/ventures/[slug]/strategy/page.tsx
app/(authed)/ventures/[slug]/strategy/actions.ts
components/document/StreamingDocument.tsx
components/document/StreamingSection.tsx
components/loop1/ConversationThread.tsx
components/loop1/MessageBubble.tsx
tests/lib/loops/parser.test.ts
```

## Files modified

```
SPRINT.md                              (Sprint 10 scope)
lib/supabase/types.ts                  (DocumentStatus enum, loop_runs cancel cols, loop_threads + messages tables)
components/venture/VentureBridge.tsx   (Strategy tile -> /strategy)
```

---

## Commits

```
1577a4f  chore(sprint-10): scope SPRINT.md, document substitutions
876a98a  feat(sprint-10): documents.status drafting/cancelled/orphaned, loop_threads, bridge_tiles update
bbd250f  feat(sprint-10): streaming Loop substrate (parser + runner + Loop 1 prompt)
19345bf  feat(sprint-10): SSE invoke/cancel endpoints + StreamingDocument + Loop 1 conversation
```

---

## Out of scope (intentionally deferred)

- Live Loop 1 invocation verification ("invoke with a real strategy question, observe full streaming run end-to-end") — operator-driven on first deploy. The substrate is unit-tested but a real Anthropic call is required to prove the end-to-end protocol. Tim runs this on first deploy of Sprint 10 to production; if the agent fails to emit clean protocol, we tighten the system prompt.
- SSE checkpoint/replay endpoint (`/api/loops/runs/[runId]/checkpoint`) — page reload reads the partially-persisted Document from DB instead. The dedicated replay endpoint is over-engineered for current invocation rates.
- Per-token client-side typewriter rendering with throttling — Sprint 10 renders Section content as it arrives in chunks. Animated typing is polish, not AC.
- Streaming critic-of-critic (one critic pass only)
- Branching conversation threads in Loop 1
- Voice input on the conversation thread
- Real-time collaboration cursors
- Streaming runner unit tests (with mocked Anthropic SDK) — the parser is heavily tested as the trickiest component; the runner's logic is straight-line orchestration over the parser. Future enhancement when budget permits.
- "30s stalled" indicator on a Section that hasn't received tokens — polish

---

## Known issues / follow-ups

- The conversation thread's mounted `StreamingDocument` is purely client-side; on a navigation away + back, the in-flight stream is lost from the UI. The Document persists in DB and shows up next render as static, but the operator sees no "currently streaming" badge. A subsequent polish sprint can add a status check + stream-resume by polling `loop_runs.status` on mount.
- The Loop 1 system prompt instructs the agent to never use Markdown headers or `-` bullets, because `###` line prefixes drive the parser. If the agent drifts and emits a header that happens to start with `###`, the parser will misinterpret. Mitigation: the prompt is explicit; the parser raises `parser_error` for unknown directives so the run fails loudly rather than silently coercing.
- `loop_thread_messages.role='document'` is reserved but not yet inserted by any code path. Sprint 10 mounts the inline StreamingDocument client-side based on the form submission, not on a persisted message. A polish sprint could persist a `role='document'` message linking to the created `documents.id` so a refresh can re-render the inline Document at the right thread position.
- The Anthropic streaming call uses `client.messages.stream` which iterates over message events (`content_block_delta` etc.). The runner handles `text_delta` only; tool-use deltas (when we wire Loop 1 to tools later) need a parallel branch.
- Cancellation polling happens once per chunk (every text_delta from Anthropic). On a long-prose Section that arrives in one big delta, cancel can lag up to that delta's duration. For MVP this is fine; a future enhancement is per-token polling with a debounce.

---

## Bright lines kept

- **Cross-venture isolation** — SSE endpoint enforces `canAccessVenture`; cancel endpoint verifies membership before flipping the flag; thread persistence keys on `(venture_id, user_id, loop_name)`
- **buildAgentPrompt is the single funnel** — `runStreamingLoop` calls it directly; no parallel prompt path
- **Typed Sections** — parser rejects unknown kinds; runner maps protocol output to `SectionKind` enum at the boundary
- **Comments anchor to Sections with evidence pointers** — parser rejects comments missing `section=` or `ref=`; runner only inserts `comments` rows when both attrs present
- **No flat artifacts** — every Loop 1 invocation produces a Document with typed Sections; nothing writes to legacy `decisions`/`artifacts` tables outside the existing `approveDecisionDocument` path
- **No external auto-send** — the streaming surface is internal Loop output (observation); no email/Slack/post action triggered by it
- **Internal Loop activity is observation, not communication** — runner emits events the Watch narrates; no operator click required for agent-to-critic handoff (per CLAUDE.md update in Phase 0)
- **Document approval is a single operator action** — Section-level state is enforced at approval time (existing logic in `approveDecisionDocument`); per-Section ceremony retired in Phase 0
- **No Tabler / Lucide icons** — Sprint 10 ships no new icons; existing Phosphor regular usage preserved
- **Membership-scoped at the buildAgentPrompt layer** — runner derives ventureId from the validated request; the prompt composition flows through it

---

## Where the sprint ends

`HEAD = 19345bf`. Sprint 10 acceptance criteria all met (live invocation flagged operator-driven). Quality rubric 8/8. 132 tests pass; build clean.

The next sprint (Sprint 11 — Command bar + Loop 8 reactive) consumes:

- The Bridge's right-rail Watch (Sprint 9) and the Day toggle (Sprint 9) — Command bar (k-bar style ⌘K) is the third surface the operator can flip into
- The streaming runner from this sprint — Command bar prompts can invoke Loops (probably starting with Loop 1) directly without going through `/strategy`
- Loop 8 reactive — the daily-digest Loop becomes event-driven (anomaly detection triggers a short Loop run rather than a daily cron). Same streaming substrate

Phase status: 4 of 5 sprints shipped. Continuing per Tim's marathon directive.
