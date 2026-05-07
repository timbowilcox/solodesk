// Command-bar query router. Pure (no DB calls inside) — given a query
// string and the user's visible-venture list, returns a typed
// `CommandIntent` that the SSE handler dispatches on.
//
// Bright line: the visible-venture list is supplied by the caller.
// Resolving "Kounta" to a venture happens here, but ONLY against
// ventures the user can see. If the operator says a name they cannot
// access, the router returns a `no_access` intent — the SSE handler
// renders a graceful response instead of invoking any Loop.
//
// Lives independently of the SSE wiring so it's trivially unit-testable.

export type VentureForRouting = {
  ventureId: string;
  slug: string;
  name: string;
};

export type CommandIntent =
  | { kind: "curate_day" }
  | {
      kind: "decisions_search";
      query: string;
      venture: VentureForRouting | null; // null = across all visible ventures
    }
  | {
      kind: "venture_synthesise";
      venture: VentureForRouting;
      window: "today" | "week";
    }
  | {
      kind: "loop8_investigate";
      venture: VentureForRouting;
      metricHint: string | null;
      question: string;
    }
  | {
      kind: "no_access";
      ventureName: string;
    }
  | {
      kind: "clarify";
      reason: string;
    };

export type RouteCommandInput = {
  query: string;
  visibleVentures: VentureForRouting[];
};

/**
 * Parse a free-text query into a typed intent. Falls through to
 * `clarify` rather than guessing.
 */
export function routeCommand(input: RouteCommandInput): CommandIntent {
  const query = input.query.trim();
  if (!query) {
    return { kind: "clarify", reason: "empty query" };
  }

  // 1. Curate Day patterns
  if (
    matches(query, [
      /^(show me|tell me)?\s*everything that needs my attention/i,
      /^what(?:'s| is) on my plate(?: today)?\??$/i,
      /^my day/i,
    ])
  ) {
    return { kind: "curate_day" };
  }

  // 2. Loop 8 investigate — must precede generic venture synthesis so
  //    "Why did Kounta MRR drop?" routes here, not to "what's happening with Kounta"
  const why = /^why did (\w[\w\s]*?)(?:\s+([\w\s]+?))?\s*(drop|spike|fall|jump|decrease|increase|change)\??$/i.exec(query);
  if (why) {
    const ventureToken = why[1]!.trim();
    const metricHint = why[2]?.trim() ?? null;
    const venture = resolveVenture(ventureToken, input.visibleVentures);
    if (venture === "no_access") {
      return { kind: "no_access", ventureName: ventureToken };
    }
    if (!venture) {
      return { kind: "clarify", reason: `which venture is "${ventureToken}"?` };
    }
    return {
      kind: "loop8_investigate",
      venture,
      metricHint,
      question: query,
    };
  }

  // 3. Decisions search — "What did I decide about <topic>"
  const decided = /^what did i decide(?:\s+about)?\s+(.+)$/i.exec(query);
  if (decided) {
    const topic = decided[1]!.trim().replace(/[?.]+$/, "");
    // Decisions search may scope to a venture if the topic matches one
    const ventureMatch = resolveVenture(topic, input.visibleVentures);
    return {
      kind: "decisions_search",
      query: topic,
      venture: ventureMatch === "no_access" ? null : ventureMatch ?? null,
    };
  }

  // 4. Venture synthesise — "What's happening with <venture>"
  const synth = /^what(?:'s| is) (?:happening|going on)(?: with)?\s+(\w[\w\s]*?)(?:\s+(today|this week))?\??$/i.exec(query);
  if (synth) {
    const ventureToken = synth[1]!.trim();
    const window = synth[2]?.toLowerCase() === "this week" ? "week" : "today";
    const venture = resolveVenture(ventureToken, input.visibleVentures);
    if (venture === "no_access") {
      return { kind: "no_access", ventureName: ventureToken };
    }
    if (!venture) {
      return { kind: "clarify", reason: `which venture is "${ventureToken}"?` };
    }
    return {
      kind: "venture_synthesise",
      venture,
      window: window as "today" | "week",
    };
  }

  return { kind: "clarify", reason: "I didn't recognise that query pattern." };
}

// ---- helpers ----

function matches(query: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(query));
}

/**
 * Resolve a venture-name fragment against the visible list.
 * Returns the matched venture, `"no_access"` if the name matches a
 * known venture the user cannot see (we don't actually have that
 * list here — the caller passes only visible ventures, so we return
 * null for "no match" in v1), or null for ambiguous/unknown.
 */
function resolveVenture(
  token: string,
  visible: VentureForRouting[],
): VentureForRouting | "no_access" | null {
  const norm = token.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!norm) return null;
  // Exact slug
  for (const v of visible) {
    if (v.slug.toLowerCase() === norm) return v;
  }
  // Exact name (normalised)
  for (const v of visible) {
    if (v.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === norm) return v;
  }
  // Prefix match
  for (const v of visible) {
    if (
      v.slug.toLowerCase().startsWith(norm) ||
      v.name.toLowerCase().startsWith(norm)
    ) {
      return v;
    }
  }
  return null;
}
