import { describe, expect, it } from 'vitest'
import { pickBackdatedPublishAt } from './schedule'

const now = new Date('2026-11-23T06:00:00Z') // 15:00 KST

describe('review publish date', () => {
  it('falls between creation and now, never in the future', () => {
    const createdAt = new Date('2026-11-20T03:00:00Z')
    for (const r of [0, 0.25, 0.5, 0.99]) {
      const at = pickBackdatedPublishAt({ createdAt, now, personaCountry: 'KR', random: () => r })
      expect(at.getTime()).toBeGreaterThanOrEqual(createdAt.getTime())
      expect(at.getTime()).toBeLessThan(now.getTime())
    }
  })

  it('draws again instead of landing in the local night', () => {
    const createdAt = new Date('2026-11-22T15:00:00Z') // 00:00 KST
    const picks = [0.1, 0.9] // 00:30-ish KST (night), then ~13:00 KST
    let i = 0
    const at = pickBackdatedPublishAt({ createdAt, now, personaCountry: 'KR', random: () => picks[Math.min(i++, 1)] })
    const kstHour = (at.getUTCHours() + 9) % 24
    expect(kstHour).toBeGreaterThanOrEqual(8)
  })

  it('is now for a post written a moment ago', () => {
    expect(pickBackdatedPublishAt({ createdAt: new Date(now.getTime() - 10_000), now, personaCountry: 'JP' })).toEqual(now)
  })
})
