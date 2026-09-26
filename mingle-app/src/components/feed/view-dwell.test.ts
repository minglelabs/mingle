import { describe, expect, it } from "vitest";
import {
  createDwellAccumulator,
  currentDwellMs,
  evaluateSeen,
  SEEN_DWELL_MS,
  startInterval,
  stopInterval,
} from "./view-dwell";

describe("view-dwell", () => {
  it("accumulates only while an interval is active", () => {
    let acc = createDwellAccumulator();
    acc = startInterval(acc, 0);
    expect(currentDwellMs(acc, 500)).toBe(500);
    acc = stopInterval(acc, 500);
    expect(acc.accumulatedMs).toBe(500);
    // Time while stopped does not count.
    expect(currentDwellMs(acc, 5000)).toBe(500);
  });

  it("sums across background pauses (hidden excluded)", () => {
    let acc = createDwellAccumulator();
    acc = startInterval(acc, 0);
    acc = stopInterval(acc, 600); // 600ms foreground
    // tab hidden 0..10000 excluded
    acc = startInterval(acc, 10_000);
    expect(currentDwellMs(acc, 10_500)).toBe(1100); // 600 + 500
  });

  it("does not mark a post seen when flicked past in under a second", () => {
    let acc = createDwellAccumulator();
    acc = startInterval(acc, 0);
    acc = stopInterval(acc, 800);
    const { shouldReport } = evaluateSeen(acc, 800);
    expect(shouldReport).toBe(false);
  });

  it("reports exactly once when the threshold is crossed", () => {
    let acc = createDwellAccumulator();
    acc = startInterval(acc, 0);
    const first = evaluateSeen(acc, SEEN_DWELL_MS);
    expect(first.shouldReport).toBe(true);
    acc = first.acc;
    // A second evaluation must not report again (fire-once latch).
    const second = evaluateSeen(acc, SEEN_DWELL_MS + 5000);
    expect(second.shouldReport).toBe(false);
  });

  it("start is idempotent while already counting", () => {
    let acc = createDwellAccumulator();
    acc = startInterval(acc, 0);
    const same = startInterval(acc, 300);
    expect(same.activeSince).toBe(0);
  });
});
