import { describe, it, expect } from "vitest";
import {
  pointInRect,
  resolveGestureOwner,
  scrollBoundary,
  shouldBlockOverscroll,
  isDoubleTap,
  isTapGesture,
  DEFAULT_DOUBLE_TAP_CONFIG,
  type Rect,
  type TapRecord,
} from "./feed-gesture";

// ---------------------------------------------------------------------------
// pointInRect
// ---------------------------------------------------------------------------
describe("pointInRect", () => {
  const rect: Rect = { top: 100, left: 50, bottom: 400, right: 350 };

  it("returns true for a point inside the rect", () => {
    expect(pointInRect(200, 250, rect)).toBe(true);
  });

  it("returns true for a point on the edge", () => {
    expect(pointInRect(50, 100, rect)).toBe(true);
    expect(pointInRect(350, 400, rect)).toBe(true);
  });

  it("returns false for a point above", () => {
    expect(pointInRect(200, 50, rect)).toBe(false);
  });

  it("returns false for a point below", () => {
    expect(pointInRect(200, 450, rect)).toBe(false);
  });

  it("returns false for a point to the left", () => {
    expect(pointInRect(10, 250, rect)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveGestureOwner
// ---------------------------------------------------------------------------
describe("resolveGestureOwner", () => {
  const bodyRect: Rect = { top: 120, left: 16, bottom: 500, right: 384 };

  it("returns feed-swipe when post is collapsed (null rect)", () => {
    expect(resolveGestureOwner(200, 300, null)).toBe("feed-swipe");
  });

  it("returns body-scroll when pointer starts inside body rect", () => {
    expect(resolveGestureOwner(200, 300, bodyRect)).toBe("body-scroll");
  });

  it("returns feed-swipe when pointer starts outside body rect (above)", () => {
    expect(resolveGestureOwner(200, 80, bodyRect)).toBe("feed-swipe");
  });

  it("returns feed-swipe when pointer starts outside body rect (below)", () => {
    expect(resolveGestureOwner(200, 550, bodyRect)).toBe("feed-swipe");
  });

  it("returns feed-swipe when pointer starts outside body rect (left)", () => {
    expect(resolveGestureOwner(5, 300, bodyRect)).toBe("feed-swipe");
  });
});

// ---------------------------------------------------------------------------
// scrollBoundary
// ---------------------------------------------------------------------------
describe("scrollBoundary", () => {
  it("detects top boundary", () => {
    expect(scrollBoundary(0, 1000, 400)).toEqual({ atTop: true, atBottom: false });
  });

  it("detects bottom boundary", () => {
    expect(scrollBoundary(600, 1000, 400)).toEqual({ atTop: false, atBottom: true });
  });

  it("detects both when content fits exactly", () => {
    expect(scrollBoundary(0, 400, 400)).toEqual({ atTop: true, atBottom: true });
  });

  it("detects neither in the middle", () => {
    expect(scrollBoundary(200, 1000, 400)).toEqual({ atTop: false, atBottom: false });
  });

  it("handles 1px tolerance at top", () => {
    expect(scrollBoundary(1, 1000, 400).atTop).toBe(true);
  });

  it("handles 1px tolerance at bottom", () => {
    expect(scrollBoundary(599, 1000, 400).atBottom).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldBlockOverscroll
// ---------------------------------------------------------------------------
describe("shouldBlockOverscroll", () => {
  it("blocks upward scroll at top", () => {
    expect(shouldBlockOverscroll(-10, { atTop: true, atBottom: false })).toBe(true);
  });

  it("blocks downward scroll at bottom", () => {
    expect(shouldBlockOverscroll(10, { atTop: false, atBottom: true })).toBe(true);
  });

  it("allows downward scroll at top", () => {
    expect(shouldBlockOverscroll(10, { atTop: true, atBottom: false })).toBe(false);
  });

  it("allows upward scroll at bottom", () => {
    expect(shouldBlockOverscroll(-10, { atTop: false, atBottom: true })).toBe(false);
  });

  it("allows scroll in the middle", () => {
    expect(shouldBlockOverscroll(10, { atTop: false, atBottom: false })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDoubleTap
// ---------------------------------------------------------------------------
describe("isDoubleTap", () => {
  const now = 1000;

  it("returns false when prev is null", () => {
    expect(isDoubleTap(null, { time: now, x: 100, y: 200 })).toBe(false);
  });

  it("detects a double-tap within time and distance", () => {
    const prev: TapRecord = { time: now - 200, x: 100, y: 200 };
    const curr: TapRecord = { time: now, x: 105, y: 205 };
    expect(isDoubleTap(prev, curr)).toBe(true);
  });

  it("rejects when interval exceeds maxInterval", () => {
    const prev: TapRecord = { time: now - 400, x: 100, y: 200 };
    const curr: TapRecord = { time: now, x: 100, y: 200 };
    expect(isDoubleTap(prev, curr)).toBe(false);
  });

  it("rejects when distance exceeds maxDistance", () => {
    const prev: TapRecord = { time: now - 200, x: 100, y: 200 };
    const curr: TapRecord = { time: now, x: 200, y: 300 };
    expect(isDoubleTap(prev, curr)).toBe(false);
  });

  it("detects tap at exact maxInterval boundary", () => {
    const prev: TapRecord = { time: now - DEFAULT_DOUBLE_TAP_CONFIG.maxInterval, x: 100, y: 200 };
    const curr: TapRecord = { time: now, x: 100, y: 200 };
    expect(isDoubleTap(prev, curr)).toBe(true);
  });

  it("detects tap at exact maxDistance boundary", () => {
    const prev: TapRecord = { time: now - 100, x: 100, y: 200 };
    const curr: TapRecord = { time: now, x: 100 + 30, y: 200 };
    expect(isDoubleTap(prev, curr)).toBe(true);
  });

  it("uses custom config", () => {
    const prev: TapRecord = { time: now - 500, x: 100, y: 200 };
    const curr: TapRecord = { time: now, x: 100, y: 200 };
    expect(isDoubleTap(prev, curr, { maxInterval: 600, maxDistance: 50 })).toBe(true);
    expect(isDoubleTap(prev, curr, { maxInterval: 400, maxDistance: 50 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTapGesture
// ---------------------------------------------------------------------------
describe("isTapGesture", () => {
  it("returns true when no movement", () => {
    expect(isTapGesture(100, 200, 100, 200)).toBe(true);
  });

  it("returns true for small movement within threshold", () => {
    expect(isTapGesture(100, 200, 105, 203)).toBe(true);
  });

  it("returns false for movement beyond threshold", () => {
    expect(isTapGesture(100, 200, 120, 220)).toBe(false);
  });

  it("returns true at exact threshold boundary", () => {
    // 10px diagonal = (6, 8) → sqrt(36+64) = 10
    expect(isTapGesture(100, 200, 106, 208)).toBe(true);
  });

  it("supports custom threshold", () => {
    expect(isTapGesture(100, 200, 100, 225, 30)).toBe(true);
    expect(isTapGesture(100, 200, 100, 235, 30)).toBe(false);
  });
});
