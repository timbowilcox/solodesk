// lib/atrium/types.ts
// Client-side modal event types for the Atrium modal system.

import type { ModalArchetype } from "@/lib/autonomy/types";

export type { ModalArchetype };

export type ModalPriority = "high" | "normal";

export type AtriumModalEvent = {
  id: string;           // modal_events.id
  archetype: ModalArchetype;
  scopeId: string;
  scopeType: string;
  actionId: string | null;
  firedAt: string;
  meta?: Record<string, unknown>;  // archetype-specific display data
};

export type AtriumModalAction = {
  label: string;
  shortcut?: "1" | "2" | "3";
  variant: "primary" | "secondary" | "tertiary" | "destructive";
  onAction: () => void | Promise<void>;
};

export type AtriumModalConfig = {
  event: AtriumModalEvent;
  headline: string;
  context: string;
  body: React.ReactNode;
  actions: AtriumModalAction[];
  dismissable: boolean;
  priority: ModalPriority;
};

// Frequency budget ceilings per archetype per period.
export type FrequencyPeriod = "day" | "week";

export type FrequencyBudget = {
  archetype: ModalArchetype;
  period: FrequencyPeriod;
  ceiling: number | null;  // null = no ceiling
};

export const FREQUENCY_BUDGETS: FrequencyBudget[] = [
  { archetype: "decision",   period: "day",  ceiling: 30 },
  { archetype: "brief",      period: "day",  ceiling: 3 },
  { archetype: "insight",    period: "week", ceiling: 7 },
  { archetype: "alert",      period: "week", ceiling: 10 },
  { archetype: "completion", period: "day",  ceiling: 15 },
  { archetype: "question",   period: "week", ceiling: 7 },
  { archetype: "promotion",  period: "week", ceiling: 3 },
  { archetype: "escalation", period: "week", ceiling: null },
];

// High-priority archetypes jump the queue.
export const HIGH_PRIORITY_ARCHETYPES: ModalArchetype[] = ["escalation", "alert"];

export function getModalPriority(archetype: ModalArchetype): ModalPriority {
  return HIGH_PRIORITY_ARCHETYPES.includes(archetype) ? "high" : "normal";
}
