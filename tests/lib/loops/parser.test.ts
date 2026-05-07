// Pure unit tests for the streaming Section parser (Sprint 10).

import { describe, expect, test } from "vitest";

import {
  createParserState,
  endParser,
  pushChunk,
  type ParserEvent,
} from "@/lib/loops/parser";

function runFull(text: string): ParserEvent[] {
  const state = createParserState();
  const events: ParserEvent[] = [];
  events.push(...pushChunk(state, text));
  events.push(...endParser(state));
  return events;
}

describe("parser — happy paths", () => {
  test("single section followed by ###done", () => {
    const events = runFull(
      [
        "###section: recommendation",
        "We should adopt async writes.",
        "###done",
        "",
      ].join("\n"),
    );
    expect(events.map((e) => e.kind)).toEqual([
      "section_start",
      "section_token",
      "section_end",
      "done",
    ]);
  });

  test("two sections + ###done emit start/token/end pairs in order", () => {
    const events = runFull(
      [
        "###section: recommendation",
        "Pivot now.",
        "###section: evidence",
        "Q1 churn 8%.",
        "###done",
        "",
      ].join("\n"),
    );
    expect(events.map((e) => e.kind)).toEqual([
      "section_start",
      "section_token",
      "section_end",
      "section_start",
      "section_token",
      "section_end",
      "done",
    ]);
    const starts = events.filter((e) => e.kind === "section_start");
    expect(starts.map((e) => (e as { ord: number }).ord)).toEqual([0, 1]);
  });

  test("comment after a section emits comment_added with section + evidence", () => {
    const events = runFull(
      [
        "###section: recommendation",
        "Pivot now.",
        "###comment: section=recommendation, ref=memory:abc",
        "This is hand-wavy without numbers.",
        "###done",
        "",
      ].join("\n"),
    );
    const c = events.find((e) => e.kind === "comment_added");
    expect(c).toBeDefined();
    if (c?.kind === "comment_added") {
      expect(c.sectionRef).toBe("recommendation");
      expect(c.evidenceRef).toBe("memory:abc");
      expect(c.body).toBe("This is hand-wavy without numbers.");
    }
  });

  test("multiple body lines accumulate into multiple section_token events", () => {
    const events = runFull(
      [
        "###section: prose",
        "line one",
        "line two",
        "line three",
        "###done",
        "",
      ].join("\n"),
    );
    const tokens = events.filter((e) => e.kind === "section_token");
    expect(tokens).toHaveLength(3);
  });
});

describe("parser — chunked streaming", () => {
  test("chunk boundary mid-line stashes pending and resumes", () => {
    const state = createParserState();
    const all: ParserEvent[] = [];
    all.push(...pushChunk(state, "###section: recommen"));
    all.push(...pushChunk(state, "dation\nWe should "));
    all.push(...pushChunk(state, "do X.\n###done\n"));
    all.push(...endParser(state));
    expect(all.map((e) => e.kind)).toEqual([
      "section_start",
      "section_token",
      "section_end",
      "done",
    ]);
    const tok = all.find((e) => e.kind === "section_token");
    if (tok?.kind === "section_token") {
      expect(tok.text).toBe("We should do X.\n");
    }
  });

  test("chunk that's only newlines emits nothing significant", () => {
    const state = createParserState();
    const events = pushChunk(state, "\n\n\n");
    expect(events).toEqual([]);
  });
});

describe("parser — strict mode rejects bad input", () => {
  test("unknown directive name emits parser_error", () => {
    const events = runFull("###flap\n");
    expect(events.some((e) => e.kind === "parser_error")).toBe(true);
  });

  test("unknown section kind emits parser_error", () => {
    const events = runFull("###section: bogus_kind\nbody\n###done\n");
    expect(events.some((e) => e.kind === "parser_error")).toBe(true);
  });

  test("###comment without section= attr emits parser_error", () => {
    const events = runFull(
      [
        "###section: recommendation",
        "x",
        "###comment: ref=memory:abc",
        "y",
        "###done",
        "",
      ].join("\n"),
    );
    expect(events.some((e) => e.kind === "parser_error")).toBe(true);
  });

  test("###comment without ref= attr emits parser_error", () => {
    const events = runFull(
      [
        "###section: recommendation",
        "x",
        "###comment: section=recommendation",
        "y",
        "###done",
        "",
      ].join("\n"),
    );
    expect(events.some((e) => e.kind === "parser_error")).toBe(true);
  });

  test("non-directive content before first section emits parser_error", () => {
    const events = runFull("hello world\n###section: prose\nx\n###done\n");
    expect(events.some((e) => e.kind === "parser_error")).toBe(true);
  });

  test("stream ending without ###done emits parser_error", () => {
    const events = runFull(
      ["###section: prose", "body but no done"].join("\n"),
    );
    expect(events.some((e) => e.kind === "parser_error")).toBe(true);
    // Final section_end still fires for partial work
    expect(events.some((e) => e.kind === "section_end")).toBe(true);
  });
});

describe("parser — preserves attributes", () => {
  test("section attrs minus 'kind' available on section_start", () => {
    const events = runFull(
      [
        "###section: prose, source=memory",
        "x",
        "###done",
        "",
      ].join("\n"),
    );
    const start = events.find((e) => e.kind === "section_start");
    if (start?.kind === "section_start") {
      expect(start.attrs).toEqual({ source: "memory" });
      expect(start.sectionKind).toBe("prose");
    }
  });

  test("comment attrs minus section/ref available on comment_added", () => {
    const events = runFull(
      [
        "###section: recommendation",
        "x",
        "###comment: section=recommendation, ref=memory:abc, severity=high",
        "y",
        "###done",
        "",
      ].join("\n"),
    );
    const c = events.find((e) => e.kind === "comment_added");
    if (c?.kind === "comment_added") {
      expect(c.attrs).toEqual({ severity: "high" });
    }
  });
});
