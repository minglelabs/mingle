import { describe, expect, it } from 'vitest'
import {
  DISMISS_DISTANCE_MAX_PX,
  DISMISS_VELOCITY_PX_PER_MS,
  DIRECTION_SLOP_PX,
  MIN_BACKDROP_OPACITY,
  MIN_DRAG_SCALE,
  VELOCITY_STALE_MS,
  backdropOpacityForProgress,
  dragProgress,
  effectiveVelocity,
  isDismissibleDrag,
  offsetForDrag,
  resolveDragAxis,
  scaleForProgress,
  shouldDismissOnRelease,
} from './swipe-to-dismiss.logic'

describe('resolveDragAxis — direction lock', () => {
  it('stays undecided inside the slop', () => {
    expect(resolveDragAxis({ dx: 4, dy: 5 })).toBeNull()
    expect(resolveDragAxis({ dx: DIRECTION_SLOP_PX - 1, dy: DIRECTION_SLOP_PX - 1 })).toBeNull()
  })

  it('locks vertical only when vertical strictly dominates past the slop', () => {
    expect(resolveDragAxis({ dx: 2, dy: 40 })).toBe('vertical')
    expect(resolveDragAxis({ dx: 2, dy: -40 })).toBe('vertical')
  })

  it('locks horizontal for horizontal-dominant or tied movement (edge swipe-back is not hijacked)', () => {
    expect(resolveDragAxis({ dx: 40, dy: 2 })).toBe('horizontal')
    expect(resolveDragAxis({ dx: 30, dy: 30 })).toBe('horizontal')
  })
})

describe('isDismissibleDrag — only downward vertical qualifies', () => {
  it('true for a downward vertical drag past the slop', () => {
    expect(isDismissibleDrag({ dx: 3, dy: 60 })).toBe(true)
  })

  it('false for upward drags', () => {
    expect(isDismissibleDrag({ dx: 3, dy: -60 })).toBe(false)
  })

  it('false for horizontal drags', () => {
    expect(isDismissibleDrag({ dx: 60, dy: 3 })).toBe(false)
  })

  it('false while still inside the slop', () => {
    expect(isDismissibleDrag({ dx: 2, dy: 5 })).toBe(false)
  })
})

describe('offsetForDrag — upward is resisted', () => {
  it('follows the finger 1:1 downward', () => {
    expect(offsetForDrag(100)).toBe(100)
    expect(offsetForDrag(0)).toBe(0)
  })

  it('resists upward movement so the viewer does not lift away', () => {
    expect(offsetForDrag(-100)).toBeCloseTo(-35)
    expect(Math.abs(offsetForDrag(-100))).toBeLessThan(100)
  })
})

describe('dragProgress / opacity / scale mapping', () => {
  it('is 0 at or below zero offset and clamps to 1', () => {
    expect(dragProgress(0)).toBe(0)
    expect(dragProgress(-50)).toBe(0)
    expect(dragProgress(100_000)).toBe(1)
  })

  it('fades the backdrop toward the floor but never below it', () => {
    expect(backdropOpacityForProgress(0)).toBe(1)
    expect(backdropOpacityForProgress(1)).toBeCloseTo(MIN_BACKDROP_OPACITY)
    expect(backdropOpacityForProgress(0.5)).toBeGreaterThan(MIN_BACKDROP_OPACITY)
  })

  it('scales down toward the min scale', () => {
    expect(scaleForProgress(0)).toBe(1)
    expect(scaleForProgress(1)).toBeCloseTo(MIN_DRAG_SCALE)
  })
})

describe('shouldDismissOnRelease', () => {
  const viewportHeight = 800 // fraction threshold = 800 * 0.22 = 176, capped at 120

  it('dismisses when the drag passes the distance threshold', () => {
    expect(shouldDismissOnRelease({ offsetY: DISMISS_DISTANCE_MAX_PX, velocityY: 0, viewportHeight })).toBe(true)
    expect(shouldDismissOnRelease({ offsetY: 200, velocityY: 0, viewportHeight })).toBe(true)
  })

  it('springs back for a short, slow drag', () => {
    expect(shouldDismissOnRelease({ offsetY: 40, velocityY: 0.1, viewportHeight })).toBe(false)
  })

  it('dismisses on a fast downward flick even when short', () => {
    expect(shouldDismissOnRelease({ offsetY: 30, velocityY: DISMISS_VELOCITY_PX_PER_MS, viewportHeight })).toBe(true)
    expect(shouldDismissOnRelease({ offsetY: 30, velocityY: 1.2, viewportHeight })).toBe(true)
  })

  it('never dismisses when there is no downward offset (upward ignored)', () => {
    expect(shouldDismissOnRelease({ offsetY: 0, velocityY: 5, viewportHeight })).toBe(false)
    expect(shouldDismissOnRelease({ offsetY: -50, velocityY: 5, viewportHeight })).toBe(false)
  })

  it('uses the smaller of the fractional threshold and the absolute cap', () => {
    // Tall viewport: fraction (0.22 * 400 = 88) is below the 120 cap, so 88 wins.
    expect(shouldDismissOnRelease({ offsetY: 90, velocityY: 0, viewportHeight: 400 })).toBe(true)
    expect(shouldDismissOnRelease({ offsetY: 80, velocityY: 0, viewportHeight: 400 })).toBe(false)
  })
})

describe('effectiveVelocity — stale velocity guard', () => {
  it('keeps the velocity for a recent move', () => {
    expect(effectiveVelocity(0.8, 0)).toBe(0.8)
    expect(effectiveVelocity(0.8, VELOCITY_STALE_MS)).toBe(0.8)
  })

  it('drops to zero when the last move is stale (a hold, not a flick)', () => {
    expect(effectiveVelocity(0.8, VELOCITY_STALE_MS + 1)).toBe(0)
    expect(effectiveVelocity(2, 500)).toBe(0)
  })

  it('makes a held-then-released fast drag spring back instead of flick-dismissing', () => {
    const velocityY = effectiveVelocity(1.5, 300) // fast earlier, but held 300ms before release
    expect(velocityY).toBe(0)
    expect(shouldDismissOnRelease({ offsetY: 30, velocityY, viewportHeight: 800 })).toBe(false)
  })
})
