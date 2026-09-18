import { describe, expect, it } from "vitest";

import {
  isLeftEdgeSwipeStart,
  LEFT_EDGE_SWIPE_START_PX,
} from "@/lib/edge-swipe";

describe("left edge swipe", () => {
  it("accepts only pointer starts inside the configured edge zone", () => {
    expect(isLeftEdgeSwipeStart(0)).toBe(true);
    expect(isLeftEdgeSwipeStart(LEFT_EDGE_SWIPE_START_PX)).toBe(true);
    expect(isLeftEdgeSwipeStart(LEFT_EDGE_SWIPE_START_PX + 1)).toBe(false);
    expect(isLeftEdgeSwipeStart(-1)).toBe(false);
    expect(isLeftEdgeSwipeStart(Number.NaN)).toBe(false);
  });
});
