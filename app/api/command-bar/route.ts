import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireUserContext } from "@/lib/auth/guard";
import {
  listVisibleVentures,
  type UserContext,
} from "@/lib/auth/membership";
import { listVentures } from "@/lib/db/ventures";
import { loadDayItems } from "@/lib/db/day";
import { routeCommand, type CommandIntent } from "@/lib/command-bar/router";
import { triggerLoop8FromManual } from "@/lib/loops/loop-8/triggers";
import { recallContext } from "@/lib/memory/recall";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Command-bar SSE endpoint. Each query becomes a stream of frames:
//   data: { kind: "intent", intent }
//   data: { kind: "text", text }   (one or more)
//   data: { kind: "link", title, href }   (optional, e.g. to Documents)
//   data: { kind: "done" }
//   data: { kind: "error", reason }
//
// Bright lines:
//   - membership scoping happens at routeCommand() (the visible list is
//     passed in; the router never widens). Routes returning `no_access`
//     short-circuit to a graceful response without invoking any Loop.
//   - All loop invocations go through buildAgentPrompt indirectly via
//     triggerLoop8FromManual -> triggerLoop8 -> runStreamingLoop.

const inputSchema = z.object({
  query: z.string().min(1).max(2_000),
});

type CommandBarFrame =
  | { kind: "intent"; intent: CommandIntent }
  | { kind: "text"; text: string }
  | { kind: "link"; title: string; href: string }
  | { kind: "done" }
  | { kind: "error"; reason: string };

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const user = await requireUserContext();
  const visibility = await listVisibleVentures({
    userId: user.userId,
    isAdmin: user.isAdmin,
  });
  const allVentures = await listVentures();
  const visibleVentures = visibility.isAdmin
    ? allVentures
    : allVentures.filter((v) =>
        (visibility.ventureIds ?? []).includes(v.id),
      );

  const intent = routeCommand({
    query: parsed.data.query,
    visibleVentures: visibleVentures.map((v) => ({
      ventureId: v.id,
      slug: v.slug,
      name: v.name,
    })),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: CommandBarFrame) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(frame)}\n\n`),
        );
      };

      void (async () => {
        try {
          send({ kind: "intent", intent });
          await dispatch(intent, parsed.data.query, send, user);

          // Audit: write a Watch entry on completion. Skip for clarify /
          // no_access (those didn't really "happen").
          if (intent.kind !== "clarify" && intent.kind !== "no_access") {
            const ventureId =
              "venture" in intent && intent.venture
                ? intent.venture.ventureId
                : null;
            await writeAuditEvent({
              ventureId,
              query: parsed.data.query,
              intent,
            });
          }
          send({ kind: "done" });
        } catch (e) {
          const reason = e instanceof Error ? e.message : "command bar failed";
          send({ kind: "error", reason });
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

async function dispatch(
  intent: CommandIntent,
  rawQuery: string,
  send: (frame: CommandBarFrame) => void,
  user: UserContext,
): Promise<void> {
  switch (intent.kind) {
    case "curate_day": {
      const items = await loadDayItems(user);
      if (items.length === 0) {
        send({ kind: "text", text: "All clear. The day is closed." });
        return;
      }
      send({
        kind: "text",
        text: `${items.length} item${items.length === 1 ? "" : "s"} need your attention:`,
      });
      for (const item of items.slice(0, 10)) {
        send({
          kind: "link",
          title: `${item.ventureName} — ${item.title}`,
          href: item.href,
        });
      }
      return;
    }

    case "decisions_search": {
      const ventureScope = intent.venture?.ventureId;
      if (!ventureScope) {
        // No venture scope means cross-venture; the substrate doesn't yet
        // accept a cross-venture sentinel (deferred per Sprint 11 SPRINT.md).
        send({
          kind: "text",
          text: "Cross-venture decisions search isn't available yet. Try naming a venture: \"What did I decide about pricing in Kounta?\"",
        });
        return;
      }
      const hits = await recallContext({
        ventureId: ventureScope,
        query: intent.query,
        k: 5,
        types: ["decisions"],
        minSimilarity: 0.4,
      });
      if (hits.length === 0) {
        send({ kind: "text", text: "No prior decisions matched." });
        return;
      }
      send({
        kind: "text",
        text: `${hits.length} prior decision${hits.length === 1 ? "" : "s"} matched:`,
      });
      for (const hit of hits) {
        const title = hit.metadata && typeof (hit.metadata as Record<string, unknown>).document_title === "string"
          ? ((hit.metadata as Record<string, unknown>).document_title as string)
          : (hit.text.split("\n")[0] ?? "Decision");
        const href = `/ventures/${intent.venture?.slug ?? ""}/decisions/${hit.id}`;
        send({ kind: "link", title, href });
      }
      return;
    }

    case "venture_synthesise": {
      // Lightweight synthesis: pull the latest 5 events + 3 pending docs
      // for the venture and assemble a plain-text summary. No LLM call
      // for v1; just a fact summary. Keeps latency low and cost zero.
      const supabase = createSupabaseAdminClient();
      const sinceIso = new Date(
        Date.now() - (intent.window === "week" ? 7 : 1) * 24 * 60 * 60 * 1000,
      ).toISOString();
      const [{ data: events }, { data: docs }] = await Promise.all([
        supabase
          .from("events")
          .select("ts, type, source")
          .eq("venture_id", intent.venture.ventureId)
          .gte("ts", sinceIso)
          .order("ts", { ascending: false })
          .limit(10),
        supabase
          .from("documents")
          .select("id, title, type, status")
          .eq("venture_id", intent.venture.ventureId)
          .in("status", ["draft", "reviewing", "drafting"])
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      const eCount = events?.length ?? 0;
      const dCount = docs?.length ?? 0;
      const window = intent.window === "week" ? "this week" : "today";
      send({
        kind: "text",
        text: `${intent.venture.name} ${window}: ${eCount} event${eCount === 1 ? "" : "s"}, ${dCount} pending document${dCount === 1 ? "" : "s"}.`,
      });
      for (const d of docs ?? []) {
        send({
          kind: "link",
          title: `${capitalise(d.type as string)} · ${d.title} · ${d.status}`,
          href: `/ventures/${intent.venture.slug}`,
        });
      }
      return;
    }

    case "loop8_investigate": {
      send({
        kind: "text",
        text: `Investigating ${intent.venture.name}…`,
      });
      const result = await triggerLoop8FromManual({
        ventureId: intent.venture.ventureId,
        question: intent.question,
        metricHint: intent.metricHint,
      });
      if (!result.ok) {
        send({ kind: "error", reason: result.error });
        return;
      }
      if (result.documentId) {
        send({
          kind: "text",
          text: "Loop 8 produced a Document. See your Documents.",
        });
        send({
          kind: "link",
          title: "Open Document",
          href: `/ventures/${intent.venture.slug}/decisions/${result.documentId}`,
        });
      } else {
        send({
          kind: "text",
          text: "An identical investigation is already in progress (deduplicated).",
        });
      }
      return;
    }

    case "no_access": {
      send({
        kind: "text",
        text: `I don't have access to "${intent.ventureName}" for you.`,
      });
      return;
    }

    case "clarify": {
      send({
        kind: "text",
        text: `${intent.reason} Try one of: "Show me everything that needs my attention", "What's happening with <venture> today", "Why did <venture> <metric> drop?", "What did I decide about <topic>".`,
      });
      return;
    }
  }

  // Should be unreachable
  void rawQuery;
}

async function writeAuditEvent(opts: {
  ventureId: string | null;
  query: string;
  intent: CommandIntent;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await supabase.from("events").insert({
    source: "command-bar",
    type: "command_bar.query",
    venture_id: opts.ventureId,
    payload: {
      query: opts.query,
      intent_kind: opts.intent.kind,
    } as Json,
  });
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
