/**
 * Feed windowing: only the cards near the one on screen are mounted. Every
 * other appearance renders as a placeholder of the same height and with the
 * same snap point, so the scroll height, the snap points and every
 * index-based position (start / restore, resize, the sign-in snap back,
 * pagination) behave exactly as with every card mounted. Photos far from the
 * screen are unmounted, so their decoded bitmaps can be released: iOS kills a
 * backgrounded WebView sooner the more memory it holds.
 *
 * Pure, so the range and the per-card decisions are unit-tested.
 */

/** Cards kept mounted before the one on screen, so a swipe back is instant. */
export const FEED_WINDOW_BEFORE = 2;
/**
 * Cards kept mounted after it. A swipe moves one card (`scroll-snap-stop:
 * always`), so the next cards are mounted well before a swipe reaches them.
 */
export const FEED_WINDOW_AFTER = 3;
/** Photos load eagerly up to this many cards ahead; the last mounted one loads lazily. */
export const FEED_EAGER_IMAGES_AHEAD = 2;

export type FeedWindow = {
  /** The card the window is centred on; may equal the count (the load-more status card). */
  center: number;
  /** First mounted index (inclusive). */
  start: number;
  /** End of the mounted range (exclusive). */
  end: number;
};

/** The cards to mount around `center` in a list of `count` cards. */
export function feedWindow(
  center: number,
  count: number,
  before: number = FEED_WINDOW_BEFORE,
  after: number = FEED_WINDOW_AFTER,
): FeedWindow {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const at = Number.isFinite(center) ? Math.min(total, Math.max(0, Math.round(center))) : 0;
  return {
    center: at,
    start: Math.max(0, at - Math.max(0, before)),
    end: Math.min(total, at + Math.max(0, after) + 1),
  };
}

export type FeedWindowSlot = {
  /** Render the real card; false renders a placeholder of the same height. */
  mounted: boolean;
  /** Load the card's photo eagerly. */
  eagerImage: boolean;
  /**
   * Decode the card's photo now: it is one swipe away (the next card, or the
   * previous one, which may have been remounted while off screen).
   */
  decodeImage: boolean;
};

/** How the card at `index` renders inside `window`. */
export function feedWindowSlot(window: FeedWindow, index: number): FeedWindowSlot {
  const mounted = index >= window.start && index < window.end;
  return {
    mounted,
    eagerImage: mounted && index <= window.center + FEED_EAGER_IMAGES_AHEAD,
    decodeImage: mounted && Math.abs(index - window.center) === 1,
  };
}
