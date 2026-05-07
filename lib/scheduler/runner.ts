import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listVentures } from "@/lib/db/ventures";
import type { Json } from "@/lib/supabase/types";

import {
  getSchedule,
  type Schedule,
  type ScheduleContext,
} from "./registry";

export type RunInvocation = {
  loopRunId: string;
  ventureId: string | null;
  ventureSlug: string | null;
  ok: boolean;
  summary: string;
  durationMs: number;
  error?: string;
};

export type RunReport = {
  scheduleId: string;
  startedAt: string;
  finishedAt: string;
  invocations: RunInvocation[];
  totalOk: number;
  totalFailed: number;
};

/**
 * Execute a schedule. For per-venture schedules, fans out across
 * `ventures` excluding `dormant` phase. Each invocation gets its own
 * loop_runs row created BEFORE the runner fires; failures are logged
 * but don't stop the next venture from running.
 */
export async function runSchedule(scheduleId: string): Promise<RunReport> {
  const schedule = getSchedule(scheduleId);
  if (!schedule) {
    throw new Error(`unknown schedule: ${scheduleId}`);
  }

  const startedAt = new Date();
  const invocations: RunInvocation[] = [];

  if (schedule.scope === "global") {
    invocations.push(await invokeOnce(schedule, null));
  } else {
    const ventures = await listVentures();
    const active = ventures.filter((v) => v.phase !== "dormant");
    for (const venture of active) {
      invocations.push(
        await invokeOnce(schedule, {
          id: venture.id,
          slug: venture.slug,
        }),
      );
    }
  }

  const totalOk = invocations.filter((i) => i.ok).length;
  const totalFailed = invocations.length - totalOk;
  return {
    scheduleId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    invocations,
    totalOk,
    totalFailed,
  };
}

async function invokeOnce(
  schedule: Schedule,
  venture: { id: string; slug: string } | null,
): Promise<RunInvocation> {
  const supabase = createSupabaseAdminClient();
  const startedAt = Date.now();

  // 1. Create loop_runs row BEFORE the runner fires (so even a runner
  //    crash leaves a trace)
  const { data: runRow, error: insertError } = await supabase
    .from("loop_runs")
    .insert({
      loop_name: schedule.id,
      venture_id: venture?.id ?? null,
      trigger: "schedule",
      input: {
        scope: schedule.scope,
        scheduled_cron: schedule.cron,
      },
      status: "running",
      tokens_in: 0,
      tokens_out: 0,
      cost_cents: 0,
      budget_tokens: schedule.budgetTokens ?? null,
      budget_cents: schedule.budgetCents ?? null,
    })
    .select("id")
    .single();

  if (insertError || !runRow) {
    return {
      loopRunId: "",
      ventureId: venture?.id ?? null,
      ventureSlug: venture?.slug ?? null,
      ok: false,
      summary: "loop_runs insert failed",
      durationMs: Date.now() - startedAt,
      error: insertError?.message ?? "unknown",
    };
  }
  const loopRunId = runRow.id;

  // 2. Execute the runner with full ctx
  const ctx: ScheduleContext = {
    loopRunId,
    ventureId: venture?.id,
    ventureSlug: venture?.slug,
  };

  let ok = false;
  let summary = "";
  let metadata: Record<string, unknown> | undefined;
  let error: string | undefined;

  try {
    const result = await schedule.run(ctx);
    ok = result.ok;
    summary = result.summary;
    metadata = result.metadata;
  } catch (e) {
    ok = false;
    summary = "runner threw";
    error = e instanceof Error ? e.message : "unknown";
  }

  // 3. Update loop_runs with final status + duration
  const durationMs = Date.now() - startedAt;
  const finalInput: Json = {
    scope: schedule.scope,
    scheduled_cron: schedule.cron,
    summary,
    ...(metadata ? { metadata: metadata as Json } : {}),
  };
  await supabase
    .from("loop_runs")
    .update({
      status: ok ? "succeeded" : "failed",
      duration_ms: durationMs,
      error_message: error ?? null,
      input: finalInput,
    })
    .eq("id", loopRunId);

  return {
    loopRunId,
    ventureId: venture?.id ?? null,
    ventureSlug: venture?.slug ?? null,
    ok,
    summary,
    durationMs,
    error,
  };
}
