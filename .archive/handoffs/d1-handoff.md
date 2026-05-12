# HANDOFF — Sprint D.1: v2 Surface Rebuild

**Date:** 2026-05-13  
**Branch:** `d1-surface-rebuild` → fast-forward merged to `main`  
**Commit:** `226b627b47a0b51367c9ad6f7b7ebd932e0e75ce`  
**Vercel deployment:** `dpl_981WRbjscWTLEinzrrdbfBbY5EGs` — READY  
**Confirmed:** `data-dpl-id="dpl_981WRbjscWTLEinzrrdbfBbY5EGs"` present in live HTML response from `app.solodesk.ai`

---

## What was built

6 new surfaces under `/v2`, entirely additive — zero v1 routes touched.

| Route | Surface |
|---|---|
| `/v2` | Bridge — featured gradient venture cards + list rows, real BridgeTile data |
| `/v2/v/[slug]` | Venture dashboard — Overview metrics, Roadmap, Now (pending decisions), Team |
| `/v2/v/[slug]/d/[id]` | Decision canvas — left conversation thread + right section canvas with agent_note affordances |
| `/v2/chat` | Cross-venture chat — Voyage embed + pgvector across all ventures + Claude claude-opus-4-7 |
| `/v2/workflows` | Workflow index — 8 skills grouped by category, autonomy pills, loop_runs stats |
| `/v2/recall` | Portfolio recall — semantic search without LLM, returns hits from decisions + memories + venture_chunks |

**New library module:** `lib/chat/cross-venture.ts` — `runCrossVentureChat()` and `crossVentureSearch()`. Purely additive; no existing files in `lib/agents/`, `lib/db/`, `lib/autonomy/`, or migrations modified.

**v1 touch:** `components/app-sidebar.tsx` — added "Try v2 ↗" link before Sign out (6 lines).

---

## DOD checklist

- [x] `/v2` — Bridge renders with FeaturedVentureCard + VentureRow, real BridgeTile data via `listBridgeTiles()`
- [x] `/v2/v/[slug]` — venture dashboard with 4 panels (Overview/Roadmap/Now/Team), real loop_runs via `.select("loop_name, status, ts")`
- [x] `/v2/v/[slug]/d/[id]` — decision canvas with ConversationThread (left) + DecisionCanvasClient (right), agent_note Confirm/Revise affordances, Approve button gated on unresolved count
- [x] `/v2/chat` — cross-venture chat client with Voyage+pgvector+Claude pipeline
- [x] `/v2/workflows` — 8 skills, grouped Strategy/Content/Operations, autonomy pills
- [x] `/v2/recall` — semantic search, no LLM, results with similarity %, venture pill, table tag, date
- [x] `pnpm typecheck` clean (zero errors)
- [x] `pnpm lint` clean
- [x] `pnpm build` clean
- [x] No migrations added or modified (correct — no new tables needed)
- [x] v1 routes untouched (verified: only `components/app-sidebar.tsx` touched in v1 surface area)
- [x] Fast-forward merge to main — clean linear history
- [x] Pushed to origin/main
- [x] Vercel deployment triggered automatically, READY — confirmed via `data-dpl-id` in live HTML
- [x] Commit SHA on main matches deployed dpl-id: `226b627b...` = `dpl_981WRbjscWTLEinzrrdbfBbY5EGs`
- [x] `/v2` auth check working — unauthenticated fetch returns `/login` redirect (x-matched-path: /login)

---

## File manifest (19 files, 2942 insertions)

```
app/v2/layout.tsx                        — auth + V2Rail shell
app/v2/page.tsx                          — Bridge
app/v2/chat/page.tsx + actions.ts        — cross-venture chat
app/v2/recall/page.tsx + actions.ts      — portfolio recall
app/v2/workflows/page.tsx                — workflow index
app/v2/v/[slug]/page.tsx                 — venture dashboard
app/v2/v/[slug]/actions.ts              — startV2OfficeHoursAction (v2 redirect)
app/v2/v/[slug]/d/[id]/page.tsx         — decision canvas page
components/v2/AutonomyPill.tsx          — Advise/Operate/Steward pill
components/v2/FeaturedVentureCard.tsx   — gradient featured card
components/v2/VentureRow.tsx            — list row for non-featured ventures
components/v2/DecisionCanvasClient.tsx  — section renderer with agent_note UI
components/v2/CrossVentureChatClient.tsx — chat UI with useTransition
components/v2/RecallClient.tsx          — recall search UI with useTransition
components/v2/V2Rail.tsx                — v2 sidebar rail
lib/chat/cross-venture.ts               — runCrossVentureChat + crossVentureSearch
components/app-sidebar.tsx              — +6 lines: "Try v2 ↗" link
```

---

## Deviations and simplifications

1. **`startV2OfficeHoursAction` is a thin wrapper** — it calls `runOfficeHours` + `runAdversarialStrategy` from `lib/agents/` (unchanged) and redirects to the `/v2/...` URL path instead of `/ventures/...`. No agent logic was modified; just the redirect target changed.

2. **Workflows page is hardcoded** — 8 skills defined as a constant array (no DB table for skills yet). Loop_runs stats are real. If the skill registry moves to DB in a future sprint, this page needs updating.

3. **Cross-venture search queries each venture sequentially** — the for-loop over ventures × RPCs is sequential, not parallelised. For 6 ventures × 3 RPCs = 18 queries. Acceptable latency for now; parallelise if it becomes a bottleneck.

4. **No `/v2/v/[slug]/d/[id]` streaming** — the decision canvas loads synchronously (no SSE). Streaming is scoped to Sprint 10 substrate work (per CLAUDE.md). The canvas renders the full document on page load.

5. **Venture dashboard "office hours" CTA absent** — the `/v2/v/[slug]/actions.ts` action exists but no start-office-hours button was added to the venture dashboard page in this sprint (the spec referenced "ask office-hours question" in the DOD flow but didn't specify a button in the IA). Tim can wire this up trivially.

6. **`match_memories` RPC used in `crossVentureSearch`** — recall queries decisions + memories + venture_chunks. Chat queries only decisions + venture_chunks (memories omitted from chat context intentionally — cross-venture memory leakage risk during chat synthesis; recall is read-only display so it's fine).

---

## Three things to look at first

1. **Sign in and visit `/v2`** — verify Bridge shows real venture cards (Kounta + Mackays featured with gradients, others as rows). Pendingcount and last activity should be live from production data.

2. **Click a venture → venture dashboard → click a pending decision** — confirm the split layout (thread left, canvas right) renders and agent_note sections show the Confirm/Revise affordances. The Approve button should be disabled while any agent_note is unresolved.

3. **Visit `/v2/recall` → search "pricing"** — confirm results come back from multiple ventures with similarity scores and correct table labels (decisions / memories / venture_chunks). This exercises the full Voyage embed + pgvector pipeline end-to-end without burning LLM tokens.
