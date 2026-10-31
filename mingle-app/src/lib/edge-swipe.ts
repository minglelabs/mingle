export const LEFT_EDGE_SWIPE_START_PX = 32;
export const LEFT_EDGE_SWIPE_BACK_MIN_PX = 72;

export function isLeftEdgeSwipeStart(clientX: number): boolean {
  return Number.isFinite(clientX)
    && clientX >= 0
    && clientX <= LEFT_EDGE_SWIPE_START_PX;
}

type SwipePoint = { x: number; y: number };

/**
 * A completed swipe counts as "back" when it started in the left edge zone,
 * travelled right far enough, and stayed mostly horizontal.
 */
export function isLeftEdgeSwipeBack(start: SwipePoint, end: SwipePoint, viewportWidth: number): boolean {
  if (!isLeftEdgeSwipeStart(start.x)) return false;
  const deltaX = end.x - start.x;
  const deltaY = Math.abs(end.y - start.y);
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  const threshold = Math.max(LEFT_EDGE_SWIPE_BACK_MIN_PX, width * 0.18);
  return deltaX >= threshold && deltaY < deltaX * 0.8;
}
