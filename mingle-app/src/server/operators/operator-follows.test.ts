import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/feed/starter-feed', () => ({ loadStarterFeed: vi.fn() }))

import { followAppeal, pickByAppeal } from './operator-follows'

describe('operator follows', () => {
  it('rank starter authors and striking faces far above the rest', () => {
    expect(followAppeal({ attributes: { attractiveness: 'pleasant' } }, true)).toBe(6)
    expect(followAppeal({ attributes: { attractiveness: 'striking' } }, false)).toBe(5)
    expect(followAppeal({ attributes: { attractiveness: 'ordinary' } }, false)).toBeLessThan(1)
    expect(followAppeal(null, false)).toBeLessThan(1)
  })

  it('pick distinct accounts, the appealing ones far more often', () => {
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const pool = [
      { id: 'hot', createdAt: new Date(0), appeal: 6 },
      ...Array.from({ length: 20 }, (_, index) => ({ id: `plain${index}`, createdAt: new Date(0), appeal: 0.5 })),
    ]
    let hot = 0
    for (let run = 0; run < 300; run += 1) {
      const picked = pickByAppeal(pool, 3, random)
      expect(new Set(picked.map((candidate) => candidate.id)).size).toBe(3)
      if (picked.some((candidate) => candidate.id === 'hot')) hot += 1
    }
    expect(hot / 300).toBeGreaterThan(0.6)
  })
})
