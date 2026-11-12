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

  it('grows at once and holds a smaller size for two seconds before shrinking', () => {
    const floor = { width: 200, height: 80, shrinkSince: null }
    expect(resolveBubbleSizeFloor(floor, { width: 220, height: 90 }, 0))
      .toEqual({ width: 220, height: 90, shrinkSince: null, retryInMs: null })

    const held = resolveBubbleSizeFloor(floor, { width: 200, height: 56 }, 1000, 2000)
    expect(held).toEqual({ width: 200, height: 80, shrinkSince: 1000, retryInMs: 2000 })

    const stillHeld = resolveBubbleSizeFloor(held, { width: 190, height: 56 }, 2500, 2000)
    expect(stillHeld).toEqual({ width: 200, height: 80, shrinkSince: 1000, retryInMs: 500 })

    expect(resolveBubbleSizeFloor(stillHeld, { width: 190, height: 56 }, 3000, 2000))
      .toEqual({ width: 190, height: 56, shrinkSince: null, retryInMs: null })
  })

  it('cancels a waiting shrink once the content fills the floor again', () => {
    const held = { width: 200, height: 80, shrinkSince: 1000 }
    expect(resolveBubbleSizeFloor(held, { width: 200, height: 80 }, 2500, 2000))
      .toEqual({ width: 200, height: 80, shrinkSince: null, retryInMs: null })
  })

  it('keeps the waiting start across a remount of the same message', () => {
    rememberBubbleSizeFloor('m1', 'k', { width: 200, height: 80, shrinkSince: 1000 })
    expect(readBubbleSizeFloor('m1', 'k').shrinkSince).toBe(1000)
  })
})
