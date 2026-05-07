import "server-only";

import { runAgent, extractJson } from "@/lib/agents/anthropic";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import { createDocument, type SectionSeed } from "@/lib/db/documents";
import { getVentureBySlug } from "@/lib/db/ventures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const SYSTEM_PROMPT = `You draft content for one venture's audience. The operator brings a brief (channel, audience hint, CTA, freeform notes); you produce a draft that matches the venture's voice as established in its COMPANY.md.

Hard rules:
1. One venture only. Voice, audience, anti-patterns from this venture's COMPANY.md and prior content. No cross-venture leakage.
2. No marketing voice. Default to plain, declarative, specific. The reader is sophisticated and short on time. No "Game-changer." No "delighted to announce." No emoji.
3. Channel-aware. Email is direct. X is short, one claim. LinkedIn allows a slightly longer setup but never inspirational. Voice stays the same; format adjusts.
4. No subject pretending. Don't write hooks that imply something the body doesn't deliver.
5. No fake urgency.

Channel cues:
- email — Subject line + body. Subject is concrete (≤72 chars). Body is direct, paragraph-style.
- x — Single post or thread. 2-6 posts max. Hook is the first claim, not a question.
- linkedin — Hook + 2-4 paragraphs + soft CTA.
- blog — Title + 3-7 paragraphs.

Output contract — return ONLY a JSON object:

{
  "title": "Internal title for the document",
  "channel": "email" | "x" | "linkedin" | "blog",
  "draft": {
    "subject": "Email subject only; omit for non-email channels",
    "body": "The full draft. Plain text. \\n\\n between paragraphs. For X threads, posts separated by '\\n\\n---\\n\\n'.",
    "audience": "1-line restatement of who this is for",
    "cta": "1-line restatement of what you want them to do, if any"
  },
  "agent_notes": [
    {
      "question": "Voice / audience ambiguity you resolved.",
      "decision": "What you chose.",
      "alternatives": "What other readings would have changed the draft."
    }
  ]
}

Anti-patterns: no "I'm excited to" / "thrilled to" / "delighted to". No three-adjective stacks. No question-pretend hooks. No fake numbers. No emoji. No exclamation marks. No mention of being an AI.`;

const BUDGET_TOKENS = 15_000;
const BUDGET_CENTS = 30;

export type RunContentWriterInput = {
  ventureSlug: string;
  channel: "email" | "x" | "linkedin" | "blog";
  brief: string;
  audienceHint?: string;
  ctaHint?: string;
};

export type RunContentWriterResult =
  | {
      ok: true;
      documentId: string;
      loopRunId: string;
      tokensUsed: number;
      costCents: number;
    }
  | { ok: false; error: string };

type AgentJsonShape = {
  title?: string;
  channel?: "email" | "x" | "linkedin" | "blog";
  draft?: {
    subject?: string;
    body?: string;
    audience?: string;
    cta?: string;
  };
  agent_notes?: Array<{
    question?: string;
    decision?: string;
    alternatives?: string;
  }>;
};

export async function runContentWriter(
  input: RunContentWriterInput,
): Promise<RunContentWriterResult> {
  const venture = await getVentureBySlug(input.ventureSlug);
  if (!venture) return { ok: false, error: "venture not found" };

  const supabase = createSupabaseAdminClient();
  const { data: runRow, error: runError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: "content-writer",
      venture_id: venture.id,
      trigger: "manual",
      input: {
        channel: input.channel,
        brief: input.brief.slice(0, 500),
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
    `Channel: ${input.channel}`,
    input.audienceHint ? `Audience hint: ${input.audienceHint}` : "",
    input.ctaHint ? `CTA hint: ${input.ctaHint}` : "",
    "",
    "Brief:",
    input.brief,
  ]
    .filter(Boolean)
    .join("\n");

  let composed: Awaited<ReturnType<typeof buildAgentPrompt>>;
  try {
    composed = await buildAgentPrompt({
      skill: "content-writer",
      ventureId: venture.id,
      task: taskPayload,
      systemSkillPrompt: SYSTEM_PROMPT,
      budgetTokens: BUDGET_TOKENS,
    });
  } catch (e) {
    await markFailed(loopRunId, e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "prompt build failed",
    };
  }

  const result = await runAgent({
    loopRunId,
    skill: "content-writer",
    ventureId: venture.id,
    systemPrompt: composed.systemPrompt,
    userMessage: composed.userMessage,
    budgetTokens: BUDGET_TOKENS,
    budgetCents: BUDGET_CENTS,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = extractJson<AgentJsonShape>(result.text);
  if (!parsed?.draft?.body) {
    await markFailed(loopRunId, new Error("agent did not return draft body"));
    return { ok: false, error: "agent did not return parseable JSON or body" };
  }

  const channel = parsed.channel ?? input.channel;
  const sections: SectionSeed[] = [];

  // 1. Brief as prose Section (Tim-authored, frozen at submit time)
  sections.push({
    kind: "prose",
    content: { text: `Brief — ${input.channel}\n\n${input.brief}` },
  });

  // 2. The draft itself
  sections.push({
    kind: "content_block",
    content: {
      channel,
      subject: parsed.draft.subject?.trim() || undefined,
      body: parsed.draft.body.trim(),
      audience: parsed.draft.audience?.trim() || input.audienceHint || undefined,
      cta: parsed.draft.cta?.trim() || input.ctaHint || undefined,
    },
  });

  // 3. agent_notes if present
  if (Array.isArray(parsed.agent_notes)) {
    for (const note of parsed.agent_notes) {
      if (!note.question || !note.decision) continue;
      sections.push({
        kind: "agent_note",
        content: {
          question: note.question.trim(),
          decision: note.decision.trim(),
          ...(note.alternatives ? { alternatives: note.alternatives.trim() } : {}),
        },
      });
    }
  }

  const created = await createDocument({
    ventureId: venture.id,
    type: "content",
    title:
      parsed.title?.trim() ||
      `${channel.charAt(0).toUpperCase()}${channel.slice(1)} draft — ${formatDate(new Date())}`,
    loopName: "content-writer",
    sections,
    metadata: {
      loop_run_id: loopRunId,
      generator_skill: "content-writer",
      channel,
      brief: input.brief.slice(0, 500),
    },
  });
  if (!created.ok) {
    await markFailed(loopRunId, new Error(created.error));
    return { ok: false, error: created.error };
  }

  await supabase
    .from("loop_runs")
    .update({
      input: {
        channel,
        brief: input.brief.slice(0, 500),
        document_id: created.documentId,
      } as Json,
    })
    .eq("id", loopRunId);

  return {
    ok: true,
    documentId: created.documentId,
    loopRunId,
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
    costCents: result.usage.cents,
  };
}

async function markFailed(loopRunId: string, e: unknown): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("loop_runs")
    .update({
      status: "failed",
      error_message: e instanceof Error ? e.message : "unknown",
    })
    .eq("id", loopRunId);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
