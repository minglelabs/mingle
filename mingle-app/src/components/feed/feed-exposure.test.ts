import { describe, expect, it } from "vitest";
import {
  createExposureState,
  exposurePause,
  exposureResume,
  exposureSetActive,
  exposureTick,
  type ExposureSignal,
  type ExposureState,
} from "./feed-exposure";
import { SEEN_DWELL_MS } from "./view-dwell";

function run(steps: Array<(s: ExposureState) => { state: ExposureState; signals?: ExposureSignal[] } | ExposureState>) {
  let state = createExposureState();
  const signals: ExposureSignal[] = [];
  for (const step of steps) {
    const out = step(state);
    if ("visit" in out) state = out;
    else {
      state = out.state;
      signals.push(...(out.signals ?? []));
    }
  }
  return signals;
}

describe("feed exposure (same visit clock as the seen view)", () => {
  it("impression once the visit crosses 1s, sent once", () => {
    const signals = run([
      (s) => exposureSetActive(s, "0:a", 0),
      (s) => exposureTick(s, SEEN_DWELL_MS - 1),
      (s) => exposureTick(s, SEEN_DWELL_MS),
      (s) => exposureTick(s, SEEN_DWELL_MS + 500),
      (s) => exposureSetActive(s, "0:b", 5000),
    ]);
    expect(signals).toEqual([{ kind: "impression", key: "0:a" }]);
  });

  it("quick skip when the visit ends under 1s, with its dwell", () => {
    const signals = run([(s) => exposureSetActive(s, "0:a", 0), (s) => exposureSetActive(s, "0:b", 600)]);
    expect(signals).toEqual([{ kind: "skip", key: "0:a", dwellMs: 600 }]);
  });

  it("impression when the visit ends right at the threshold (not a skip)", () => {
    const signals = run([(s) => exposureSetActive(s, "0:a", 0), (s) => exposureSetActive(s, "0:b", SEEN_DWELL_MS)]);
    expect(signals).toEqual([{ kind: "impression", key: "0:a" }]);
  });

  it("background time does not count and sends nothing", () => {
    const signals = run([
      (s) => exposureSetActive(s, "0:a", 0),
      (s) => exposurePause(s, 400), // app to background
      (s) => exposureTick(s, 10_000),
      (s) => exposureResume(s, 10_000),
      (s) => exposureTick(s, 10_500),
      (s) => exposureSetActive(s, "0:b", 10_500),
    ]);
    expect(signals).toEqual([{ kind: "skip", key: "0:a", dwellMs: 900 }]);
  });

  it("an open overlay pauses the visit; closing resumes the same visit", () => {
    const signals = run([
      (s) => exposureSetActive(s, "0:a", 0),
      (s) => exposureSetActive(s, null, 700), // comment sheet opened
      (s) => exposureSetActive(s, "0:a", 20_000), // closed
      (s) => exposureTick(s, 20_300),
    ]);
    expect(signals).toEqual([{ kind: "impression", key: "0:a" }]);
  });

  it("separate visits are not summed; a repeat appearance is its own visit", () => {
    const signals = run([
      (s) => exposureSetActive(s, "0:a", 0),
      (s) => exposureSetActive(s, "0:b", 600),
      (s) => exposureSetActive(s, "0:a", 1200),
      (s) => exposureSetActive(s, "1:a", 1800),
    ]);
    expect(signals).toEqual([
      { kind: "skip", key: "0:a", dwellMs: 600 },
      { kind: "skip", key: "0:b", dwellMs: 600 },
      { kind: "skip", key: "0:a", dwellMs: 600 },
    ]);
  });

  it("a visit with no foreground time is neither impression nor skip", () => {
    const signals = run([
      (s) => exposureSetActive(s, "0:a", 0),
      (s) => exposurePause(s, 0),
      (s) => exposureSetActive(s, "0:b", 5000),
    ]);
    expect(signals).toEqual([]);
  });
});
