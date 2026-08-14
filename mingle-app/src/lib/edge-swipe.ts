export const LEFT_EDGE_SWIPE_START_PX = 32;

export function isLeftEdgeSwipeStart(clientX: number): boolean {
  return Number.isFinite(clientX)
    && clientX >= 0
    && clientX <= LEFT_EDGE_SWIPE_START_PX;
}
