import "server-only";

// The Loop scheduler substrate — Sprint 2 deliverable per ROADMAP.md.
// Loops register a typed schedule here. The cron endpoints under
// /api/cron/<schedule-id> dispatch into runSchedule() which logs to
// loop_runs and isolates failures per invocation.
//
// New scheduled Loops add a Schedule entry here + a vercel.json cron
// entry pointing at /api/cron/<id>. Per-venture scopes fan out to one
// invocation per active venture; global scopes fire once.

export type ScheduleScope = "per-venture" | "global";

export type ScheduleContext = {
  /** loop_runs row id created by the runner before invocation. */
  loopRunId: string;
  /** Set when scope is 'per-venture'. Undefined for 'global'. */
  ventureId?: string;
  ventureSlug?: string;
};

export type ScheduleRunner = (ctx: ScheduleContext) => Promise<{
  ok: boolean;
  summary: string;
  metadata?: Record<string, unknown>;
}>;

export type Schedule = {
  /** Stable id used in /api/cron/<id> and loop_runs.loop_name. */
  id: string;
  /** Human-readable cadence description. The actual firing schedule
   *  lives in vercel.json — this is for the settings UI. */
  cron: string;
  description: string;
  scope: ScheduleScope;
  budgetTokens?: number;
  budgetCents?: number;
  run: ScheduleRunner;
};

// Lazy registration so tests can import this module without pulling in
// downstream dependencies.
const REGISTRY = new Map<string, Schedule>();

export function registerSchedule(schedule: Schedule): void {
  if (REGISTRY.has(schedule.id)) {
    throw new Error(`schedule already registered: ${schedule.id}`);
  }
  REGISTRY.set(schedule.id, schedule);
}

export function getSchedule(id: string): Schedule | undefined {
  return REGISTRY.get(id);
}

export function listSchedules(): Schedule[] {
  return Array.from(REGISTRY.values());
}

export function clearRegistryForTests(): void {
  REGISTRY.clear();
}
