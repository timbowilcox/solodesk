import "server-only";

// runner.ts — server-side streaming Loop runner.
//
// Orchestrates a streaming agent invocation:
//   1. Create a Document (status='drafting')
//   2. Create a loop_runs row (status='running')
//   3. Call buildAgentPrompt() to compose the prompt
//   4. Open the Anthropic streaming SDK and feed tokens through the parser
//   5. As each Section closes, persist it to DB and emit an SSE event
//   6. On parser error / cancel / Anthropic error, mark the run terminal
//   7. On completion, set Document.status to 'reviewing'
//
// Cancellation: the runner polls loop_runs.cancel_requested_at every N
// section closures (or every N seconds). When set, it stops feeding the
// Anthropic stream into the parser and finalises the Document as
// 'cancelled'.
//
// Bright lines kept:
//   - buildAgentPrompt() is the single funnel — no parallel prompt path
//   - Sections written here are typed (parser enforces); output that
//     doesn't parse is rejected, not coerced
//   - Comments anchor to specific Sections with evidence pointers; the
//     parser rejects globals
//   - venture_id flows through; never null on streaming Loops

import Anthropic from "@anthropic-ai/sdk";

import { buildAgentPrompt } from "@/lib/agents/prompt";
import {
  DEFAULT_MODEL,
} from "@/lib/agents/anthropic";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createParserState,
  endParser,
  pushChunk,
  type ParserEvent,
  type ParserState,
} from "@/lib/loops/parser";
import type {
  DocumentType,
  Json,
  SectionKind,
} from "@/lib/supabase/types";

// ---- Public types ---------------------------------------------------

export type StreamRunnerOptions = {
  loopName: string;
  loopId: string; // route segment, e.g. '01-strategy'
  ventureId: string;
  documentType: DocumentType;
  documentTitle: string;
  systemSkillPrompt: string;
  task: string;
  budgetTokens: number;
  budgetCents: number;
  model?: string;
  /** Optional thread linkage for Loop 1 conversation persistence. */
  threadId?: string;
};

export type SseEvent =
  | { type: "run_started"; runId: string; documentId: string }
  | { type: "section_start"; documentId: string; ord: number; sectionKind: SectionKind }
  | { type: "section_token"; documentId: string; ord: number; text: string }
  | { type: "section_end"; documentId: string; ord: number; sectionId: string }
  | { type: "comment_added"; documentId: string; sectionRef: string; evidenceRef: string; body: string }
  | { type: "done"; documentId: string; runId: string; status: "succeeded" | "cancelled" | "drafting_orphaned" | "failed" }
  | { type: "error"; runId: string; reason: string };

export type SseEmitter = (event: SseEvent) => void;

export type RunnerHandle = {
  runId: string;
  documentId: string;
};

// ---- Public API -----------------------------------------------------

/**
 * Run the Loop end-to-end, emitting SSE events through the supplied
 * `emit` callback. Returns when the run terminates (success, cancel, or
 * error). The endpoint route handler is responsible for writing the
 * SseEvent payloads onto the response stream.
 *
 * Idempotency: each call creates a fresh loop_runs row + Document. If
 * the caller wants to dedupe, they pass an existing runId/documentId
 * via... [v1: not yet — every invoke is fresh]
 */
export async function runStreamingLoop(
  opts: StreamRunnerOptions,
  emit: SseEmitter,
): Promise<RunnerHandle> {
  const supabase = createSupabaseAdminClient();
  const startedAt = Date.now();
  const model = opts.model ?? DEFAULT_MODEL;

  // 1. Create the Document in 'drafting' state.
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({
      venture_id: opts.ventureId,
      type: opts.documentType,
      title: opts.documentTitle,
      loop_name: opts.loopName,
      status: "drafting",
      metadata: opts.threadId
        ? ({ thread_id: opts.threadId } as Json)
        : ({} as Json),
    })
    .select("id")
    .single();
  if (docError || !doc) {
    throw new Error(docError?.message ?? "document insert failed");
  }
  const documentId = doc.id;

  // 2. Create the loop_runs row.
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: opts.loopName,
      venture_id: opts.ventureId,
      trigger: "stream",
      input: {
        loop_id: opts.loopId,
        document_id: documentId,
        thread_id: opts.threadId ?? null,
        task_summary: opts.task.slice(0, 200),
      } as Json,
      status: "running",
      budget_tokens: opts.budgetTokens,
      budget_cents: opts.budgetCents,
      model,
    })
    .select("id")
    .single();
  if (runError || !runRow) {
    throw new Error(runError?.message ?? "loop_runs insert failed");
  }
  const runId = runRow.id;

  emit({ type: "run_started", runId, documentId });
  await insertEvent({
    ventureId: opts.ventureId,
    type: "loop.invoked",
    source: "streaming-runner",
    payload: { loop_name: opts.loopName, run_id: runId, document_id: documentId } as Json,
  });
  await insertEvent({
    ventureId: opts.ventureId,
    type: "document.created",
    source: "streaming-runner",
    payload: { document_id: documentId, type: opts.documentType } as Json,
  });

  // 3. Build the prompt.
  const prompt = await buildAgentPrompt({
    skill: opts.loopName,
    ventureId: opts.ventureId,
    task: opts.task,
    systemSkillPrompt: opts.systemSkillPrompt,
    budgetTokens: opts.budgetTokens,
  });

  // 4. Open Anthropic streaming SDK.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "REPLACE_ME") {
    await markRunFailed(runId, "ANTHROPIC_API_KEY is not configured");
    emit({ type: "error", runId, reason: "ANTHROPIC_API_KEY is not configured" });
    emit({ type: "done", documentId, runId, status: "failed" });
    return { runId, documentId };
  }
  const client = new Anthropic({ apiKey });

  const parserState = createParserState();
  let cancelled = false;
  let parserErrored = false;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: Math.min(8192, Math.max(1024, Math.floor(opts.budgetTokens * 0.6))),
      system: prompt.systemPrompt,
      messages: [{ role: "user", content: prompt.userMessage }],
    });

    for await (const chunk of stream) {
      if (cancelled || parserErrored) break;
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        const events = pushChunk(parserState, chunk.delta.text);
        const stopAfter = await drain({
          events,
          documentId,
          ventureId: opts.ventureId,
          parserState,
          emit,
          runId,
        });
        if (stopAfter === "parser_error") {
          parserErrored = true;
          break;
        }
        // Periodically poll cancel flag — once per delta is fine; cheap
        // single-row read.
        const stillCancelled = await checkCancelled(runId);
        if (stillCancelled) {
          cancelled = true;
          break;
        }
      }
    }

    if (!parserErrored && !cancelled) {
      // Flush the parser at end-of-stream.
      const tail = endParser(parserState);
      const stopAfter = await drain({
        events: tail,
        documentId,
        ventureId: opts.ventureId,
        parserState,
        emit,
        runId,
      });
      if (stopAfter === "parser_error") parserErrored = true;
    }

    const finalMessage = await stream.finalMessage();
    inputTokens = finalMessage.usage?.input_tokens ?? 0;
    outputTokens = finalMessage.usage?.output_tokens ?? 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : "anthropic stream failed";
    await markRunFailed(runId, message);
    await markDocumentStatus(documentId, "drafting_orphaned");
    emit({ type: "error", runId, reason: message });
    emit({ type: "done", documentId, runId, status: "drafting_orphaned" });
    return { runId, documentId };
  }

  // 5. Finalise.
  let finalDocStatus: "reviewing" | "cancelled" | "drafting_orphaned" = "reviewing";
  let finalRunStatus: "succeeded" | "cancelled" | "failed" = "succeeded";

  if (parserErrored) {
    finalDocStatus = "drafting_orphaned";
    finalRunStatus = "failed";
  } else if (cancelled) {
    finalDocStatus = "cancelled";
    finalRunStatus = "cancelled";
  } else {
    finalDocStatus = "reviewing";
    finalRunStatus = "succeeded";
  }
  await markDocumentStatus(documentId, finalDocStatus);
  await markRunTerminal(runId, finalRunStatus, {
    inputTokens,
    outputTokens,
    durationMs: Date.now() - startedAt,
  });
  await insertEvent({
    ventureId: opts.ventureId,
    type:
      finalRunStatus === "succeeded"
        ? "loop.succeeded"
        : finalRunStatus === "cancelled"
          ? "loop.cancelled"
          : "loop.failed",
    source: "streaming-runner",
    payload: { loop_name: opts.loopName, run_id: runId, document_id: documentId } as Json,
  });
  emit({
    type: "done",
    documentId,
    runId,
    status:
      finalRunStatus === "succeeded"
        ? "succeeded"
        : finalRunStatus === "cancelled"
          ? "cancelled"
          : finalDocStatus === "drafting_orphaned"
            ? "drafting_orphaned"
            : "failed",
  });
  return { runId, documentId };
}

/**
 * Cancel a running streaming Loop. Sets cancel_requested_at; the runner
 * polls this and stops feeding tokens. Idempotent — calling twice is a
 * no-op for the second call.
 */
export async function requestCancel(runId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("loop_runs")
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running")
    .is("cancel_requested_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---- Internals ------------------------------------------------------

async function drain(opts: {
  events: ParserEvent[];
  documentId: string;
  ventureId: string;
  parserState: ParserState;
  emit: SseEmitter;
  runId: string;
}): Promise<"continue" | "parser_error"> {
  // Buffer accumulators for in-flight Section bodies (so we can write
  // them to DB at section_end). Keyed by ord.
  const sectionBuffers = (opts.parserState as ParserState & {
    _buffers?: Map<number, { kind: SectionKind; body: string }>;
  });
  if (!sectionBuffers._buffers) {
    sectionBuffers._buffers = new Map();
  }
  const buffers = sectionBuffers._buffers;

  for (const ev of opts.events) {
    switch (ev.kind) {
      case "section_start": {
        buffers.set(ev.ord, { kind: ev.sectionKind, body: "" });
        opts.emit({
          type: "section_start",
          documentId: opts.documentId,
          ord: ev.ord,
          sectionKind: ev.sectionKind,
        });
        break;
      }
      case "section_token": {
        const buf = buffers.get(ev.ord);
        if (buf) buf.body += ev.text;
        opts.emit({
          type: "section_token",
          documentId: opts.documentId,
          ord: ev.ord,
          text: ev.text,
        });
        break;
      }
      case "section_end": {
        const buf = buffers.get(ev.ord);
        if (!buf) break;
        const sectionId = await persistSection({
          documentId: opts.documentId,
          ord: ev.ord,
          kind: buf.kind,
          body: buf.body.trimEnd(),
        });
        buffers.delete(ev.ord);
        await markRunProgress(opts.runId, ev.ord);
        opts.emit({
          type: "section_end",
          documentId: opts.documentId,
          ord: ev.ord,
          sectionId,
        });
        await insertEvent({
          ventureId: opts.ventureId,
          type: "document.section_streamed",
          source: "streaming-runner",
          payload: {
            document_id: opts.documentId,
            section_kind: buf.kind,
            section_id: sectionId,
          } as Json,
        });
        break;
      }
      case "comment_added": {
        await persistComment({
          documentId: opts.documentId,
          sectionRef: ev.sectionRef,
          evidenceRef: ev.evidenceRef,
          body: ev.body,
        });
        opts.emit({
          type: "comment_added",
          documentId: opts.documentId,
          sectionRef: ev.sectionRef,
          evidenceRef: ev.evidenceRef,
          body: ev.body,
        });
        await insertEvent({
          ventureId: opts.ventureId,
          type: "agent_note.opened",
          source: "streaming-runner",
          payload: {
            document_id: opts.documentId,
            section_kind: ev.sectionRef,
          } as Json,
        });
        break;
      }
      case "done":
        // Parser saw ###done. Real terminal handling happens in caller
        // after stream finalisation.
        break;
      case "parser_error":
        opts.emit({
          type: "error",
          runId: opts.runId,
          reason: `parser: ${ev.reason} (near: '${ev.nearLine.slice(0, 80)}')`,
        });
        return "parser_error";
    }
  }
  return "continue";
}

async function persistSection(opts: {
  documentId: string;
  ord: number;
  kind: SectionKind;
  body: string;
}): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const content: Json = sectionContentForKind(opts.kind, opts.body);
  const { data, error } = await supabase
    .from("sections")
    .insert({
      document_id: opts.documentId,
      kind: opts.kind,
      ord: opts.ord,
      content,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "section insert failed");
  }
  return data.id;
}

function sectionContentForKind(kind: SectionKind, body: string): Json {
  // For Sprint 10, all kinds boil down to { text } in the streamed
  // protocol. Richer shapes (metric_block, intel_signals_table) are
  // reserved for the JSON-table protocols a future Loop will emit.
  const base: Record<string, unknown> = { text: body };
  if (kind === "agent_note") {
    base.question = body;
    base.decision = "";
  }
  if (kind === "risk") {
    base.severity = "low";
  }
  return base as Json;
}

async function persistComment(opts: {
  documentId: string;
  sectionRef: string;
  evidenceRef: string;
  body: string;
}): Promise<void> {
  // Find the Section by kind within this Document. The protocol allows
  // section=<kind> as a soft anchor; for v1 we resolve to the Section
  // with the matching kind. If multiple, anchor to the latest.
  const supabase = createSupabaseAdminClient();
  const { data: sections } = await supabase
    .from("sections")
    .select("id, kind, ord")
    .eq("document_id", opts.documentId)
    .order("ord", { ascending: false });
  if (!sections) return;
  const target = sections.find((s) => s.kind === opts.sectionRef);
  if (!target) {
    // No matching Section yet — drop. (The agent's prompt should never
    // emit a comment before its target Section closes.)
    return;
  }
  await supabase.from("comments").insert({
    section_id: target.id,
    author: "agent:critic",
    body: opts.body,
    evidence: [
      {
        kind: "agent_note",
        ref: opts.evidenceRef,
        label: opts.evidenceRef,
      },
    ] as Json,
  });
}

async function checkCancelled(runId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("loop_runs")
    .select("cancel_requested_at")
    .eq("id", runId)
    .maybeSingle();
  return !!data?.cancel_requested_at;
}

async function markRunProgress(runId: string, ord: number): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("loop_runs")
    .update({ last_section_ord: ord })
    .eq("id", runId);
}

async function markRunTerminal(
  runId: string,
  status: "succeeded" | "cancelled" | "failed",
  metrics: { inputTokens: number; outputTokens: number; durationMs: number },
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("loop_runs")
    .update({
      status,
      tokens_in: metrics.inputTokens,
      tokens_out: metrics.outputTokens,
      duration_ms: metrics.durationMs,
    })
    .eq("id", runId);
}

async function markRunFailed(runId: string, error: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("loop_runs")
    .update({ status: "failed", error_message: error })
    .eq("id", runId);
}

async function markDocumentStatus(
  documentId: string,
  status: "reviewing" | "cancelled" | "drafting_orphaned",
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("documents")
    .update({ status })
    .eq("id", documentId);
}

async function insertEvent(opts: {
  ventureId: string;
  type: string;
  source: string;
  payload: Json;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.from("events").insert({
    venture_id: opts.ventureId,
    source: opts.source,
    type: opts.type,
    payload: opts.payload,
  });
}
