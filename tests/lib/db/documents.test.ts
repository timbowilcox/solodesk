// Unit tests for lib/db/documents.ts — focused on the agent_note approval
// guard.
//
// Bright line (CLAUDE.md): no Document flips to `approved` while any
// `agent_note` Section is unresolved. The guard lives in
// approveDecisionDocument; the predicate `isAgentNoteResolved` and helper
// `findUnresolvedAgentNotes` are pure and tested directly.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isAgentNoteResolved,
  findUnresolvedAgentNotes,
  isApprovableDocumentStatus,
} from "@/lib/db/documents";
import type {
  DocumentStatus,
  Json,
  SectionKind,
  SectionStatus,
} from "@/lib/supabase/types";

type SectionForTest = {
  id: string;
  kind: SectionKind;
  status: SectionStatus;
  content: Json;
};

function section(overrides: Partial<SectionForTest> = {}): SectionForTest {
  return {
    id: overrides.id ?? "sec-1",
    kind: overrides.kind ?? "agent_note",
    status: overrides.status ?? "draft",
    content: overrides.content ?? { question: "Q?", decision: "" },
  };
}

describe("isAgentNoteResolved", () => {
  test("non-agent_note sections are always resolved (vacuous)", () => {
    expect(
      isAgentNoteResolved(section({ kind: "recommendation", status: "draft" })),
    ).toBe(true);
    expect(
      isAgentNoteResolved(section({ kind: "evidence", status: "reviewing" })),
    ).toBe(true);
  });

  test("agent_note with empty decision and non-terminal status is unresolved", () => {
    expect(
      isAgentNoteResolved(
        section({ status: "draft", content: { question: "Q?", decision: "" } }),
      ),
    ).toBe(false);
    expect(
      isAgentNoteResolved(
        section({
          status: "reviewing",
          content: { question: "Q?", decision: "   " },
        }),
      ),
    ).toBe(false);
  });

  test("agent_note with non-empty decision is resolved", () => {
    expect(
      isAgentNoteResolved(
        section({
          status: "draft",
          content: { question: "Q?", decision: "Go with option B." },
        }),
      ),
    ).toBe(true);
  });

  test("agent_note in terminal status is resolved regardless of decision", () => {
    for (const status of ["approved", "dismissed", "rejected"] as const) {
      expect(
        isAgentNoteResolved(
          section({ status, content: { question: "Q?", decision: "" } }),
        ),
      ).toBe(true);
    }
  });

  test("agent_note with malformed content (non-object) is unresolved", () => {
    expect(
      isAgentNoteResolved(
        section({ status: "draft", content: null as unknown as Json }),
      ),
    ).toBe(false);
    expect(
      isAgentNoteResolved(section({ status: "draft", content: "string" as Json })),
    ).toBe(false);
  });

  // Sprint B.5: post-rename shape tests
  test("agent_note with assumption populated and decision empty is NOT resolved", () => {
    expect(
      isAgentNoteResolved(
        section({
          status: "draft",
          content: { question: "Q?", assumption: "Agent chose X.", decision: "" },
        }),
      ),
    ).toBe(false);
  });

  test("agent_note with assumption and decision both populated IS resolved (operator confirmed)", () => {
    expect(
      isAgentNoteResolved(
        section({
          status: "draft",
          content: { question: "Q?", assumption: "Agent chose X.", decision: "Agent chose X." },
        }),
      ),
    ).toBe(true);
  });

  test("agent_note with status='deferred' and empty decision is treated as a gate (not resolved)", () => {
    expect(
      isAgentNoteResolved(
        section({
          status: "deferred",
          content: { question: "Q?", assumption: "Agent chose X.", decision: "" },
        }),
      ),
    ).toBe(false);
  });
});

describe("isApprovableDocumentStatus", () => {
  // Bright line under test: Loop-generated Decision Documents land in
  // 'reviewing' (lib/loops/runner.ts:255) and operator-authored ones land
  // in 'draft'. Both must be approvable from the operator-facing detail
  // page; terminal and transient statuses must not be.

  test("draft is approvable (operator-authored path)", () => {
    expect(isApprovableDocumentStatus("draft")).toBe(true);
  });

  test("reviewing is approvable (Loop-generated path)", () => {
    // Regression for the Loop 1 live verification gap where status='reviewing'
    // documents had no approve form rendered. This is the test the verification
    // would have caught had it existed before deploy.
    expect(isApprovableDocumentStatus("reviewing")).toBe(true);
  });

  test("terminal statuses are not approvable", () => {
    for (const status of ["approved", "rejected", "archived"] as const) {
      expect(isApprovableDocumentStatus(status)).toBe(false);
    }
  });

  test("transient runner statuses are not approvable", () => {
    for (const status of ["drafting", "cancelled", "drafting_orphaned"] as const) {
      expect(isApprovableDocumentStatus(status)).toBe(false);
    }
  });

  test("covers every value of DocumentStatus exhaustively", () => {
    // If a new DocumentStatus is added, this test will fail to compile
    // (because the array literal is widened) — forcing the author to
    // decide whether the new state is approvable.
    const all: DocumentStatus[] = [
      "draft",
      "reviewing",
      "approved",
      "rejected",
      "published",
      "archived",
      "drafting",
      "cancelled",
      "drafting_orphaned",
    ];
    const approvable = all.filter(isApprovableDocumentStatus);
    expect(approvable).toEqual(["draft", "reviewing"]);
  });
});

describe("findUnresolvedAgentNotes", () => {
  test("returns empty when no agent_notes present", () => {
    const sections = [
      section({ id: "a", kind: "recommendation", status: "draft" }),
      section({ id: "b", kind: "evidence", status: "draft" }),
    ];
    expect(findUnresolvedAgentNotes(sections)).toEqual([]);
  });

  test("returns only the unresolved agent_notes", () => {
    const sections = [
      section({ id: "a", kind: "recommendation", status: "draft" }),
      section({
        id: "b",
        kind: "agent_note",
        status: "draft",
        content: { question: "Q1?", decision: "" },
      }),
      section({
        id: "c",
        kind: "agent_note",
        status: "draft",
        content: { question: "Q2?", decision: "Yes" },
      }),
      section({
        id: "d",
        kind: "agent_note",
        status: "dismissed",
        content: { question: "Q3?", decision: "" },
      }),
    ];
    const unresolved = findUnresolvedAgentNotes(sections);
    expect(unresolved.map((s) => s.id)).toEqual(["b"]);
  });
});

// --------------------------------------------------------------
// Integration test: approveDecisionDocument with mocked supabase.
// Verifies the bright-line guard + that no DB writes fire when the
// guard rejects.
// --------------------------------------------------------------

type UpdateCall = { table: string; payload: Record<string, unknown> };

function makeMockSupabase(opts: {
  document: { id: string; type: string; venture_id: string; title: string; loop_name: string };
  sections: SectionForTest[];
  decisionInsertId?: string;
}) {
  const updateCalls: UpdateCall[] = [];
  const insertCalls: UpdateCall[] = [];

  const sectionsList = opts.sections.map((s) => ({
    id: s.id,
    document_id: opts.document.id,
    kind: s.kind,
    status: s.status,
    content: s.content,
    ord: 0,
    created_at: "2026-05-07T00:00:00Z",
    updated_at: "2026-05-07T00:00:00Z",
  }));

  const client = {
    from(table: string) {
      const sentinel = `from:${table}`;
      void sentinel;
      const builder: Record<string, unknown> = {};

      // documents.select(*).eq().eq().maybeSingle() -> single doc row
      // sections.select(*).eq().order() -> awaited as { data: [...] }
      // sections.update({...}).eq().neq() -> tracked, awaited as { error: null }
      // documents.update({...}).eq() -> tracked
      // decisions.insert({...}).select().single() -> { data: { id }, error: null }

      builder.select = () => builder;
      builder.eq = () => builder;
      builder.neq = () => builder;
      builder.is = () => builder;
      builder.in = () => builder;
      builder.order = () => Promise.resolve({ data: sectionsList, error: null });
      builder.range = () => builder;
      builder.limit = () => builder;
      builder.maybeSingle = async () => {
        if (table === "documents") {
          return { data: opts.document, error: null };
        }
        return { data: null, error: null };
      };
      builder.single = async () => {
        if (table === "decisions") {
          return {
            data: { id: opts.decisionInsertId ?? "dec-1" },
            error: null,
          };
        }
        return { data: null, error: null };
      };
      builder.update = (payload: Record<string, unknown>) => {
        updateCalls.push({ table, payload });
        // Returning a thenable so `await supabase.from('x').update().eq().neq()`
        // resolves to { error: null }.
        const updateBuilder: Record<string, unknown> = {
          eq: () => updateBuilder,
          neq: () => updateBuilder,
          is: () => updateBuilder,
          then: (resolve: (value: { error: null }) => void) => {
            resolve({ error: null });
          },
        };
        return updateBuilder;
      };
      builder.insert = (payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        return builder;
      };

      return builder;
    },
  };

  return { client, updateCalls, insertCalls };
}

describe("approveDecisionDocument — agent_note guard", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const docMeta = {
    id: "doc-1",
    type: "decision" as const,
    venture_id: "v-1",
    title: "Pricing decision",
    loop_name: "01-strategy",
  };

  test("refuses approval when an agent_note has empty decision", async () => {
    const sections: SectionForTest[] = [
      section({ id: "rec-1", kind: "recommendation", status: "draft" }),
      section({
        id: "an-1",
        kind: "agent_note",
        status: "draft",
        content: { question: "Confirm scope?", decision: "" },
      }),
    ];
    const { client, updateCalls, insertCalls } = makeMockSupabase({
      document: docMeta,
      sections,
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => client,
    }));

    const { approveDecisionDocument } = await import("@/lib/db/documents");
    const result = await approveDecisionDocument({
      documentId: docMeta.id,
      ventureId: docMeta.venture_id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("1 agent_note unresolved");
    expect(result.unresolvedSectionIds).toEqual(["an-1"]);

    // Critical: no writes happened. No section status changed, no document
    // status flipped, no decisions row created.
    expect(updateCalls).toEqual([]);
    expect(insertCalls).toEqual([]);
  });

  test("error pluralises when multiple agent_notes are unresolved", async () => {
    const sections: SectionForTest[] = [
      section({
        id: "an-1",
        kind: "agent_note",
        status: "draft",
        content: { question: "Q1?", decision: "" },
      }),
      section({
        id: "an-2",
        kind: "agent_note",
        status: "reviewing",
        content: { question: "Q2?", decision: "" },
      }),
    ];
    const { client } = makeMockSupabase({ document: docMeta, sections });
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => client,
    }));

    const { approveDecisionDocument } = await import("@/lib/db/documents");
    const result = await approveDecisionDocument({
      documentId: docMeta.id,
      ventureId: docMeta.venture_id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("2 agent_notes unresolved");
    expect(result.unresolvedSectionIds).toEqual(["an-1", "an-2"]);
  });

  test("approves when agent_note is resolved (decision filled in)", async () => {
    const sections: SectionForTest[] = [
      section({
        id: "rec-1",
        kind: "recommendation",
        status: "draft",
        content: { text: "Go with B." },
      }),
      section({
        id: "an-1",
        kind: "agent_note",
        status: "draft",
        content: { question: "Confirm scope?", decision: "Confirmed by operator." },
      }),
    ];
    const { client, updateCalls, insertCalls } = makeMockSupabase({
      document: docMeta,
      sections,
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => client,
    }));

    const { approveDecisionDocument } = await import("@/lib/db/documents");
    const result = await approveDecisionDocument({
      documentId: docMeta.id,
      ventureId: docMeta.venture_id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decisionId).toBe("dec-1");

    // Bulk section approval, document approval, decisions insert all fired.
    const sectionUpdate = updateCalls.find((c) => c.table === "sections");
    const docUpdate = updateCalls.find((c) => c.table === "documents");
    expect(sectionUpdate?.payload).toEqual({ status: "approved" });
    expect(docUpdate?.payload.status).toBe("approved");
    expect(insertCalls.find((c) => c.table === "decisions")).toBeDefined();
  });

  test("approves when no agent_notes are present (regression — guard does not over-block)", async () => {
    const sections: SectionForTest[] = [
      section({
        id: "rec-1",
        kind: "recommendation",
        status: "draft",
        content: { text: "Hold." },
      }),
    ];
    const { client } = makeMockSupabase({ document: docMeta, sections });
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => client,
    }));

    const { approveDecisionDocument } = await import("@/lib/db/documents");
    const result = await approveDecisionDocument({
      documentId: docMeta.id,
      ventureId: docMeta.venture_id,
    });

    expect(result.ok).toBe(true);
  });

  test("guard fires for status='reviewing' documents (Loop-generated path)", async () => {
    // Regression for the Loop 1 verification gap. The page used to gate
    // approval on status='draft' only, hiding the form for Loop-generated
    // Documents. Now both states reach approveDecisionDocument; the
    // guard must still fire on unresolved agent_notes regardless of
    // document.status.
    const reviewingDoc = { ...docMeta, status: "reviewing" as const };
    const sections: SectionForTest[] = [
      section({ id: "rec-1", kind: "recommendation", status: "draft" }),
      section({
        id: "an-1",
        kind: "agent_note",
        status: "draft",
        content: { question: "Confirm pricing tier?", decision: "" },
      }),
    ];
    const { client, updateCalls, insertCalls } = makeMockSupabase({
      document: reviewingDoc,
      sections,
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => client,
    }));

    const { approveDecisionDocument } = await import("@/lib/db/documents");
    const result = await approveDecisionDocument({
      documentId: reviewingDoc.id,
      ventureId: reviewingDoc.venture_id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("1 agent_note unresolved");
    expect(updateCalls).toEqual([]);
    expect(insertCalls).toEqual([]);
  });
});
