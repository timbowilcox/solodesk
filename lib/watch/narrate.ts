// narrate.ts — pure function turning an Event row into a Watch narrative.
//
// One responsibility: (event, ventureName) -> string. No DB calls, no
// fetches, no React. Lives at this seam so the Watch component stays a
// thin renderer.
//
// Per design-system.md ambient-motion + experience-layer-doc-updates.md
// bright lines: internal Loop activity (agent generating, critic reviewing,
// Document state transitions) is OBSERVATION, not communication. Narrative
// strings reflect that — they describe what happened, not what to do.
//
// Unknown event types fall back to a generic "Activity in {venture}"
// rather than throwing. The Watch must render every event the realtime
// stream delivers, even ones the formatter hasn't been taught about.

export type EventForNarration = {
  type: string;
  source: string;
  payload: Record<string, unknown> | null;
};

export type NarrationContext = {
  ventureName: string;
};

/**
 * Render a Watch narrative for a single event. Pure: same input -> same
 * output. No side effects.
 */
export function narrateEvent(
  event: EventForNarration,
  ctx: NarrationContext,
): string {
  const venture = ctx.ventureName;
  const payload = event.payload ?? {};

  switch (event.type) {
    // ---- Document lifecycle (Sprint 1.1+) ----
    case "document.created":
      return `Drafting ${pickString(payload, "type", "a document")} in ${venture}.`;
    case "document.section_streamed": {
      const section = pickString(payload, "section_kind", "Section");
      return `${capitalise(section)} section ready in ${venture}.`;
    }
    case "document.queued_for_review":
      return `Document queued for review in ${venture}. See The Day.`;
    case "document.approved":
      return `${capitalise(pickString(payload, "type", "Document"))} approved in ${venture}.`;
    case "document.rejected":
      return `${capitalise(pickString(payload, "type", "Document"))} rejected in ${venture}.`;
    case "document.published":
      return `${capitalise(pickString(payload, "type", "Document"))} published in ${venture}.`;

    // ---- Section / agent_note ----
    case "agent_note.opened": {
      const section = pickString(payload, "section_kind", "section");
      return `Critic raised a note on ${section} in ${venture}.`;
    }
    case "agent_note.resolved":
      return `Critic note resolved in ${venture}.`;

    // ---- Loop runs ----
    case "loop.invoked": {
      const loop = pickString(payload, "loop_name", "loop");
      return `Watching ${venture} ${humaniseLoop(loop)}.`;
    }
    case "loop.succeeded": {
      const loop = pickString(payload, "loop_name", "loop");
      return `${capitalise(humaniseLoop(loop))} completed in ${venture}.`;
    }
    case "loop.failed": {
      const loop = pickString(payload, "loop_name", "loop");
      return `${capitalise(humaniseLoop(loop))} failed in ${venture}.`;
    }
    case "loop.blown_budget": {
      const loop = pickString(payload, "loop_name", "loop");
      return `${capitalise(humaniseLoop(loop))} blew budget in ${venture}.`;
    }

    // ---- Connections ----
    case "connection.event":
    case "connection.fetched":
    case "connection.rotated": {
      const provider = pickString(payload, "provider", event.source);
      const summary = pickString(payload, "summary", "");
      const tail = summary ? `: ${summary}` : "";
      return `${capitalise(provider)} event received in ${venture}${tail}.`;
    }

    // ---- Anomalies ----
    case "anomaly.detected": {
      const metric = pickString(payload, "metric_name", "metric");
      return `${capitalise(metric)} anomaly detected in ${venture}. Investigating.`;
    }
    case "anomaly.explained":
      return `Anomaly explained in ${venture}.`;
    case "anomaly.dismissed":
      return `Anomaly dismissed in ${venture}.`;

    // ---- Support ----
    case "support.ticket_created":
      return `Support ticket received in ${venture}.`;
    case "support.ticket_classified": {
      const cls = pickString(payload, "classification", "ticket");
      return `Support ticket classified as ${cls} in ${venture}.`;
    }
    case "support.reply_sent":
      return `Support reply sent in ${venture}.`;

    // ---- Memories ----
    case "memory.added":
      return `Memory recorded in ${venture}.`;

    // ---- Manual / fallback ----
    case "note":
    case "manual":
      return `Note in ${venture}.`;
  }

  // Unknown event type — never throw. The Watch renders something even
  // when the formatter is behind.
  return `Activity in ${venture}.`;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function pickString(
  payload: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const v = payload[key];
  if (typeof v === "string" && v.trim().length > 0) return v;
  return fallback;
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Map a loop name (e.g. "01-strategy", "08-metrics-digest") to a domain word.
 * Best-effort; falls through to the raw name when nothing matches.
 */
function humaniseLoop(loop: string): string {
  if (loop.includes("strategy")) return "strategy";
  if (loop.includes("metrics") || loop.includes("digest")) return "metrics";
  if (loop.includes("content")) return "content";
  if (loop.includes("intel")) return "intel";
  if (loop.includes("support")) return "customer support";
  if (loop.includes("compliance")) return "compliance";
  if (loop.includes("portfolio")) return "portfolio audit";
  return loop;
}
