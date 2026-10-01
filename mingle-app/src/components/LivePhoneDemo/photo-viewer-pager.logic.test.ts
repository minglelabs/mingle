import { describe, expect, it } from 'vitest'
import {
  PAGER_DISTANCE_MAX_PX,
  PAGER_EDGE_RESISTANCE,
  appendPositionSample,
  hasNextPage,
  hasPreviousPage,
  pagerTrackTransform,
  pagerWindowIndices,
  resolvePagerOffset,
  resolvePagerRelease,
  stepPagerIndex,
  windowPositionVelocity,
} from './photo-viewer-pager.logic'

describe('resolvePagerOffset', () => {
  it('follows the finger 1:1 where there is a photo to turn to', () => {
    expect(resolvePagerOffset(-80, { index: 1, count: 3 })).toBe(-80)
    expect(resolvePagerOffset(60, { index: 1, count: 3 })).toBe(60)
  })

  it('resists a drag past the first or last photo', () => {
    expect(resolvePagerOffset(100, { index: 0, count: 3 })).toBe(100 * PAGER_EDGE_RESISTANCE)
    expect(resolvePagerOffset(-100, { index: 2, count: 3 })).toBe(-100 * PAGER_EDGE_RESISTANCE)
    // Dragging back toward the photos is not resisted.
    expect(resolvePagerOffset(-100, { index: 0, count: 3 })).toBe(-100)
    expect(resolvePagerOffset(100, { index: 2, count: 3 })).toBe(100)
  })

  it('resists both ways when there is a single photo', () => {
    expect(resolvePagerOffset(100, { index: 0, count: 1 })).toBe(30)
    expect(resolvePagerOffset(-100, { index: 0, count: 1 })).toBe(-30)
  })
})

describe('resolvePagerRelease', () => {
  const base = { index: 1, count: 4, width: 400 }

  it('turns the page once the drag passes a fifth of the width, in the direction of the drag', () => {
    expect(resolvePagerRelease({ ...base, offsetX: -81, velocityX: 0 })).toBe(2)
    expect(resolvePagerRelease({ ...base, offsetX: 81, velocityX: 0 })).toBe(0)
    expect(resolvePagerRelease({ ...base, offsetX: -79, velocityX: 0 })).toBe(1)
  })

  it('caps the distance on a wide viewer', () => {
    expect(resolvePagerRelease({ ...base, width: 1200, offsetX: -(PAGER_DISTANCE_MAX_PX + 1), velocityX: 0 })).toBe(2)
    expect(resolvePagerRelease({ ...base, width: 1200, offsetX: -(PAGER_DISTANCE_MAX_PX - 1), velocityX: 0 })).toBe(1)
  })

  it('turns the page on a quick flick that travelled a little', () => {
    expect(resolvePagerRelease({ ...base, offsetX: -30, velocityX: -0.6 })).toBe(2)
    expect(resolvePagerRelease({ ...base, offsetX: 30, velocityX: 0.6 })).toBe(0)
  })

  it('does not turn on a twitch, a slow drag or a flick against the drag', () => {
    expect(resolvePagerRelease({ ...base, offsetX: -10, velocityX: -2 })).toBe(1)
    expect(resolvePagerRelease({ ...base, offsetX: -30, velocityX: -0.1 })).toBe(1)
    expect(resolvePagerRelease({ ...base, offsetX: -30, velocityX: 0.9 })).toBe(1)
    expect(resolvePagerRelease({ ...base, offsetX: 0, velocityX: -5 })).toBe(1)
  })

  it('never goes past the first or last photo', () => {
    expect(resolvePagerRelease({ index: 0, count: 4, width: 400, offsetX: 300, velocityX: 1 })).toBe(0)
    expect(resolvePagerRelease({ index: 3, count: 4, width: 400, offsetX: -300, velocityX: -1 })).toBe(3)
    expect(resolvePagerRelease({ index: 0, count: 1, width: 400, offsetX: -300, velocityX: -1 })).toBe(0)
  })

  it('falls back to the distance cap when the width is unknown', () => {
    expect(resolvePagerRelease({ ...base, width: 0, offsetX: -(PAGER_DISTANCE_MAX_PX + 1), velocityX: 0 })).toBe(2)
  })
})

describe('window velocity', () => {
  it('measures over the recent samples and signs by direction', () => {
    let samples = appendPositionSample([], { pos: 300, t: 0 })
    samples = appendPositionSample(samples, { pos: 260, t: 40 })
    samples = appendPositionSample(samples, { pos: 200, t: 80 })
    expect(windowPositionVelocity(samples)).toBeCloseTo(-100 / 80, 6)
    expect(windowPositionVelocity([])).toBe(0)
    expect(windowPositionVelocity([{ pos: 1, t: 1 }])).toBe(0)
  })

  it('drops samples older than the window but keeps the one before it', () => {
    let samples = appendPositionSample([], { pos: 0, t: 0 })
    samples = appendPositionSample(samples, { pos: 10, t: 50 })
    samples = appendPositionSample(samples, { pos: 20, t: 300 })
    expect(samples.map(sample => sample.t)).toEqual([50, 300])
    expect(windowPositionVelocity(samples)).toBeCloseTo(10 / 250, 6)
  })
})

describe('page helpers', () => {
  it('knows whether there is a photo on each side', () => {
    expect([hasPreviousPage({ index: 0, count: 3 }), hasNextPage({ index: 0, count: 3 })]).toEqual([false, true])
    expect([hasPreviousPage({ index: 2, count: 3 }), hasNextPage({ index: 2, count: 3 })]).toEqual([true, false])
    expect([hasPreviousPage({ index: 0, count: 1 }), hasNextPage({ index: 0, count: 1 })]).toEqual([false, false])
  })

  it('steps inside the photos', () => {
    expect(stepPagerIndex(1, 1, 3)).toBe(2)
    expect(stepPagerIndex(2, 1, 3)).toBe(2)
    expect(stepPagerIndex(0, -1, 3)).toBe(0)
    expect(stepPagerIndex(0, 5, 0)).toBe(0)
  })

  it('mounts the current photo and its neighbours only', () => {
    expect(pagerWindowIndices(0, 5)).toEqual([0, 1])
    expect(pagerWindowIndices(2, 5)).toEqual([1, 2, 3])
    expect(pagerWindowIndices(4, 5)).toEqual([3, 4])
    expect(pagerWindowIndices(0, 1)).toEqual([0])
    expect(pagerWindowIndices(0, 0)).toEqual([])
  })

  it('moves the track by whole viewer widths plus the finger offset', () => {
    expect(pagerTrackTransform(0, 0)).toBe('translate3d(calc(0% + 0px), 0, 0)')
    expect(pagerTrackTransform(2, -35)).toBe('translate3d(calc(-200% + -35px), 0, 0)')
  })
})
