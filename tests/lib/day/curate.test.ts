// Unit tests for the Day curate function.
//
// Pure derivation — same input -> same output. Verifies priority sort,
// dismissal filtering, and the per-kind coverage.

import { describe, expect, test } from "vitest";

import {
  curateDay,
  type AgentNoteSectionInput,
  type AnomalyInput,
  type DocumentInput,
  type SupportTicketInput,
  type VentureMetaInput,
} from "@/lib/day/curate";

const NOW = new Date("2026-05-07T12:00:00Z");
const KOUNTA: VentureMetaInput = {
  venture_id: "v-kounta",
  slug: "kounta",
  name: "Kounta",
  accent_color: "#3B6D11",
  mark_slug: "kounta",
};
const COUNSEL: VentureMetaInput = {
  venture_id: "v-counsel",
  slug: "counsel",
  name: "Counsel",
  accent_color: "#A32D2D",
  mark_slug: "counsel",
};

function emptyInput() {
  return {
    documents: [] as DocumentInput[],
    agentNoteSections: [] as AgentNoteSectionInput[],
    anomalies: [] as AnomalyInput[],
    supportTickets: [] as SupportTicketInput[],
    dismissals: [] as { item_type: "document" | "agent_note" | "anomaly" | "support_ticket"; item_id: string }[],
    ventures: [KOUNTA, COUNSEL],
    now: NOW,
  };
}

describe("curateDay", () => {
  test("empty input returns empty list", () => {
    expect(curateDay(emptyInput())).toEqual([]);
  });

  test("pending-review document becomes a 'document' item", () => {
    const result = curateDay({
      ...emptyInput(),
      documents: [
        {
          id: "doc-1",
          venture_id: "v-kounta",
          type: "decision",
          title: "Pricing change",
          status: "reviewing",
          loop_name: "01-strategy",
          created_at: "2026-05-06T12:00:00Z",
          updated_at: "2026-05-07T11:00:00Z",
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("document");
    expect(result[0]!.title).toBe("Pricing change");
    expect(result[0]!.ventureName).toBe("Kounta");
    expect(result[0]!.source).toBe("Decision · in review");
    expect(result[0]!.href).toBe("/ventures/kounta/decisions/doc-1");
  });

  test("stale draft decision (≥3 days old) appears", () => {
    const result = curateDay({
      ...emptyInput(),
      documents: [
        {
          id: "doc-2",
          venture_id: "v-kounta",
          type: "decision",
          title: "Old idea",
          status: "draft",
          loop_name: "01-strategy",
          created_at: "2026-05-03T12:00:00Z", // 4 days before NOW
          updated_at: "2026-05-03T12:00:00Z",
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe("Decision · 4 days old");
  });

  test("draft decision younger than 3 days is excluded", () => {
    const result = curateDay({
      ...emptyInput(),
      documents: [
        {
          id: "doc-3",
          venture_id: "v-kounta",
          type: "decision",
          title: "Fresh idea",
          status: "draft",
          loop_name: "01-strategy",
          created_at: "2026-05-06T12:00:00Z",
          updated_at: "2026-05-06T12:00:00Z",
        },
      ],
    });
    expect(result).toEqual([]);
  });

  test("open agent_note section becomes a 'agent_note' item", () => {
    const result = curateDay({
      ...emptyInput(),
      agentNoteSections: [
        {
          id: "sec-1",
          document_id: "doc-9",
          document_venture_id: "v-counsel",
          document_title: "Privacy review",
          status: "draft",
          created_at: "2026-05-07T10:00:00Z",
          question: "Need legal sign-off?",
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("agent_note");
    expect(result[0]!.title).toBe("Need legal sign-off?");
    expect(result[0]!.ventureName).toBe("Counsel");
  });

  test("approved/dismissed agent_notes excluded", () => {
    const result = curateDay({
      ...emptyInput(),
      agentNoteSections: [
        {
          id: "sec-2",
          document_id: "doc-x",
          document_venture_id: "v-counsel",
          document_title: "Already settled",
          status: "approved",
          created_at: "2026-05-07T10:00:00Z",
          question: "X",
        },
        {
          id: "sec-3",
          document_id: "doc-y",
          document_venture_id: "v-counsel",
          document_title: "Already dismissed",
          status: "dismissed",
          created_at: "2026-05-07T10:00:00Z",
          question: "Y",
        },
      ],
    });
    expect(result).toEqual([]);
  });

  test("recent open anomaly becomes an 'anomaly' item", () => {
    const result = curateDay({
      ...emptyInput(),
      anomalies: [
        {
          id: "an-1",
          venture_id: "v-kounta",
          metric_name: "mrr",
          severity: "medium",
          status: "open",
          ts: "2026-05-07T06:00:00Z",
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("anomaly");
    expect(result[0]!.title).toBe("Mrr anomaly");
    expect(result[0]!.source).toBe("Anomaly · medium");
  });

  test("anomaly older than 24h is excluded", () => {
    const result = curateDay({
      ...emptyInput(),
      anomalies: [
        {
          id: "an-old",
          venture_id: "v-kounta",
          metric_name: "mrr",
          severity: "low",
          status: "open",
          ts: "2026-05-05T06:00:00Z", // 54h old
        },
      ],
    });
    expect(result).toEqual([]);
  });

  test("new support_ticket becomes a 'support_ticket' item", () => {
    const result = curateDay({
      ...emptyInput(),
      supportTickets: [
        {
          id: "tk-1",
          venture_id: "v-kounta",
          subject: "Cannot log in",
          classification: "bug",
          status: "new",
          ts: "2026-05-07T11:00:00Z",
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("support_ticket");
    expect(result[0]!.source).toBe("Support · bug");
  });

  test("priority order: documents > agent_notes > anomalies > support", () => {
    const result = curateDay({
      ...emptyInput(),
      documents: [
        {
          id: "d",
          venture_id: "v-kounta",
          type: "decision",
          title: "Doc",
          status: "reviewing",
          loop_name: "x",
          created_at: "2026-05-07T00:00:00Z",
          updated_at: "2026-05-07T00:00:00Z",
        },
      ],
      agentNoteSections: [
        {
          id: "a",
          document_id: "doc-a",
          document_venture_id: "v-kounta",
          document_title: "Doc A",
          status: "draft",
          created_at: "2026-05-07T00:00:00Z",
          question: "Q",
        },
      ],
      anomalies: [
        {
          id: "n",
          venture_id: "v-kounta",
          metric_name: "x",
          severity: "low",
          status: "open",
          ts: "2026-05-07T00:00:00Z",
        },
      ],
      supportTickets: [
        {
          id: "s",
          venture_id: "v-kounta",
          subject: "S",
          classification: null,
          status: "new",
          ts: "2026-05-07T00:00:00Z",
        },
      ],
    });
    expect(result.map((r) => r.kind)).toEqual([
      "document",
      "agent_note",
      "anomaly",
      "support_ticket",
    ]);
  });

  test("dismissed items keep their place but flagged dismissed", () => {
    const result = curateDay({
      ...emptyInput(),
      documents: [
        {
          id: "d-skip",
          venture_id: "v-kounta",
          type: "decision",
          title: "Skip me",
          status: "reviewing",
          loop_name: "x",
          created_at: "2026-05-07T00:00:00Z",
          updated_at: "2026-05-07T00:00:00Z",
        },
      ],
      dismissals: [{ item_type: "document", item_id: "d-skip" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.dismissed).toBe(true);
  });

  test("rows with unknown venture_id are dropped", () => {
    const result = curateDay({
      ...emptyInput(),
      documents: [
        {
          id: "d-x",
          venture_id: "v-unknown",
          type: "decision",
          title: "Hidden",
          status: "reviewing",
          loop_name: "x",
          created_at: "2026-05-07T00:00:00Z",
          updated_at: "2026-05-07T00:00:00Z",
        },
      ],
    });
    expect(result).toEqual([]);
  });

  test("limit caps the returned items", () => {
    const docs: DocumentInput[] = Array.from({ length: 50 }, (_, i) => ({
      id: `d-${i}`,
      venture_id: "v-kounta",
      type: "decision",
      title: `Item ${i}`,
      status: "reviewing",
      loop_name: "x",
      created_at: "2026-05-07T00:00:00Z",
      updated_at: "2026-05-07T00:00:00Z",
    }));
    const result = curateDay({
      ...emptyInput(),
      documents: docs,
      limit: 30,
    });
    expect(result).toHaveLength(30);
  });
});
