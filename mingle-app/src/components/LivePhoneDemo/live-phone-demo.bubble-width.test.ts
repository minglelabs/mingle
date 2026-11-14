import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetAllBubbleSizeFloors,
  isBubbleWidthFloorTooWide,
  readBubbleSizeFloor,
  rememberBubbleSizeFloor,
  resolveBubbleSizeFloor,
} from './live-phone-demo.bubble-width'

describe('bubble size floor', () => {
  beforeEach(() => forgetAllBubbleSizeFloors())

  it('keeps the widest width a message has reached', () => {
    rememberBubbleSizeFloor('m1', 'text-sm|390', { width: 180, height: 90 })
    expect(readBubbleSizeFloor('m1', 'text-sm|390').width).toBe(180)
    expect(readBubbleSizeFloor('m2', 'text-sm|390').width).toBe(0)
  })

  it('keeps the tallest height too, so a shorter rewrite does not shrink the bubble', () => {
    rememberBubbleSizeFloor('m1', 'k', { width: 180, height: 64 })
    expect(readBubbleSizeFloor('m1', 'k')).toEqual({ width: 180, height: 64, shrinkSince: null })
  })

  it('starts over when the text size or the viewport width changed', () => {
    rememberBubbleSizeFloor('m1', 'text-sm|390', { width: 180, height: 90 })
    expect(readBubbleSizeFloor('m1', 'text-lg|390').width).toBe(0)
    expect(readBubbleSizeFloor('m1', 'text-sm|844').width).toBe(0)
  })

  it('forgets a message whose floor was dropped', () => {
    rememberBubbleSizeFloor('m1', 'text-sm|390', { width: 180, height: 90 })
    rememberBubbleSizeFloor('m1', 'text-sm|390', { width: 0, height: 0 })
    expect(readBubbleSizeFloor('m1', 'text-sm|390').width).toBe(0)
  })

  it('forgets the message untouched for the longest once too many are remembered', () => {
    for (let index = 0; index < 400; index++) rememberBubbleSizeFloor(`m${index}`, 'k', { width: 100, height: 50 })
    rememberBubbleSizeFloor('m0', 'k', { width: 120, height: 60 })
    rememberBubbleSizeFloor('extra', 'k', { width: 100, height: 50 })
    expect(readBubbleSizeFloor('m0', 'k').width).toBe(120)
    expect(readBubbleSizeFloor('m1', 'k').width).toBe(0)
    expect(readBubbleSizeFloor('extra', 'k').width).toBe(100)
  })

  it('gives way only when the bubble no longer fits its slot', () => {
    expect(isBubbleWidthFloorTooWide(300, 280)).toBe(true)
    expect(isBubbleWidthFloorTooWide(280, 280)).toBe(false)
    expect(isBubbleWidthFloorTooWide(280.4, 280)).toBe(false)
  })

  const timing = { holdMs: 800, easeMs: 1200 }

  it('grows at once', () => {
    const floor = { width: 200, height: 80, shrinkSince: null }
    expect(resolveBubbleSizeFloor(floor, { width: 220, height: 90 }, 0, timing)).toEqual({
      width: 220, height: 90, shrinkSince: null, shown: { width: 220, height: 90 }, retryInMs: null,
    })
  })

  it('holds a smaller size still, then eases down to it within two seconds', () => {
    const floor = { width: 200, height: 80, shrinkSince: null }
    const natural = { width: 190, height: 56 }

    const held = resolveBubbleSizeFloor(floor, natural, 1000, timing)
    expect(held).toEqual({
      width: 200, height: 80, shrinkSince: 1000, shown: { width: 200, height: 80 }, retryInMs: 800,
    })
    const stillHeld = resolveBubbleSizeFloor(held, natural, 1500, timing)
    expect(stillHeld.shown).toEqual({ width: 200, height: 80 })
    expect(stillHeld.retryInMs).toBe(300)

    // Easing: the floor itself stays, only what is shown comes down.
    const halfway = resolveBubbleSizeFloor(stillHeld, natural, 1800 + 600, timing)
    expect(halfway).toMatchObject({ width: 200, height: 80, shrinkSince: 1000, retryInMs: 0 })
    expect(halfway.shown.width).toBeCloseTo(195)
    expect(halfway.shown.height).toBeCloseTo(68)

    const early = resolveBubbleSizeFloor(stillHeld, natural, 1800 + 120, timing)
    const late = resolveBubbleSizeFloor(stillHeld, natural, 1800 + 1080, timing)
    expect(early.shown.height).toBeGreaterThan(79.9)
    expect(early.shown.height).toBeLessThan(80)
    expect(late.shown.height).toBeLessThan(56.1)
    expect(late.shown.height).toBeGreaterThan(56)

    expect(resolveBubbleSizeFloor(halfway, natural, 3000, timing)).toEqual({
      width: 190, height: 56, shrinkSince: null, shown: natural, retryInMs: null,
    })
  })

  it('never shows a size below the content while easing', () => {
    const floor = { width: 200, height: 80, shrinkSince: 0 }
    for (let now = 0; now <= 2000; now += 50) {
      const step = resolveBubbleSizeFloor(floor, { width: 210, height: 56 }, now, timing)
      expect(step.shown.width).toBeGreaterThanOrEqual(210)
      expect(step.shown.height).toBeGreaterThanOrEqual(56)
      expect(step.shown.height).toBeLessThanOrEqual(80)
    }
  })

  it('takes the size in one step after the full wait when there is no easing', () => {
    const floor = { width: 200, height: 80, shrinkSince: 0 }
    const natural = { width: 200, height: 56 }
    const noEase = { holdMs: 2000, easeMs: 0 }
    expect(resolveBubbleSizeFloor(floor, natural, 1999, noEase).shown).toEqual({ width: 200, height: 80 })
    expect(resolveBubbleSizeFloor(floor, natural, 2000, noEase).shown).toEqual(natural)
  })

  it('cancels a waiting or easing shrink once the content fills the floor again', () => {
    const held = { width: 200, height: 80, shrinkSince: 1000 }
    for (const now of [1500, 2500]) {
      expect(resolveBubbleSizeFloor(held, { width: 200, height: 80 }, now, timing)).toEqual({
        width: 200, height: 80, shrinkSince: null, shown: { width: 200, height: 80 }, retryInMs: null,
      })
    }
  })

  it('keeps the waiting start across a remount of the same message', () => {
    rememberBubbleSizeFloor('m1', 'k', { width: 200, height: 80, shrinkSince: 1000 })
    expect(readBubbleSizeFloor('m1', 'k').shrinkSince).toBe(1000)
  })
})
