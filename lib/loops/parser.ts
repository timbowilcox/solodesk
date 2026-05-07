// parser.ts — streaming state machine that turns Loop output text into
// typed Section / Comment events.
//
// The Loop's system prompt instructs the agent to emit a line-prefixed
// protocol:
//
//   ###section: <section_kind>[, <key>=<value>]*
//   ...prose body, may span multiple lines and include any text...
//   ###section: <next_kind>
//   ...
//   ###comment: section=<kind>, ref=<evidence-pointer>
//   ...comment body...
//   ###done
//
// Recognised section kinds match the SectionKind enum in lib/supabase/types.ts.
// Recognised comment kinds: 'section' (anchor by section kind/ord), 'ref'
// (evidence pointer), additional kvs go to metadata.
//
// CLAUDE.md bright line: "Loop output that does not parse into typed
// Sections is rejected, not coerced." The parser MUST NOT silently
// recover from malformed input. Unrecognised directives emit a 'parser_error'
// event; the runner aborts the run on parser_error.
//
// This module is a pure pushdown automaton. No DB, no React. Used both
// server-side (runner) and indirectly client-side (operator could replay
// a saved transcript to debug).

import type { SectionKind } from "@/lib/supabase/types";

const KNOWN_SECTION_KINDS: ReadonlySet<SectionKind> = new Set<SectionKind>([
  "prose",
  "recommendation",
  "alternatives",
  "kill_criteria",
  "evidence",
  "risk",
  "agent_note",
  "comment_thread",
  "metric_block",
  "intel_signal",
  "intel_signals_table",
  "support_reply_block",
  "content_block",
]);

// ---- Event types ----------------------------------------------------

export type ParserEvent =
  | { kind: "section_start"; ord: number; sectionKind: SectionKind; attrs: Record<string, string> }
  | { kind: "section_token"; ord: number; text: string }
  | { kind: "section_end"; ord: number }
  | { kind: "comment_added"; sectionRef: string; evidenceRef: string; body: string; attrs: Record<string, string> }
  | { kind: "done" }
  | { kind: "parser_error"; reason: string; nearLine: string };

export type ParserState = {
  // What the parser is currently consuming.
  mode: "preamble" | "in_section" | "in_comment" | "done";
  // Current section ord (incremented for each opened section).
  sectionOrd: number;
  // Active section accumulator.
  currentSectionKind: SectionKind | null;
  currentSectionAttrs: Record<string, string>;
  // Active comment accumulator.
  currentCommentSectionRef: string | null;
  currentCommentEvidenceRef: string | null;
  currentCommentAttrs: Record<string, string>;
  currentCommentBody: string;
  // A small buffer for unfinished trailing text (no newline yet).
  pending: string;
};

export function createParserState(): ParserState {
  return {
    mode: "preamble",
    sectionOrd: -1,
    currentSectionKind: null,
    currentSectionAttrs: {},
    currentCommentSectionRef: null,
    currentCommentEvidenceRef: null,
    currentCommentAttrs: {},
    currentCommentBody: "",
    pending: "",
  };
}

// ---- Public API -----------------------------------------------------

/**
 * Push a chunk of streamed text into the parser. Returns the events that
 * fire as a result. Mutates the state in place. A chunk that ends mid-line
 * stashes the partial line in `pending` and emits whatever events the
 * complete lines produced.
 *
 * After the stream ends, call `endParser(state)` to flush any final state.
 */
export function pushChunk(
  state: ParserState,
  chunk: string,
): ParserEvent[] {
  const events: ParserEvent[] = [];
  const combined = state.pending + chunk;
  const lines = combined.split(/\r?\n/);
  // Last element may be a partial line — stash it.
  state.pending = lines.pop() ?? "";

  for (const rawLine of lines) {
    handleLine(state, rawLine, events);
  }
  return events;
}

/**
 * Close the parser at end-of-stream. Flushes the trailing partial line
 * (if any) and any open sections/comments. Emits a parser_error if the
 * stream ended without ###done while in an open section/comment.
 */
export function endParser(state: ParserState): ParserEvent[] {
  const events: ParserEvent[] = [];
  if (state.pending.length > 0) {
    handleLine(state, state.pending, events);
    state.pending = "";
  }
  if (state.mode === "in_section") {
    // Close the open section so partial work is preserved.
    events.push({ kind: "section_end", ord: state.sectionOrd });
    state.mode = "preamble";
  } else if (state.mode === "in_comment") {
    flushComment(state, events);
  }
  if (state.mode !== "done") {
    events.push({
      kind: "parser_error",
      reason: "stream ended without ###done directive",
      nearLine: "",
    });
  }
  return events;
}

// ---- Internals ------------------------------------------------------

function handleLine(
  state: ParserState,
  rawLine: string,
  events: ParserEvent[],
): void {
  const directive = parseDirective(rawLine);

  if (directive) {
    // A directive line ends the current section/comment if any.
    if (state.mode === "in_section") {
      events.push({ kind: "section_end", ord: state.sectionOrd });
      state.currentSectionKind = null;
      state.currentSectionAttrs = {};
    } else if (state.mode === "in_comment") {
      flushComment(state, events);
    }

    switch (directive.name) {
      case "section": {
        const sectionKind = directive.positional ?? directive.attrs.kind;
        if (!sectionKind) {
          events.push({
            kind: "parser_error",
            reason: "###section directive missing kind",
            nearLine: rawLine,
          });
          return;
        }
        if (!KNOWN_SECTION_KINDS.has(sectionKind as SectionKind)) {
          events.push({
            kind: "parser_error",
            reason: `unknown section kind '${sectionKind}'`,
            nearLine: rawLine,
          });
          return;
        }
        state.sectionOrd += 1;
        state.currentSectionKind = sectionKind as SectionKind;
        state.currentSectionAttrs = { ...directive.attrs };
        // Strip the redundant 'kind' attr from the attrs object.
        delete state.currentSectionAttrs.kind;
        state.mode = "in_section";
        events.push({
          kind: "section_start",
          ord: state.sectionOrd,
          sectionKind: state.currentSectionKind,
          attrs: state.currentSectionAttrs,
        });
        return;
      }
      case "comment": {
        const sectionRef = directive.attrs.section ?? null;
        const evidenceRef = directive.attrs.ref ?? null;
        if (!sectionRef) {
          events.push({
            kind: "parser_error",
            reason: "###comment directive missing section= attr (CLAUDE.md: comments anchor to sections)",
            nearLine: rawLine,
          });
          return;
        }
        if (!evidenceRef) {
          events.push({
            kind: "parser_error",
            reason: "###comment directive missing ref= attr (CLAUDE.md: comments require evidence pointer)",
            nearLine: rawLine,
          });
          return;
        }
        const attrs: Record<string, string> = { ...directive.attrs };
        delete attrs.section;
        delete attrs.ref;
        state.mode = "in_comment";
        state.currentCommentSectionRef = sectionRef;
        state.currentCommentEvidenceRef = evidenceRef;
        state.currentCommentAttrs = attrs;
        state.currentCommentBody = "";
        return;
      }
      case "done":
        state.mode = "done";
        events.push({ kind: "done" });
        return;
      default:
        events.push({
          kind: "parser_error",
          reason: `unknown directive '###${directive.name}'`,
          nearLine: rawLine,
        });
        return;
    }
  }

  // Non-directive line. Routes to current accumulator.
  if (state.mode === "in_section") {
    events.push({
      kind: "section_token",
      ord: state.sectionOrd,
      text: rawLine + "\n",
    });
    return;
  }
  if (state.mode === "in_comment") {
    state.currentCommentBody += rawLine + "\n";
    return;
  }
  // Preamble or done — drop the line. Per CLAUDE.md, prose before the
  // first ###section is rejected; we drop silently because the agent's
  // skill prompt instructs no preamble. Strict mode would emit
  // parser_error; we soften here only for whitespace/empty lines.
  if (rawLine.trim().length > 0) {
    events.push({
      kind: "parser_error",
      reason: "non-directive content outside any section",
      nearLine: rawLine,
    });
  }
}

function flushComment(state: ParserState, events: ParserEvent[]): void {
  if (
    state.currentCommentSectionRef !== null &&
    state.currentCommentEvidenceRef !== null
  ) {
    events.push({
      kind: "comment_added",
      sectionRef: state.currentCommentSectionRef,
      evidenceRef: state.currentCommentEvidenceRef,
      body: state.currentCommentBody.trimEnd(),
      attrs: state.currentCommentAttrs,
    });
  }
  state.mode = "preamble";
  state.currentCommentSectionRef = null;
  state.currentCommentEvidenceRef = null;
  state.currentCommentAttrs = {};
  state.currentCommentBody = "";
}

// Tiny directive parser. Expects lines starting with `###<name>:` then a
// comma-separated kvs list, optionally with one positional kind first.
//
// Examples:
//   ###section: recommendation
//   ###section: evidence, source=memory
//   ###comment: section=recommendation, ref=memory:abc, severity=low
//   ###done
type Directive = {
  name: string;
  positional: string | null;
  attrs: Record<string, string>;
};

function parseDirective(rawLine: string): Directive | null {
  const trimmed = rawLine.trimStart();
  if (!trimmed.startsWith("###")) return null;
  const rest = trimmed.slice(3);
  const colonAt = rest.indexOf(":");
  let name: string;
  let body: string;
  if (colonAt === -1) {
    name = rest.trim();
    body = "";
  } else {
    name = rest.slice(0, colonAt).trim();
    body = rest.slice(colonAt + 1).trim();
  }
  if (!name) return null;
  if (body.length === 0) {
    return { name, positional: null, attrs: {} };
  }
  // Split body by commas (no commas inside values for v1 — agents emit
  // simple kv pairs). The first segment may be either kv (`section=foo`)
  // or positional (`recommendation`).
  const segments = body.split(",").map((s) => s.trim()).filter(Boolean);
  const attrs: Record<string, string> = {};
  let positional: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const eqAt = seg.indexOf("=");
    if (eqAt === -1) {
      // Positional only allowed as the first segment.
      if (i === 0) {
        positional = seg;
      } else {
        attrs[`__bad_${i}`] = seg;
      }
    } else {
      const key = seg.slice(0, eqAt).trim();
      const value = seg.slice(eqAt + 1).trim();
      attrs[key] = value;
    }
  }
  return { name, positional, attrs };
}
