import { describe, expect, it } from "vitest";
import {
  PULL_DISMISS_DISTANCE_PX,
  shouldClosePulledSheet,
  shouldStartSheetPull,
} from "./comment-sheet-pull";

describe("shouldStartSheetPull", () => {
  it("moves the sheet on a downward pull from the top of the list", () => {
    expect(shouldStartSheetPull({ startedAtTop: true, dx: 2, dy: 20 })).toBe(true);
  });

  it("leaves the list scrolling when it was not at the top", () => {
    expect(shouldStartSheetPull({ startedAtTop: false, dx: 0, dy: 40 })).toBe(false);
  });

  it("leaves upward, sideways and tiny moves to the list", () => {
    expect(shouldStartSheetPull({ startedAtTop: true, dx: 0, dy: -30 })).toBe(false);
    expect(shouldStartSheetPull({ startedAtTop: true, dx: 40, dy: 20 })).toBe(false);
    expect(shouldStartSheetPull({ startedAtTop: true, dx: 0, dy: 4 })).toBe(false);
  });
});

describe("shouldClosePulledSheet", () => {
  it("closes past the distance or on a fast flick", () => {
    expect(shouldClosePulledSheet({ offsetY: PULL_DISMISS_DISTANCE_PX, velocityY: 0 })).toBe(true);
    expect(shouldClosePulledSheet({ offsetY: 40, velocityY: 900 })).toBe(true);
  });

  it("springs back for a short slow pull or a twitch", () => {
    expect(shouldClosePulledSheet({ offsetY: 60, velocityY: 100 })).toBe(false);
    expect(shouldClosePulledSheet({ offsetY: 10, velocityY: 2000 })).toBe(false);
  });
});
