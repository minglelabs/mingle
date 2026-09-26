// Pure gesture math for swipe-down-to-dismiss on the full-screen photo viewer.
// The component wiring stays thin: it feeds pointer deltas/velocity in here and
// renders the returned transform, and asks this module whether a release should
// dismiss. Keeping the decisions pure makes them unit-testable without a DOM.

/** Movement (in px) below which we do not commit to any gesture direction. */
export const DIRECTION_SLOP_PX = 8

/** Fraction of viewport height a downward drag must pass to dismiss on release. */
export const DISMISS_DISTANCE_FRACTION = 0.22

/** Upper cap (px) on the dismiss distance threshold, so tall viewers do not
 *  require an unreachably long drag: threshold = min(22% of height, this). */
export const DISMISS_DISTANCE_MAX_PX = 120

/** Downward velocity (px/ms) that dismisses regardless of distance (a flick). */
export const DISMISS_VELOCITY_PX_PER_MS = 0.5

/** A release whose last pointermove is older than this (ms) is treated as a
 *  hold, not a flick — its stale velocity is ignored. */
export const VELOCITY_STALE_MS = 100

/** Backdrop stays at least this opaque while dragging, so it never fully clears. */
export const MIN_BACKDROP_OPACITY = 0.15

/** How far (px) a full-progress drag travels for opacity/scale mapping. */
export const PROGRESS_REFERENCE_PX = 320

/** Smallest scale the photo shrinks to at full drag progress. */
export const MIN_DRAG_SCALE = 0.85

/** Resistance applied to upward drags so they visibly do not dismiss. */
export const UPWARD_RESISTANCE = 0.35

export type DragAxis = 'vertical' | 'horizontal'

export interface DragDelta {
  dx: number
  dy: number
}

/**
 * Decide which axis a gesture has committed to, once it clears the slop.
 * Returns null while still inside the slop (undecided), so the caller keeps
 * the page's native behaviour (e.g. edge swipe-back) until a direction is clear.
 */
export function resolveDragAxis(
  { dx, dy }: DragDelta,
  slop: number = DIRECTION_SLOP_PX,
): DragAxis | null {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < slop && ay < slop) return null
  // Vertical only when it strictly dominates; ties/horizontal stay horizontal
  // so we never hijack the horizontal edge-swipe-back gesture.
  return ay > ax ? 'vertical' : 'horizontal'
}

/**
 * True only for a downward vertical gesture past the slop — the one case that
 * may dismiss. Upward and horizontal gestures return false.
 */
export function isDismissibleDrag(
  delta: DragDelta,
  slop: number = DIRECTION_SLOP_PX,
): boolean {
  return resolveDragAxis(delta, slop) === 'vertical' && delta.dy > 0
}

/**
 * The vertical offset actually applied to the photo. Downward drags follow the
 * finger 1:1; upward drags are resisted (and never negative past a tiny amount)
 * so the viewer clearly does not lift away on an up-swipe.
 */
export function offsetForDrag(
  dy: number,
  resistance: number = UPWARD_RESISTANCE,
): number {
  if (dy >= 0) return dy
  return dy * resistance
}

/**
 * Drag progress in [0, 1] mapped from the applied downward offset. Upward or
 * zero offset is 0 progress.
 */
export function dragProgress(
  offsetY: number,
  reference: number = PROGRESS_REFERENCE_PX,
): number {
  if (offsetY <= 0 || reference <= 0) return 0
  return Math.min(1, offsetY / reference)
}

/** Backdrop opacity for a given progress, fading from 1 down to MIN_BACKDROP_OPACITY. */
export function backdropOpacityForProgress(
  progress: number,
  minOpacity: number = MIN_BACKDROP_OPACITY,
): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return 1 - clamped * (1 - minOpacity)
}

/** Optional scale-down for a given progress, from 1 down to MIN_DRAG_SCALE. */
export function scaleForProgress(
  progress: number,
  minScale: number = MIN_DRAG_SCALE,
): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return 1 - clamped * (1 - minScale)
}

/**
 * The stale velocity guard: a release whose most recent pointermove happened
 * longer than `staleMs` before the release means the finger was held still, so
 * the last measured velocity is meaningless and must not count as a flick.
 * Returns the velocity to use in the dismiss decision (0 when stale).
 */
export function effectiveVelocity(
  velocityY: number,
  msSinceLastMove: number,
  staleMs: number = VELOCITY_STALE_MS,
): number {
  return msSinceLastMove > staleMs ? 0 : velocityY
}

export interface DismissDecisionInput {
  /** Applied downward offset in px at release (see offsetForDrag). */
  offsetY: number
  /** Instantaneous vertical velocity in px/ms at release (down is positive). */
  velocityY: number
  /** Viewport height in px, for the fractional distance threshold. */
  viewportHeight: number
  distanceFraction?: number
  distanceMax?: number
  velocityThreshold?: number
}

/**
 * Whether releasing the drag should dismiss the viewer. Dismiss when the drag
 * passed the distance threshold (the smaller of a fraction of the viewer height
 * and the absolute cap) OR when it was a fast downward flick. Anything else
 * (including any upward motion) springs back. Callers should pass a
 * stale-guarded velocity (see effectiveVelocity) so a hold is not a flick.
 */
export function shouldDismissOnRelease({
  offsetY,
  velocityY,
  viewportHeight,
  distanceFraction = DISMISS_DISTANCE_FRACTION,
  distanceMax = DISMISS_DISTANCE_MAX_PX,
  velocityThreshold = DISMISS_VELOCITY_PX_PER_MS,
}: DismissDecisionInput): boolean {
  if (offsetY <= 0) return false
  const fractionThreshold = viewportHeight > 0 ? viewportHeight * distanceFraction : Infinity
  const distanceThreshold = Math.min(fractionThreshold, distanceMax)
  if (offsetY >= distanceThreshold) return true
  return velocityY >= velocityThreshold
}
