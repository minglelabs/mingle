import { describe, expect, it } from "vitest";
import {
  checkVisit,
  createDwellAccumulator,
  createVisitState,
  currentDwellMs,
  evaluateSeen,
  pauseVisit,
  remainingVisitMs,
  resumeVisit,
  SEEN_DWELL_MS,
  setActivePost,
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

describe("view-dwell visits (1s within one visit)", () => {
  it("does not sum two separate 0.6s visits", () => {
    let step = setActivePost(createVisitState(), "p1", 0);
    step = setActivePost(step.state, "p2", 600); // leave p1 after 0.6s
    expect(step.seenPostId).toBeNull();
    step = setActivePost(step.state, "p1", 1_000); // come back: new visit
    step = setActivePost(step.state, "p2", 1_600); // another 0.6s
    expect(step.seenPostId).toBeNull();
    expect(checkVisit(step.state, 1_600).seenPostId).toBeNull();
  });

  it("reports once a single visit reaches 1s", () => {
    const step = setActivePost(createVisitState(), "p1", 0);
    expect(remainingVisitMs(step.state, 400)).toBe(600);
    expect(checkVisit(step.state, 999).seenPostId).toBeNull();
    const seen = checkVisit(step.state, SEEN_DWELL_MS);
    expect(seen.seenPostId).toBe("p1");
    expect(checkVisit(seen.state, 5_000).seenPostId).toBeNull();
  });

  it("reports on leaving when the visit was long enough", () => {
    const step = setActivePost(createVisitState(), "p1", 0);
    expect(setActivePost(step.state, "p2", 1_200).seenPostId).toBe("p1");
  });

  it("pauses during an overlay (active=null) and resumes on the same card", () => {
    let step = setActivePost(createVisitState(), "p1", 0);
    step = setActivePost(step.state, null, 600); // overlay opens
    expect(remainingVisitMs(step.state, 5_000)).toBeNull(); // not counting
    step = setActivePost(step.state, "p1", 9_000); // overlay closes
    expect(checkVisit(step.state, 9_300).seenPostId).toBeNull(); // 900ms
    expect(checkVisit(step.state, 9_400).seenPostId).toBe("p1"); // 1000ms
  });

  it("pauses in the background and resumes in the foreground", () => {
    let step = setActivePost(createVisitState(), "p1", 0);
    step = pauseVisit(step.state, 700); // hidden
    const resumed = resumeVisit(step.state, 60_000); // visible again
    expect(checkVisit(resumed, 60_200).seenPostId).toBeNull();
    expect(checkVisit(resumed, 60_300).seenPostId).toBe("p1");
  });

  it("an overlay then a different card drops the paused visit", () => {
    let step = setActivePost(createVisitState(), "p1", 0);
    step = setActivePost(step.state, null, 700);
    step = setActivePost(step.state, "p2", 800);
    expect(step.state.postId).toBe("p2");
    step = setActivePost(step.state, "p1", 1_000);
    expect(checkVisit(step.state, 1_500).seenPostId).toBeNull();
  });
});
