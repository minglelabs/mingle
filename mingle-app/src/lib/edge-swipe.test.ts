import { describe, expect, it } from "vitest";

import {
  isLeftEdgeSwipeBack,
  isLeftEdgeSwipeStart,
  LEFT_EDGE_SWIPE_START_PX,
} from "@/lib/edge-swipe";

describe("left edge swipe back", () => {
  it("accepts a mostly horizontal rightward swipe from the edge", () => {
    expect(isLeftEdgeSwipeBack({ x: 10, y: 300 }, { x: 120, y: 320 }, 390)).toBe(true);
  });

  it("rejects swipes that start outside the edge, are too short, or are vertical", () => {
    expect(isLeftEdgeSwipeBack({ x: 60, y: 300 }, { x: 200, y: 300 }, 390)).toBe(false);
    expect(isLeftEdgeSwipeBack({ x: 10, y: 300 }, { x: 60, y: 300 }, 390)).toBe(false);
    expect(isLeftEdgeSwipeBack({ x: 10, y: 300 }, { x: 120, y: 450 }, 390)).toBe(false);
    expect(isLeftEdgeSwipeBack({ x: 10, y: 300 }, { x: -50, y: 300 }, 390)).toBe(false);
  });
});

describe("left edge swipe", () => {
  it("accepts only pointer starts inside the configured edge zone", () => {
    expect(isLeftEdgeSwipeStart(0)).toBe(true);
    expect(isLeftEdgeSwipeStart(LEFT_EDGE_SWIPE_START_PX)).toBe(true);
    expect(isLeftEdgeSwipeStart(LEFT_EDGE_SWIPE_START_PX + 1)).toBe(false);
    expect(isLeftEdgeSwipeStart(-1)).toBe(false);
    expect(isLeftEdgeSwipeStart(Number.NaN)).toBe(false);
  });
});
