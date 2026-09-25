/**
 * Pure gesture-routing logic for the feed.
 *
 * The feed has two scroll contexts that coexist:
 *   1. **Feed snap scroll** — vertical swipe between posts (outer)
 *   2. **Body scroll** — vertical scroll within an expanded post body (inner)
 *
 * The routing decision is made at pointer-down time based on WHERE the finger
 * lands, and that decision is LOCKED for the entire gesture (until pointer-up).
 * Once locked, a body-scroll gesture never becomes a feed-swipe even when the
 * body content reaches its scroll boundary.
 *
 * This module contains only the decision functions — no DOM, no React, no
 * side-effects. All rectangle/hit-test helpers are kept pure for unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A simple axis-aligned rectangle (DOMRect-like). */
export type Rect = {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
};

export type GestureOwner = "body-scroll" | "feed-swipe" | "none";

/**
 * Interactive element classifications.
 * "action" = buttons/links that should swallow taps (no double-tap-like).
 * "content" = the tappable content area eligible for double-tap like.
 */
export type HitZone = "action" | "content" | "outside";

// ---------------------------------------------------------------------------
// Hit-test helpers
// ---------------------------------------------------------------------------

/** Whether a point falls inside a rectangle. */
export function pointInRect(
  x: number,
  y: number,
  rect: Rect,
): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Determine gesture ownership at pointer-down.
 *
 * @param pointerY - The clientY of the pointer-down event.
 * @param bodyScrollRect - The bounding rect of the expanded body scroll area,
 *   or `null` if the post is collapsed (no inner scroll area exists).
 * @returns Which scroll context owns this gesture.
 *
 * Rules:
 * - If the post is collapsed (`bodyScrollRect` is null) → "feed-swipe".
 * - If the pointer starts inside the body scroll area → "body-scroll".
 * - Otherwise → "feed-swipe".
 */
export function resolveGestureOwner(
  pointerX: number,
  pointerY: number,
  bodyScrollRect: Rect | null,
): GestureOwner {
  if (!bodyScrollRect) {
    return "feed-swipe";
  }
  if (pointInRect(pointerX, pointerY, bodyScrollRect)) {
    return "body-scroll";
  }
  return "feed-swipe";
}

// ---------------------------------------------------------------------------
// Overscroll guard
// ---------------------------------------------------------------------------

/**
 * Whether an inner scrollable element has reached a boundary.
 *
 * @param scrollTop  - Current scrollTop of the inner element.
 * @param scrollHeight - Total scrollable height.
 * @param clientHeight - Visible height of the scroll container.
 * @returns Object indicating if at top, bottom, or both boundaries.
 */
export function scrollBoundary(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): { atTop: boolean; atBottom: boolean } {
  // 1px tolerance for sub-pixel rounding
  const atTop = scrollTop <= 1;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  return { atTop, atBottom };
}

/**
 * Whether a vertical drag should be suppressed (prevented from propagating
 * to the outer feed-swipe) when the body scroll is at a boundary.
 *
 * Even when the user scrolls past the end of the body, we do NOT hand the
 * gesture to the feed-swipe — the gesture owner was locked at pointer-down.
 * This function tells the caller to `preventDefault` so the outer container
 * does not receive the event.
 *
 * @param deltaY - Pointer movement delta (positive = scroll down intent).
 * @param boundary - Result of `scrollBoundary`.
 * @returns `true` if the outer container should NOT scroll.
 */
export function shouldBlockOverscroll(
  deltaY: number,
  boundary: { atTop: boolean; atBottom: boolean },
): boolean {
  // Scrolling up while at top, or scrolling down while at bottom
  if (deltaY < 0 && boundary.atTop) return true;
  if (deltaY > 0 && boundary.atBottom) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Double-tap detection
// ---------------------------------------------------------------------------

/** Configuration for double-tap timing. */
export type DoubleTapConfig = {
  /** Max ms between two taps to count as double-tap (default 300). */
  maxInterval: number;
  /** Max px distance between two tap positions (default 30). */
  maxDistance: number;
};

export const DEFAULT_DOUBLE_TAP_CONFIG: DoubleTapConfig = {
  maxInterval: 300,
  maxDistance: 30,
};

export type TapRecord = {
  time: number;
  x: number;
  y: number;
};

/**
 * Determine if the current tap forms a double-tap with a previous tap.
 *
 * Pure function — takes two tap records and config, returns boolean.
 * The caller is responsible for maintaining the "last tap" state.
 */
export function isDoubleTap(
  prev: TapRecord | null,
  current: TapRecord,
  config: DoubleTapConfig = DEFAULT_DOUBLE_TAP_CONFIG,
): boolean {
  if (!prev) return false;

  const dt = current.time - prev.time;
  if (dt > config.maxInterval || dt < 0) return false;

  const dx = current.x - prev.x;
  const dy = current.y - prev.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  return dist <= config.maxDistance;
}

/**
 * Classify a hit target to decide if double-tap-like is allowed.
 *
 * Interactive elements (buttons, links, inputs) are "action" zones where
 * a tap should trigger the element's own handler, not a like.
 * The content area (text, image) is the "content" zone for double-tap.
 *
 * @param element - The event target element.
 * @param actionSelector - CSS selector that matches interactive elements.
 *   Defaults to common interactive tags + [data-feed-action].
 * @returns The zone classification.
 */
export function classifyHitZone(
  element: Element | null,
  actionSelector = "button, a, input, textarea, select, [data-feed-action]",
): HitZone {
  if (!element) return "outside";
  // Walk up the DOM to see if any ancestor is an action zone
  const actionEl = element.closest(actionSelector);
  if (actionEl) return "action";
  // Check if inside a content area
  const contentEl = element.closest("[data-feed-content]");
  if (contentEl) return "content";
  return "outside";
}

/**
 * Whether a gesture moved enough to count as a drag rather than a tap.
 * If the pointer traveled more than this threshold, it's a swipe, not a tap.
 */
export const TAP_MOVE_THRESHOLD = 10; // px

export function isTapGesture(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = TAP_MOVE_THRESHOLD,
): boolean {
  const dx = endX - startX;
  const dy = endY - startY;
  return Math.sqrt(dx * dx + dy * dy) <= threshold;
}
