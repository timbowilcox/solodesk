// Unit tests for lib/agents/loops/support-replier.ts — composeAgentNoteSeeds shape.
//
// Sprint B.5 bright line: agent_notes from generators write `assumption`
// (LLM's reasoning) and `decision: ""` (empty, for operator).

import { describe, expect, test } from "vitest";

vi.mock("server-only", () => ({}));

import { composeAgentNoteSeeds } from "@/lib/agents/loops/support-replier";
import { vi } from "vitest";

describe("composeAgentNoteSeeds — agent_note shape (Sprint B.5 rename)", () => {
  test("note with assumption writes assumption populated and decision empty", () => {
    const seeds = composeAgentNoteSeeds([
      {
        question: "Should we offer refund?",
        assumption: "Operator typically approves refunds under $50 — assumed yes.",
        alternatives: "Declining would match stricter policy but risks churn.",
      },
    ]);

    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.content).toMatchObject({
      question: "Should we offer refund?",
      assumption: "Operator typically approves refunds under $50 — assumed yes.",
      decision: "",
      alternatives: "Declining would match stricter policy but risks churn.",
    });
    expect(seeds[0]!.content.decision).toBe("");
  });

  test("note without assumption is dropped", () => {
    const seeds = composeAgentNoteSeeds([
      { question: "No assumption here", assumption: "" },
      { question: "Has assumption", assumption: "Real reasoning." },
    ]);

    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.content.assumption).toBe("Real reasoning.");
  });

  test("note without assumption field at all is dropped (old-shape guard)", () => {
    const seeds = composeAgentNoteSeeds([
      { question: "Old shape", assumption: undefined },
    ]);

    expect(seeds).toHaveLength(0);
  });

  test("multiple valid notes all pass through with correct shape", () => {
    const seeds = composeAgentNoteSeeds([
      { question: "Q1?", assumption: "A1." },
      { question: "Q2?", assumption: "A2.", alternatives: "Alt2." },
    ]);

    expect(seeds).toHaveLength(2);
    for (const seed of seeds) {
      expect(seed.content.decision).toBe("");
      expect(seed.content.assumption).toBeTruthy();
    }
    expect(seeds[1]!.content.alternatives).toBe("Alt2.");
  });
});
