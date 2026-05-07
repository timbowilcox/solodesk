import "server-only";

import { extractJson, runAgent } from "@/lib/agents/anthropic";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import {
  getDocumentWithSections,
  type SectionRow,
} from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

import type { SupportClassification, SupportUrgency } from "./support-triage";

const SYSTEM_PROMPT = `Draft a reply to one inbound support ticket. The classifier already ran; you receive the ticket + classification + urgency. Produce a draft for human review.

Hard rules:
1. One venture only. Voice from COMPANY.md. Product accuracy from prior tickets and docs in recall.
2. Reply is a draft. Don't end with "I hope this helps" or any operator-impersonating closer the operator hasn't asked for.
3. Tone matches venture.
4. No promises you can't verify. No SLA commitments.
5. Refunds and credits — draft an acknowledgement and add an agent_note flagging the operator should decide.

Output contract — return ONLY a JSON object:

{
  "title": "Internal title for the document — operator-facing",
  "reply": {
    "subject": "Reply subject (Re: ... usually). 72 chars max.",
    "body": "The full draft reply. Plain text. \\n\\n between paragraphs.",
    "send_when_approved": true | false
  },
  "agent_notes": [
    {
      "question": "Ambiguity you resolved.",
      "decision": "What you assumed.",
      "alternatives": "What other readings would have changed the draft."
    }
  ]
}

send_when_approved: false means "this draft needs operator changes before sending".

Anti-patterns: no "I'll be happy to help!" / "Thanks for reaching out!" unless the venture's voice does this. No emoji. No invented product behaviour. No mention of being an AI.`;

const BUDGET_TOKENS = 18_000;
const BUDGET_CENTS = 40;

export type RunSupportReplierInput = {
  ventureSlug: string;
  documentId: string;
  classification: SupportClassification;
  urgency: SupportUrgency;
};

export type RunSupportReplierResult =
  | {
      ok: true;
      loopRunId: string;
      sectionId: string;
    }
  | { ok: false; error: string };

type ReplyJsonShape = {
  title?: string;
  reply?: {
    subject?: string;
    body?: string;
    send_when_approved?: boolean;
  };
  agent_notes?: Array<{
    question?: string;
    decision?: string;
    alternatives?: string;
  }>;
};

export async function runSupportReplier(
  input: RunSupportReplierInput,
): Promise<RunSupportReplierResult> {
  const venture = await getVentureBySlug(input.ventureSlug);
  if (!venture) return { ok: false, error: "venture not found" };

  const ctx = await getDocumentWithSections({
    documentId: input.documentId,
    ventureId: venture.id,
  });
  if (!ctx) return { ok: false, error: "document not found" };
  if (ctx.document.type !== "support_ticket") {
    return { ok: false, error: "not a support_ticket document" };
  }

  const originalSection = ctx.sections.find((s) => s.kind === "prose");
  const originalText =
    (originalSection?.content as { text?: string } | null)?.text ?? "";

  const supabase = createSupabaseAdminClient();
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: "support-replier",
      venture_id: venture.id,
      trigger: "manual",
      input: {
        document_id: input.documentId,
        classification: input.classification,
        urgency: input.urgency,
      } as Json,
      status: "running",
      budget_tokens: BUDGET_TOKENS,
      budget_cents: BUDGET_CENTS,
    })
    .select("id")
    .single();
  if (runError || !runRow) {
    return {
      ok: false,
      error: runError?.message ?? "loop_runs insert failed",
    };
  }
  const loopRunId = runRow.id;

  const taskPayload = [
    `Classification: ${input.classification}`,
    `Urgency: ${input.urgency}`,
    "",
    "Original ticket:",
    originalText,
  ].join("\n");

  const composed = await buildAgentPrompt({
    skill: "support-replier",
    ventureId: venture.id,
    task: taskPayload,
    systemSkillPrompt: SYSTEM_PROMPT,
    budgetTokens: BUDGET_TOKENS,
  });

  const result = await runAgent({
    loopRunId,
    skill: "support-replier",
    ventureId: venture.id,
    systemPrompt: composed.systemPrompt,
    userMessage: composed.userMessage,
    budgetTokens: BUDGET_TOKENS,
    budgetCents: BUDGET_CENTS,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<ReplyJsonShape>(result.text);
  if (!parsed?.reply?.body) {
    return { ok: false, error: "replier did not return parseable JSON or body" };
  }

  // Append the support_reply_block as a new Section on the document
  const nextOrd = ctx.sections.length;
  const { data: insertedReply, error: insertError } = await supabase
    .from("sections")
    .insert({
      document_id: input.documentId,
      kind: "support_reply_block",
      ord: nextOrd,
      content: {
        subject: parsed.reply.subject?.trim() ?? "",
        body: parsed.reply.body.trim(),
        send_when_approved: parsed.reply.send_when_approved !== false,
      } as Json,
    })
    .select("id")
    .single();
  if (insertError || !insertedReply) {
    return {
      ok: false,
      error: insertError?.message ?? "reply section insert failed",
    };
  }

  // Append any new agent_notes after the reply
  if (Array.isArray(parsed.agent_notes)) {
    let ord = nextOrd + 1;
    for (const note of parsed.agent_notes) {
      if (!note.question || !note.decision) continue;
      await supabase.from("sections").insert({
        document_id: input.documentId,
        kind: "agent_note",
        ord,
        content: {
          question: note.question.trim(),
          decision: note.decision.trim(),
          ...(note.alternatives ? { alternatives: note.alternatives.trim() } : {}),
        } as Json,
      });
      ord += 1;
    }
  }

  return {
    ok: true,
    loopRunId,
    sectionId: insertedReply.id,
  };
}

export type SupportSection = SectionRow;
