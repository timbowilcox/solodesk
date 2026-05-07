// Pure unit tests for the Watch narration formatter.

import { describe, expect, test } from "vitest";

import { narrateEvent } from "@/lib/watch/narrate";

const ctx = { ventureName: "Kounta" };

describe("narrateEvent", () => {
  test("document.created", () => {
    expect(
      narrateEvent(
        { type: "document.created", source: "agent:strategy", payload: { type: "decision" } },
        ctx,
      ),
    ).toBe("Drafting decision in Kounta.");
  });

  test("document.section_streamed includes section kind", () => {
    expect(
      narrateEvent(
        {
          type: "document.section_streamed",
          source: "agent:strategy",
          payload: { section_kind: "recommendation" },
        },
        ctx,
      ),
    ).toBe("Recommendation section ready in Kounta.");
  });

  test("document.queued_for_review", () => {
    expect(
      narrateEvent(
        { type: "document.queued_for_review", source: "agent:strategy", payload: null },
        ctx,
      ),
    ).toMatch(/queued for review in Kounta/);
  });

  test("document.approved", () => {
    expect(
      narrateEvent(
        { type: "document.approved", source: "tim", payload: { type: "decision" } },
        ctx,
      ),
    ).toBe("Decision approved in Kounta.");
  });

  test("agent_note.opened", () => {
    expect(
      narrateEvent(
        {
          type: "agent_note.opened",
          source: "agent:critic",
          payload: { section_kind: "kill_criteria" },
        },
        ctx,
      ),
    ).toBe("Critic raised a note on kill_criteria in Kounta.");
  });

  test("agent_note.resolved", () => {
    expect(
      narrateEvent(
        { type: "agent_note.resolved", source: "tim", payload: null },
        ctx,
      ),
    ).toBe("Critic note resolved in Kounta.");
  });

  test("loop.invoked humanises the loop name", () => {
    expect(
      narrateEvent(
        { type: "loop.invoked", source: "system", payload: { loop_name: "08-metrics-digest" } },
        ctx,
      ),
    ).toBe("Watching Kounta metrics.");
  });

  test("loop.failed", () => {
    expect(
      narrateEvent(
        { type: "loop.failed", source: "system", payload: { loop_name: "01-strategy" } },
        ctx,
      ),
    ).toBe("Strategy failed in Kounta.");
  });

  test("loop.blown_budget", () => {
    expect(
      narrateEvent(
        { type: "loop.blown_budget", source: "system", payload: { loop_name: "04-content" } },
        ctx,
      ),
    ).toBe("Content blew budget in Kounta.");
  });

  test("connection.event with summary", () => {
    expect(
      narrateEvent(
        {
          type: "connection.event",
          source: "stripe",
          payload: { provider: "stripe", summary: "charge.succeeded" },
        },
        ctx,
      ),
    ).toBe("Stripe event received in Kounta: charge.succeeded.");
  });

  test("connection.event without summary", () => {
    expect(
      narrateEvent(
        {
          type: "connection.event",
          source: "stripe",
          payload: { provider: "stripe" },
        },
        ctx,
      ),
    ).toBe("Stripe event received in Kounta.");
  });

  test("anomaly.detected", () => {
    expect(
      narrateEvent(
        { type: "anomaly.detected", source: "loop:08", payload: { metric_name: "mrr" } },
        ctx,
      ),
    ).toBe("Mrr anomaly detected in Kounta. Investigating.");
  });

  test("anomaly.explained", () => {
    expect(
      narrateEvent(
        { type: "anomaly.explained", source: "loop:08", payload: null },
        ctx,
      ),
    ).toBe("Anomaly explained in Kounta.");
  });

  test("support.ticket_created", () => {
    expect(
      narrateEvent(
        { type: "support.ticket_created", source: "support", payload: null },
        ctx,
      ),
    ).toBe("Support ticket received in Kounta.");
  });

  test("support.ticket_classified", () => {
    expect(
      narrateEvent(
        {
          type: "support.ticket_classified",
          source: "support",
          payload: { classification: "bug" },
        },
        ctx,
      ),
    ).toBe("Support ticket classified as bug in Kounta.");
  });

  test("memory.added", () => {
    expect(
      narrateEvent({ type: "memory.added", source: "manual", payload: null }, ctx),
    ).toBe("Memory recorded in Kounta.");
  });

  test("manual note", () => {
    expect(
      narrateEvent({ type: "note", source: "manual", payload: null }, ctx),
    ).toBe("Note in Kounta.");
  });

  test("unknown type falls back without throwing", () => {
    expect(
      narrateEvent(
        { type: "totally.bogus.type", source: "wat", payload: null },
        ctx,
      ),
    ).toBe("Activity in Kounta.");
  });

  test("undefined payload falls through to fallback strings", () => {
    expect(
      narrateEvent(
        { type: "document.created", source: "x", payload: null },
        ctx,
      ),
    ).toBe("Drafting a document in Kounta.");
  });
});
