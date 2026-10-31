import { describe, expect, it } from "vitest";
import {
  FEED_EAGER_IMAGES_AHEAD,
  FEED_WINDOW_AFTER,
  FEED_WINDOW_BEFORE,
  feedWindow,
  feedWindowSlot,
  type FeedWindow,
} from "./feed-window";

const mounted = (window: FeedWindow, count: number) =>
  Array.from({ length: count }, (_, index) => index).filter((index) => feedWindowSlot(window, index).mounted);

describe("feedWindow (which cards are mounted)", () => {
  it("keeps the card on screen, two before it and three after it", () => {
    expect(FEED_WINDOW_BEFORE).toBe(2);
    expect(FEED_WINDOW_AFTER).toBe(3);
    expect(feedWindow(10, 40)).toEqual({ center: 10, start: 8, end: 14 });
    expect(mounted(feedWindow(10, 40), 40)).toEqual([8, 9, 10, 11, 12, 13]);
  });

  it("is cut at the start and the end of the list", () => {
    expect(feedWindow(0, 40)).toEqual({ center: 0, start: 0, end: 4 });
    expect(feedWindow(1, 40)).toEqual({ center: 1, start: 0, end: 5 });
    expect(feedWindow(39, 40)).toEqual({ center: 39, start: 37, end: 40 });
    // A list shorter than the window mounts everything.
    expect(mounted(feedWindow(1, 3), 3)).toEqual([0, 1, 2]);
  });

  it("on the load-more status card (index = count), keeps the last posts mounted", () => {
    expect(feedWindow(12, 12)).toEqual({ center: 12, start: 10, end: 12 });
    expect(mounted(feedWindow(12, 12), 12)).toEqual([10, 11]);
  });

  it("clamps a stale index after the list shrank (removed post, free-view limit)", () => {
    expect(feedWindow(30, 5)).toEqual({ center: 5, start: 3, end: 5 });
    expect(feedWindow(-3, 5)).toEqual({ center: 0, start: 0, end: 4 });
  });

  it("mounts nothing for an empty list or an unusable index", () => {
    expect(feedWindow(0, 0)).toEqual({ center: 0, start: 0, end: 0 });
    expect(feedWindow(Number.NaN, 10)).toEqual({ center: 0, start: 0, end: 4 });
    expect(feedWindow(4, Number.NaN)).toEqual({ center: 0, start: 0, end: 0 });
  });

  it("rounds a fractional index the way the shell reads the scroll position", () => {
    expect(feedWindow(4.4, 20).center).toBe(4);
    expect(feedWindow(4.6, 20).center).toBe(5);
  });

  it("moves one card per swipe, so the next card is already mounted before each swipe", () => {
    for (let at = 0; at < 30; at += 1) {
      const window = feedWindow(at, 30);
      // The cards a swipe can reach from here (one either way).
      if (at + 1 < 30) expect(feedWindowSlot(window, at + 1).mounted).toBe(true);
      if (at > 0) expect(feedWindowSlot(window, at - 1).mounted).toBe(true);
      // At most 6 cards are mounted wherever the reader is.
      expect(window.end - window.start).toBeLessThanOrEqual(FEED_WINDOW_BEFORE + FEED_WINDOW_AFTER + 1);
    }
  });
});

describe("feedWindowSlot (photo loading per card)", () => {
  const window = feedWindow(10, 40);

  it("renders a placeholder outside the window: no photo loads or decodes there", () => {
    for (const index of [0, 7, 14, 39]) {
      expect(feedWindowSlot(window, index)).toEqual({ mounted: false, eagerImage: false, decodeImage: false });
    }
  });

  it("loads photos eagerly up to two cards ahead and lazily on the last mounted one", () => {
    expect(FEED_EAGER_IMAGES_AHEAD).toBe(2);
    expect([8, 9, 10, 11, 12].map((index) => feedWindowSlot(window, index).eagerImage)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(feedWindowSlot(window, 13)).toEqual({ mounted: true, eagerImage: false, decodeImage: false });
  });

  it("decodes the photos one swipe away (next and previous), not the one on screen", () => {
    expect(feedWindowSlot(window, 11).decodeImage).toBe(true);
    expect(feedWindowSlot(window, 9).decodeImage).toBe(true);
    expect(feedWindowSlot(window, 10).decodeImage).toBe(false);
    expect(feedWindowSlot(window, 12).decodeImage).toBe(false);
    expect(feedWindowSlot(window, 8).decodeImage).toBe(false);
  });

  it("on the status card, decodes the last post (one swipe back)", () => {
    const end = feedWindow(12, 12);
    expect(feedWindowSlot(end, 11)).toEqual({ mounted: true, eagerImage: true, decodeImage: true });
    expect(feedWindowSlot(end, 12).mounted).toBe(false);
  });
});
