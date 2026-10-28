import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { applyStarterOrder, starterSegmentFor } from './starter-feed'

describe('starter feed', () => {
  it('leads with the unseen starter posts in the chosen order', () => {
    expect(applyStarterOrder(['a', 'b', 'c', 'd', 'e'], ['d', 'b', 'x'], new Set())).toEqual(['d', 'b', 'a', 'c', 'e'])
  })

  it('leaves seen starter posts where the ranking put them', () => {
    expect(applyStarterOrder(['a', 'b', 'c', 'd'], ['d', 'b'], new Set(['d']))).toEqual(['b', 'a', 'c', 'd'])
  })

  it('splits readers into Korean and everyone else', () => {
    expect(starterSegmentFor('ko')).toBe('ko')
    expect(starterSegmentFor('ko-KR,ko;q=0.9')).toBe('ko')
    expect(starterSegmentFor('ja')).toBe('foreign')
    expect(starterSegmentFor(null)).toBe('foreign')
  })
})
