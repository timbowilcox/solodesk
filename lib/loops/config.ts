// lib/loops/config.ts
//
// Shared loop configuration. Consumed by both the loop invocation route
// and the deferred-replay tool handler so replay has access to the same
// skill prompts and budgets without duplicating config.

import { LOOP1_STRATEGY_SKILL_PROMPT } from "@/lib/loops/skills/loop1-strategy";
import type { DocumentType } from "@/lib/supabase/types";

export type LoopConfig = {
  loopName: string;
  skillPrompt: string;
  documentType: DocumentType;
  budgetTokens: number;
  budgetCents: number;
};

export const SUPPORTED_LOOPS: Record<string, LoopConfig> = {
  "01-strategy": {
    loopName: "01-strategy",
    skillPrompt: LOOP1_STRATEGY_SKILL_PROMPT,
    documentType: "decision",
    budgetTokens: 25_000,
    budgetCents: 75,
  },
};
