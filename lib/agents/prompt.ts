import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recallContext, type MemoryHit } from "@/lib/memory/recall";

// Sub-budget breakdown (in tokens). Anything over its slice gets truncated
// with a marker. The skill system prompt never truncates — if it doesn't fit,
// the skill is misdesigned.
const SKILL_BUDGET = 2_000;
const COMPANY_BUDGET = 3_000;
const RECALL_BUDGET = 4_000;

const CHARS_PER_TOKEN = 4;
const TRUNCATION_MARKER = "\n\n[…truncated…]";

export type BuildAgentPromptOptions = {
  skill: string;
  ventureId: string;
  task: string;
  systemSkillPrompt: string;
  budgetTokens: number;
};

export type BuildAgentPromptResult = {
  systemPrompt: string;
  userMessage: string;
  citations: MemoryHit[];
  tokensUsed: {
    skill: number;
    company: number;
    recall: number;
    task: number;
  };
};

function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function truncateToTokens(text: string, maxTokens: number): string {
  if (approxTokens(text) <= maxTokens) return text;
  const maxChars = maxTokens * CHARS_PER_TOKEN - TRUNCATION_MARKER.length;
  return text.slice(0, Math.max(0, maxChars)) + TRUNCATION_MARKER;
}

function formatHit(hit: MemoryHit, idx: number): string {
  const meta = JSON.stringify(hit.metadata).slice(0, 200);
  return `[${idx + 1}] (${hit.table} ${hit.id.slice(0, 8)}, similarity ${hit.similarity.toFixed(3)}) ${hit.text}\n     meta: ${meta}`;
}

/**
 * Compose an agent prompt from venture-scoped context. Every loop's
 * invocation goes through this function; manual prompt construction is a
 * documented anti-pattern in CLAUDE.md.
 *
 * Composition order:
 *   1. Skill system prompt (verbatim, no truncation)
 *   2. Top-3 venture_chunks for COMPANY.md context (semantic match)
 *   3. Top-5 recall hits across decisions/artifacts/memories
 *   4. The task itself
 *
 * Hard rule: ventureId required. recallContext enforces venture isolation
 * at the SQL layer.
 */
export async function buildAgentPrompt(
  opts: BuildAgentPromptOptions,
): Promise<BuildAgentPromptResult> {
  if (!opts.ventureId) throw new Error("buildAgentPrompt requires ventureId");
  if (!opts.systemSkillPrompt.trim()) {
    throw new Error("buildAgentPrompt requires non-empty systemSkillPrompt");
  }
  if (!opts.task.trim()) {
    throw new Error("buildAgentPrompt requires non-empty task");
  }

  const startedAt = Date.now();
  const skillTokens = approxTokens(opts.systemSkillPrompt);
  if (skillTokens > SKILL_BUDGET) {
    throw new Error(
      `skill prompt is ${skillTokens} tokens, exceeds ${SKILL_BUDGET}. Trim the SKILL.md.`,
    );
  }

  // Pull venture chunks via recall (asymmetric — query against task)
  const companyHits = await recallContext({
    ventureId: opts.ventureId,
    query: opts.task,
    k: 3,
    types: ["venture_chunks"],
    minSimilarity: 0.3,
  });
  const recallHits = await recallContext({
    ventureId: opts.ventureId,
    query: opts.task,
    k: 5,
    types: ["decisions", "artifacts", "memories"],
    minSimilarity: 0.5,
  });

  let companyBlock = "";
  if (companyHits.length > 0) {
    companyBlock = companyHits
      .map((h, i) => `[venture-context ${i + 1}] ${h.text}`)
      .join("\n\n");
    companyBlock = truncateToTokens(companyBlock, COMPANY_BUDGET);
  }

  let recallBlock = "";
  if (recallHits.length > 0) {
    recallBlock = recallHits.map((h, i) => formatHit(h, i)).join("\n\n");
    recallBlock = truncateToTokens(recallBlock, RECALL_BUDGET);
  }

  const companyTokens = approxTokens(companyBlock);
  const recallTokens = approxTokens(recallBlock);
  const remaining = Math.max(
    256,
    opts.budgetTokens - skillTokens - companyTokens - recallTokens,
  );
  const task = truncateToTokens(opts.task, remaining);
  const taskTokens = approxTokens(task);

  const systemPrompt = [
    opts.systemSkillPrompt,
    companyBlock
      ? `\n\n--- VENTURE CONTEXT (COMPANY.md, top semantic matches) ---\n${companyBlock}`
      : "",
    recallBlock
      ? `\n\n--- PRIOR ARTIFACTS (decisions / artifacts / memories, top matches) ---\n${recallBlock}`
      : "",
  ]
    .join("")
    .trim();

  const userMessage = task;

  // Citations: combine all hits so the agent can reference [1], [2], … by id.
  const citations = [...companyHits, ...recallHits];

  // Observability
  const supabase = createSupabaseAdminClient();
  await supabase.from("loop_runs").insert({
    loop_name: `memory:prompt:${opts.skill}`,
    venture_id: opts.ventureId,
    trigger: "build",
    input: {
      task: opts.task.slice(0, 200),
      budget_tokens: opts.budgetTokens,
    },
    status: "succeeded",
    tokens_in: skillTokens + companyTokens + recallTokens + taskTokens,
    tokens_out: 0,
    cost_cents: 0,
    duration_ms: Date.now() - startedAt,
    budget_tokens: opts.budgetTokens,
    budget_cents: null,
    model: null,
    error_message: null,
  });

  return {
    systemPrompt,
    userMessage,
    citations,
    tokensUsed: {
      skill: skillTokens,
      company: companyTokens,
      recall: recallTokens,
      task: taskTokens,
    },
  };
}
