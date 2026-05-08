// Unit test for ConversationThread's nextRequestId helper.
//
// Live verification (Loop 1, 2026-05-08) caught that subsequent submits
// in the same ConversationThread silently failed to invoke the SSE
// endpoint. Root cause: StreamingDocument was reconciled, not remounted,
// across submits because the parent constructed the same liveDoc shape
// each time. The cancel-fix sprint added a per-submit requestId, used as
// the React `key` on StreamingDocument so each submit forces a fresh
// mount (and a fresh useEffect → fresh fetch).
//
// This test covers only the helper's contract: identity must be unique
// across calls. The component-level proof — that React actually
// remounts and that the SSE fetch is re-issued — requires jsdom +
// react-dom/client testing infrastructure that this repo does not have
// configured. That gap is documented in the cancel-fix handoff and was
// covered by manual exercise on the deployed app.

import { describe, expect, test } from "vitest";

import { nextRequestId } from "@/components/loop1/ConversationThread";

describe("nextRequestId", () => {
  test("returns a non-empty string", () => {
    const id = nextRequestId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("returns a different value on every call (collision-free for the operator's session)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      ids.add(nextRequestId());
    }
    expect(ids.size).toBe(200);
  });
});
