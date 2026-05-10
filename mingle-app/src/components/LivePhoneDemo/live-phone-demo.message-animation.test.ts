import { describe, expect, it } from 'vitest'
import { resolveAnimatedLiveDemoMessageIds } from './live-phone-demo.message-animation'

describe('live-phone-demo message animation logic', () => {
  it('does not animate the initial rendered batch', () => {
    const animatedIds = resolveAnimatedLiveDemoMessageIds({
      previousIds: null,
      nextIds: Array.from({ length: 500 }, (_, index) => `u-${index}`),
    })

    expect(animatedIds.size).toBe(0)
  })

  it('limits appended message animation to the latest inserted message by default', () => {
    const animatedIds = resolveAnimatedLiveDemoMessageIds({
      previousIds: ['u-1', 'u-2'],
      nextIds: ['u-1', 'u-2', 'u-3', 'u-4'],
    })

    expect([...animatedIds]).toEqual(['u-4'])
  })

  it('animates the first message added after an empty chat has already rendered', () => {
    const animatedIds = resolveAnimatedLiveDemoMessageIds({
      previousIds: [],
      nextIds: ['u-1'],
    })

    expect([...animatedIds]).toEqual(['u-1'])
  })

  it('does not animate older messages prepended above the current viewport', () => {
    const animatedIds = resolveAnimatedLiveDemoMessageIds({
      previousIds: ['u-3', 'u-4'],
      nextIds: ['u-1', 'u-2', 'u-3', 'u-4'],
    })

    expect(animatedIds.size).toBe(0)
  })

  it('does not animate non-trailing insertions that are not the latest append', () => {
    const animatedIds = resolveAnimatedLiveDemoMessageIds({
      previousIds: ['u-1', 'u-3', 'u-4'],
      nextIds: ['u-1', 'u-2', 'u-3', 'u-4'],
    })

    expect(animatedIds.size).toBe(0)
  })
})
