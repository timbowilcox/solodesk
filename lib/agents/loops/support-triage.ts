import "server-only";

import {
  CHEAP_MODEL,
  extractJson,
  runAgent,
} from "@/lib/agents/anthropic";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import { createDocument, type SectionSeed } from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

import { runSupportReplier } from "./support-replier";

const TRIAGE_SYSTEM = `Classify a single inbound support ticket. Fast, cheap, single-shot.

Hard rules:
- One venture only.
- Classification only — don't draft a reply.
- Be conservative on churn_risk. Reserve for explicit cancellation language or unmistakable signals.
- If unsure, return unclear.

Classes:
- bug — software misbehaving relative to documented behaviour
- question — user wants help understanding a feature
- churn_risk — explicit cancellation, billing dispute escalation, sustained dissatisfaction
- feature_request — asking for behaviour that doesn't exist
- spam — sales pitch, automated marketing, irrelevant
- unclear — can't classify confidently

Urgency:
- low — informational, no action this week
- medium — reply within 24-48h
- high — within 4h. Reserved for: production-down bugs, churn signals, security/safety mentions

Output contract — return ONLY a JSON object:

{
  "classification": "bug" | "question" | "churn_risk" | "feature_request" | "spam" | "unclear",
  "urgency": "low" | "medium" | "high",
  "reasoning": "1-2 sentences. Why this class, why this urgency.",
  "needs_reply": true | false,
  "ambiguities": ["Things you would have asked the user if you could."]
}

Anti-patterns: no long reasoning, no draft text in reasoning, no mention of being an AI.`;

const TRIAGE_BUDGET_TOKENS = 4_000;
const TRIAGE_BUDGET_CENTS = 5;

export type SupportClassification =
  | "bug"
  | "question"
  | "churn_risk"
  | "feature_request"
  | "spam"
  | "unclear";

export type SupportUrgency = "low" | "medium" | "high";

export type RunSupportTriageInput = {
  ventureSlug: string;
  fromAddress?: string;
  subject?: string;
  body: string;
};

export type RunSupportTriageResult =
  | {
      ok: true;
      documentId: string;
      classification: SupportClassification;
      urgency: SupportUrgency;
      needsReply: boolean;
      replierLoopRunId?: string;
    }
  | { ok: false; error: string };

type TriageJsonShape = {
  classification?: SupportClassification;
  urgency?: SupportUrgency;
  reasoning?: string;
  needs_reply?: boolean;
  ambiguities?: string[];
};

export async function runSupportTriage(
  input: RunSupportTriageInput,
): Promise<RunSupportTriageResult> {
  const venture = await getVentureBySlug(input.ventureSlug);
  if (!venture) return { ok: false, error: "venture not found" };

  const supabase = createSupabaseAdminClient();
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: "support-triage",
      venture_id: venture.id,
      trigger: "manual",
      input: {
        from: input.fromAddress ?? null,
        subject: input.subject ?? null,
      } as Json,
      status: "running",
      budget_tokens: TRIAGE_BUDGET_TOKENS,
      budget_cents: TRIAGE_BUDGET_CENTS,
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
    `From: ${input.fromAddress ?? "(unknown)"}`,
    input.subject ? `Subject: ${input.subject}` : "",
    "",
    "Body:",
    input.body,
  ]
    .filter(Boolean)
    .join("\n");

  const composed = await buildAgentPrompt({
    skill: "support-triage",
    ventureId: venture.id,
    task: taskPayload,
    systemSkillPrompt: TRIAGE_SYSTEM,
    budgetTokens: TRIAGE_BUDGET_TOKENS,
  });

  const result = await runAgent({
    loopRunId,
    skill: "support-triage",
    ventureId: venture.id,
    systemPrompt: composed.systemPrompt,
    userMessage: composed.userMessage,
    budgetTokens: TRIAGE_BUDGET_TOKENS,
    budgetCents: TRIAGE_BUDGET_CENTS,
    model: CHEAP_MODEL,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<TriageJsonShape>(result.text);
  if (!parsed?.classification || !parsed.urgency) {
    return { ok: false, error: "triage did not return parseable JSON" };
  }

  const classification = parsed.classification;
  const urgency = parsed.urgency;
  const needsReply = parsed.needs_reply !== false;

  const sections: SectionSeed[] = [];

  // 1. Original message (read-only, prose)
  const originalMessage = [
    input.fromAddress ? `From: ${input.fromAddress}` : "",
    input.subject ? `Subject: ${input.subject}` : "",
    "",
    input.body,
  ]
    .filter(Boolean)
    .join("\n");
  sections.push({
    kind: "prose",
    content: { text: originalMessage },
  });

  // 2. agent_note with classification + reasoning
  sections.push({
    kind: "agent_note",
    content: {
      question: `Classification: ${classification} · urgency: ${urgency} · needs reply: ${needsReply ? "yes" : "no"}`,
      assumption: parsed.reasoning ?? "(no reasoning provided)",
      decision: "",
      alternatives:
        parsed.ambiguities && parsed.ambiguities.length > 0
          ? parsed.ambiguities.join(" · ")
          : undefined,
    },
  });

  const created = await createDocument({
    ventureId: venture.id,
    type: "support_ticket",
    title: input.subject?.trim()
      ? `Support — ${input.subject.trim().slice(0, 100)}`
      : `Support ticket — ${formatDate(new Date())}`,
    loopName: "support-triage",
    sections,
    metadata: {
      loop_run_id: loopRunId,
      classification,
      urgency,
      needs_reply: needsReply,
      from_address: input.fromAddress ?? null,
      subject: input.subject ?? null,
    },
  });
  if (!created.ok) return { ok: false, error: created.error };

  await supabase
    .from("loop_runs")
    .update({
      input: {
        from: input.fromAddress ?? null,
        subject: input.subject ?? null,
        document_id: created.documentId,
        classification,
        urgency,
      } as Json,
    })
    .eq("id", loopRunId);

  // Fire the replier in the background if a reply is needed.
  let replierLoopRunId: string | undefined;
  if (needsReply && classification !== "spam") {
    const replierResult = await runSupportReplier({
      ventureSlug: input.ventureSlug,
      documentId: created.documentId,
      classification,
      urgency,
    }).catch((e) => {
      console.error(
        "[support-triage] replier failed",
        e instanceof Error ? e.message : e,
      );
      return { ok: false, error: "replier crashed" } as const;
    });
    if (replierResult.ok) {
      replierLoopRunId = replierResult.loopRunId;
    }
  }

  return {
    ok: true,
    documentId: created.documentId,
    classification,
    urgency,
    needsReply,
    replierLoopRunId,
  };
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
