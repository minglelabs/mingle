import { beforeEach, describe, expect, it } from 'vitest'
import {
  forgetAllBubbleWidthFloors,
  isBubbleWidthFloorTooWide,
  readBubbleWidthFloor,
  rememberBubbleWidthFloor,
} from './live-phone-demo.bubble-width'

describe('bubble width floor', () => {
  beforeEach(() => forgetAllBubbleWidthFloors())

  it('keeps the widest width a message has reached', () => {
    rememberBubbleWidthFloor('m1', 'text-sm|390', 180)
    expect(readBubbleWidthFloor('m1', 'text-sm|390')).toBe(180)
    expect(readBubbleWidthFloor('m2', 'text-sm|390')).toBe(0)
  })

  it('starts over when the text size or the viewport width changed', () => {
    rememberBubbleWidthFloor('m1', 'text-sm|390', 180)
    expect(readBubbleWidthFloor('m1', 'text-lg|390')).toBe(0)
    expect(readBubbleWidthFloor('m1', 'text-sm|844')).toBe(0)
  })

  it('forgets a message whose floor was dropped', () => {
    rememberBubbleWidthFloor('m1', 'text-sm|390', 180)
    rememberBubbleWidthFloor('m1', 'text-sm|390', 0)
    expect(readBubbleWidthFloor('m1', 'text-sm|390')).toBe(0)
  })

  it('forgets the message untouched for the longest once too many are remembered', () => {
    for (let index = 0; index < 400; index++) rememberBubbleWidthFloor(`m${index}`, 'k', 100)
    rememberBubbleWidthFloor('m0', 'k', 120)
    rememberBubbleWidthFloor('extra', 'k', 100)
    expect(readBubbleWidthFloor('m0', 'k')).toBe(120)
    expect(readBubbleWidthFloor('m1', 'k')).toBe(0)
    expect(readBubbleWidthFloor('extra', 'k')).toBe(100)
  })

  it('gives way only when the bubble no longer fits its slot', () => {
    expect(isBubbleWidthFloorTooWide(300, 280)).toBe(true)
    expect(isBubbleWidthFloorTooWide(280, 280)).toBe(false)
    expect(isBubbleWidthFloorTooWide(280.4, 280)).toBe(false)
  })
})
