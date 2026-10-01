// Pure math for paging between the photos of a room in the full-screen viewer: how far a
// horizontal drag moves the track, when a release turns the page, which slides stay mounted.
// The component feeds pointer positions in here and renders the result, as with
// swipe-to-dismiss.logic.

import { VELOCITY_WINDOW_MS } from './swipe-to-dismiss.logic'

/** A drag past this fraction of the viewer width turns the page on release. */
export const PAGER_DISTANCE_FRACTION = 0.2

/** Upper cap (px) on that distance, so a wide desktop viewer does not need a huge drag. */
export const PAGER_DISTANCE_MAX_PX = 140

/** Horizontal velocity (px/ms) that turns the page after a drag shorter than the distance. */
export const PAGER_VELOCITY_PX_PER_MS = 0.4

/** A flick must have travelled at least this far (px) to turn the page. */
export const PAGER_FLICK_MIN_DISTANCE_PX = 20

/** Drag past the first or last photo moves the track only this fraction as far. */
export const PAGER_EDGE_RESISTANCE = 0.3

/** How long the page-turn animation runs. */
export const PAGER_ANIMATION_MS = 280

/** Slides kept mounted on each side of the current one (they preload the neighbours). */
export const PAGER_WINDOW_RADIUS = 1

export type PagerPosition = { index: number; count: number }

export interface PositionSample {
  /** Pointer position along the page axis, px. */
  pos: number
  /** Event timestamp, ms. */
  t: number
}

/** Append a sample and keep only what windowPositionVelocity needs (see appendVelocitySample). */
export function appendPositionSample(
  samples: readonly PositionSample[],
  sample: PositionSample,
  windowMs: number = VELOCITY_WINDOW_MS,
): PositionSample[] {
  const next = [...samples, sample]
  const cutoff = sample.t - windowMs
  let firstInWindow = next.findIndex(entry => entry.t >= cutoff)
  if (firstInWindow < 0) firstInWindow = next.length - 1
  return next.slice(Math.max(0, firstInWindow - 1))
}

/** Velocity (px/ms, positive to the right) over the recent window; 0 with fewer than two samples. */
export function windowPositionVelocity(
  samples: readonly PositionSample[],
  windowMs: number = VELOCITY_WINDOW_MS,
): number {
  if (samples.length < 2) return 0
  const newest = samples[samples.length - 1]
  const cutoff = newest.t - windowMs
  let oldestIndex = samples.findIndex(entry => entry.t >= cutoff)
  if (oldestIndex < 0 || oldestIndex === samples.length - 1) oldestIndex = samples.length - 2
  const oldest = samples[oldestIndex]
  const dt = newest.t - oldest.t
  return dt > 0 ? (newest.pos - oldest.pos) / dt : 0
}

export function hasPreviousPage({ index }: PagerPosition): boolean {
  return index > 0
}

export function hasNextPage({ index, count }: PagerPosition): boolean {
  return index < count - 1
}

/** The track offset for a raw finger offset: 1:1, resisted where there is no photo to turn to. */
export function resolvePagerOffset(
  offsetX: number,
  position: PagerPosition,
  resistance: number = PAGER_EDGE_RESISTANCE,
): number {
  if (offsetX > 0 && !hasPreviousPage(position)) return offsetX * resistance
  if (offsetX < 0 && !hasNextPage(position)) return offsetX * resistance
  return offsetX
}

export interface PagerReleaseInput extends PagerPosition {
  /** Raw finger offset at release, px (negative is leftwards). */
  offsetX: number
  /** Windowed horizontal velocity at release, px/ms (negative is leftwards), already stale-guarded. */
  velocityX: number
  /** Viewer width, px. */
  width: number
  distanceFraction?: number
  distanceMax?: number
  velocityThreshold?: number
  flickMinDistance?: number
}

/**
 * The index to show after a release: one page over when the drag passed the distance
 * threshold, or was a quick flick in the same direction; otherwise the same photo again
 * (the track springs back). Never past the first or last photo.
 */
export function resolvePagerRelease({
  index,
  count,
  offsetX,
  velocityX,
  width,
  distanceFraction = PAGER_DISTANCE_FRACTION,
  distanceMax = PAGER_DISTANCE_MAX_PX,
  velocityThreshold = PAGER_VELOCITY_PX_PER_MS,
  flickMinDistance = PAGER_FLICK_MIN_DISTANCE_PX,
}: PagerReleaseInput): number {
  const distance = Math.abs(offsetX)
  if (distance === 0) return index
  const threshold = Math.min(width > 0 ? width * distanceFraction : Infinity, distanceMax)
  const sameDirection = Math.sign(velocityX) === Math.sign(offsetX)
  const turns = distance >= threshold
    || (distance >= flickMinDistance && sameDirection && Math.abs(velocityX) >= velocityThreshold)
  if (!turns) return index
  return stepPagerIndex(index, offsetX < 0 ? 1 : -1, count)
}

/** `index + delta` kept inside the photos. */
export function stepPagerIndex(index: number, delta: number, count: number): number {
  return Math.min(Math.max(0, count - 1), Math.max(0, index + delta))
}

/** Indices of the slides to mount: the current photo and its neighbours. */
export function pagerWindowIndices(index: number, count: number, radius: number = PAGER_WINDOW_RADIUS): number[] {
  const output: number[] = []
  for (let value = Math.max(0, index - radius); value <= Math.min(count - 1, index + radius); value += 1) output.push(value)
  return output
}

/** The track transform: whole viewer widths for the page, plus the live finger offset in px. */
export function pagerTrackTransform(index: number, offsetPx: number): string {
  return `translate3d(calc(${-index * 100}% + ${offsetPx}px), 0, 0)`
}
