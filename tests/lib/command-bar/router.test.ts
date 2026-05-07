// Pure unit tests for the command-bar query router (Sprint 11).

import { describe, expect, test } from "vitest";

import {
  routeCommand,
  type VentureForRouting,
} from "@/lib/command-bar/router";

const KOUNTA: VentureForRouting = {
  ventureId: "v-kounta",
  slug: "kounta",
  name: "Kounta",
};
const COUNSEL: VentureForRouting = {
  ventureId: "v-counsel",
  slug: "counsel",
  name: "Counsel",
};
const VENTURES = [KOUNTA, COUNSEL];

describe("routeCommand — curate_day", () => {
  test("Show me everything that needs my attention", () => {
    const intent = routeCommand({
      query: "Show me everything that needs my attention",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("curate_day");
  });

  test("What's on my plate today?", () => {
    const intent = routeCommand({
      query: "What's on my plate today?",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("curate_day");
  });

  test("My day", () => {
    const intent = routeCommand({
      query: "My day",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("curate_day");
  });
});

describe("routeCommand — venture_synthesise", () => {
  test("What's happening with Kounta today", () => {
    const intent = routeCommand({
      query: "What's happening with Kounta today",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("venture_synthesise");
    if (intent.kind === "venture_synthesise") {
      expect(intent.venture.slug).toBe("kounta");
      expect(intent.window).toBe("today");
    }
  });

  test("What is going on with Counsel this week", () => {
    const intent = routeCommand({
      query: "What is going on with Counsel this week",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("venture_synthesise");
    if (intent.kind === "venture_synthesise") {
      expect(intent.venture.slug).toBe("counsel");
      expect(intent.window).toBe("week");
    }
  });

  test("Unknown venture name -> clarify", () => {
    const intent = routeCommand({
      query: "What's happening with Bogus",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("clarify");
  });
});

describe("routeCommand — loop8_investigate", () => {
  test("Why did Kounta MRR drop", () => {
    const intent = routeCommand({
      query: "Why did Kounta MRR drop",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("loop8_investigate");
    if (intent.kind === "loop8_investigate") {
      expect(intent.venture.slug).toBe("kounta");
      expect(intent.metricHint).toBe("MRR");
    }
  });

  test("Why did Counsel revenue fall?", () => {
    const intent = routeCommand({
      query: "Why did Counsel revenue fall?",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("loop8_investigate");
    if (intent.kind === "loop8_investigate") {
      expect(intent.venture.slug).toBe("counsel");
    }
  });

  test("loop8_investigate takes precedence over venture_synthesise", () => {
    // "Why did X spike" should not be a venture_synthesise even though
    // it mentions a venture.
    const intent = routeCommand({
      query: "Why did Kounta spike",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("loop8_investigate");
  });
});

describe("routeCommand — decisions_search", () => {
  test("What did I decide about pricing", () => {
    const intent = routeCommand({
      query: "What did I decide about pricing",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("decisions_search");
    if (intent.kind === "decisions_search") {
      expect(intent.query).toBe("pricing");
    }
  });

  test("trailing question mark is stripped", () => {
    const intent = routeCommand({
      query: "What did I decide about Mercury?",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("decisions_search");
    if (intent.kind === "decisions_search") {
      expect(intent.query).toBe("Mercury");
    }
  });
});

describe("routeCommand — clarify on unknowns", () => {
  test("empty query", () => {
    const intent = routeCommand({
      query: "",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("clarify");
  });

  test("unrelated question", () => {
    const intent = routeCommand({
      query: "What's the meaning of life",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("clarify");
  });
});

describe("routeCommand — venture name resolution", () => {
  test("exact slug", () => {
    const intent = routeCommand({
      query: "What's happening with kounta",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("venture_synthesise");
  });

  test("prefix match", () => {
    const intent = routeCommand({
      query: "What's happening with Coun",
      visibleVentures: VENTURES,
    });
    expect(intent.kind).toBe("venture_synthesise");
  });

  test("member with empty visible list -> clarify", () => {
    const intent = routeCommand({
      query: "What's happening with Kounta",
      visibleVentures: [],
    });
    expect(intent.kind).toBe("clarify");
  });
});
