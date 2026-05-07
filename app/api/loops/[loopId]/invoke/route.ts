import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireUserContext } from "@/lib/auth/guard";
import { canAccessVenture } from "@/lib/auth/membership";
import { LOOP1_STRATEGY_SKILL_PROMPT } from "@/lib/loops/skills/loop1-strategy";
import {
  runStreamingLoop,
  type SseEvent,
} from "@/lib/loops/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streaming Loop invocation endpoint. Returns text/event-stream.
//
// Bright lines kept here:
//   - venture access verified via canAccessVenture (membership)
//   - request validated with Zod
//   - runner is the only path to streaming output
//
// loopId is the route segment, currently only '01-strategy' is wired.
// Adding a Loop = registering its skill prompt + budgets in this file
// (mapped via SUPPORTED_LOOPS below) and shipping its conversation
// surface route.

const inputSchema = z.object({
  ventureId: z.string().uuid(),
  task: z.string().min(1).max(8_000),
  /** Optional thread id for Loop 1 conversation persistence. */
  threadId: z.string().uuid().nullish(),
  /** Document title — short label shown in the Bridge tile and Day. */
  title: z.string().min(1).max(120),
});

const SUPPORTED_LOOPS: Record<
  string,
  {
    loopName: string;
    skillPrompt: string;
    documentType: "decision" | "content" | "intel_digest";
    budgetTokens: number;
    budgetCents: number;
  }
> = {
  "01-strategy": {
    loopName: "01-strategy",
    skillPrompt: LOOP1_STRATEGY_SKILL_PROMPT,
    documentType: "decision",
    budgetTokens: 25_000,
    budgetCents: 75,
  },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ loopId: string }> },
) {
  const { loopId } = await params;
  const config = SUPPORTED_LOOPS[loopId];
  if (!config) {
    return NextResponse.json({ error: "unknown loopId" }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const user = await requireUserContext();
  const allowed = await canAccessVenture({
    userId: user.userId,
    isAdmin: user.isAdmin,
    ventureId: parsed.data.ventureId,
  });
  if (!allowed) {
    return NextResponse.json({ error: "venture not accessible" }, { status: 404 });
  }

  // SSE response. We construct a ReadableStream that the runner writes
  // through `emit`. The runner's `await for` over the Anthropic stream
  // suspends naturally; we wrap that in an async IIFE so the response
  // returns immediately.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: SseEvent) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // Run the streaming Loop. When it returns, close the SSE stream.
      void (async () => {
        try {
          await runStreamingLoop(
            {
              loopName: config.loopName,
              loopId,
              ventureId: parsed.data.ventureId,
              documentType: config.documentType,
              documentTitle: parsed.data.title,
              systemSkillPrompt: config.skillPrompt,
              task: parsed.data.task,
              budgetTokens: config.budgetTokens,
              budgetCents: config.budgetCents,
              threadId: parsed.data.threadId ?? undefined,
            },
            emit,
          );
        } catch (e) {
          const reason = e instanceof Error ? e.message : "runner failed";
          emit({ type: "error", runId: "", reason });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
