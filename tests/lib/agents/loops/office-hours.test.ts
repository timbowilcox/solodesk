// Unit tests for lib/agents/loops/office-hours.ts — composeSections shape.
//
// Sprint B.5 bright line: every generator that emits agent_notes must write
// `assumption` (LLM's reasoning) and `decision: ""` (empty, for operator).
// The enforcement gate in `approveDecisionDocument` checks `decision`
// non-empty; pre-filling it defeats the gate.

import { describe, expect, test } from "vitest";

vi.mock("server-only", () => ({}));

import { composeSections } from "@/lib/agents/loops/office-hours";
import { vi } from "vitest";

describe("composeSections — agent_note shape (Sprint B.5 rename)", () => {
  test("agent_note with assumption writes assumption populated and decision empty", () => {
    const parsed = {
      context: "Some context.",
      recommendation: { text: "Go left.", confidence: "medium" as const },
      agent_notes: [
        {
          question: "Which market to target?",
          assumption: "Assumed enterprise, not SMB, based on prior decisions.",
          alternatives: "SMB would change the pricing model entirely.",
        },
      ],
    };

    const sections = composeSections(parsed);
    const agentNote = sections.find((s) => s.kind === "agent_note");

    expect(agentNote).toBeDefined();
    expect(agentNote?.content).toMatchObject({
      question: "Which market to target?",
      assumption: "Assumed enterprise, not SMB, based on prior decisions.",
      decision: "",
      alternatives: "SMB would change the pricing model entirely.",
    });
    // decision must be exactly empty string — not undefined, not the assumption value
    expect((agentNote?.content as Record<string, unknown>).decision).toBe("");
  });

  test("agent_note without assumption is dropped (filter)", () => {
    const parsed = {
      agent_notes: [
        { question: "Some ambiguity?", assumption: "" },
        { question: "Other ambiguity?", assumption: "Real assumption." },
      ],
    };

    const sections = composeSections(parsed);
    const agentNotes = sections.filter((s) => s.kind === "agent_note");

    // Only the note with a non-empty assumption survives
    expect(agentNotes).toHaveLength(1);
    expect((agentNotes[0]!.content as Record<string, unknown>).assumption).toBe("Real assumption.");
  });

  test("agent_note without assumption field at all is dropped", () => {
    const parsed = {
      agent_notes: [
        { question: "Ambiguity?", decision: "Old-shape field — should not exist" },
      ],
    };

    const sections = composeSections(parsed);
    const agentNotes = sections.filter((s) => s.kind === "agent_note");

    // The old `decision` field does not satisfy the `assumption` filter
    expect(agentNotes).toHaveLength(0);
  });

  test("agent_note with no alternatives omits the field entirely", () => {
    const parsed = {
      agent_notes: [
        { question: "Q?", assumption: "The assumption." },
      ],
    };

    const sections = composeSections(parsed);
    const note = sections.find((s) => s.kind === "agent_note");

    expect(note?.content).toMatchObject({
      question: "Q?",
      assumption: "The assumption.",
      decision: "",
    });
    expect((note?.content as Record<string, unknown>).alternatives).toBeUndefined();
  });
});
