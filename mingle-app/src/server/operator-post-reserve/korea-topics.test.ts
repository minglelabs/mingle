import { describe, expect, it } from 'vitest'
import { seededRandom } from '@/server/operator-avatars/taxonomy'
import { isKoreaCountry, KOREA_TOPIC_WEIGHTS, pickReserveTopics } from './generate'

describe('Korea topics', () => {
  const koreaKeys = Object.keys(KOREA_TOPIC_WEIGHTS)

  it('are written only by accounts outside Korea', () => {
    const random = seededRandom('korea-topics')
    const home = Array.from({ length: 30 }, () => pickReserveTopics(20, random)).flat()
    expect(home.some((key) => koreaKeys.includes(key))).toBe(false)
    const abroad = Array.from({ length: 30 }, () => pickReserveTopics(20, random, {}, { korea: true })).flat()
    const share = abroad.filter((key) => koreaKeys.includes(key)).length / abroad.length
    expect(share).toBeGreaterThan(0.15)
    expect(share).toBeLessThan(0.35)
  })

  it('knows a Korean persona by code or name', () => {
    expect(isKoreaCountry('KR')).toBe(true)
    expect(isKoreaCountry('South Korea')).toBe(true)
    expect(isKoreaCountry('Japan')).toBe(false)
    expect(isKoreaCountry(null)).toBe(false)
  })
})
