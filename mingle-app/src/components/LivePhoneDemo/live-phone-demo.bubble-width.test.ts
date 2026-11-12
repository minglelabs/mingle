import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetAllBubbleSizeFloors,
  isBubbleWidthFloorTooWide,
  readBubbleSizeFloor,
  rememberBubbleSizeFloor,
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
    expect(readBubbleSizeFloor('m1', 'k')).toEqual({ width: 180, height: 64 })
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
})
