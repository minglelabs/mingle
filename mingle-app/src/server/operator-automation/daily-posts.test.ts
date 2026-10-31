import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  reserveCreate: vi.fn(),
  reserveUpdateMany: vi.fn(),
  queryRaw: vi.fn(),
  persona: vi.fn(),
  texts: vi.fn(),
  generate: vi.fn(),
  draw: vi.fn(),
  canDraw: vi.fn(() => true),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: m.userFindMany },
    operatorPostReserve: { create: m.reserveCreate, updateMany: m.reserveUpdateMany },
    $queryRaw: m.queryRaw,
  },
}))
vi.mock('@/server/operator-post-reserve/worker', () => ({ loadReservePersona: m.persona, loadExistingReserveTexts: m.texts }))
vi.mock('@/server/operator-post-reserve/generate', () => ({
  generateReservePosts: m.generate,
  pickReserveTopics: () => ['food'],
  reservePosterProfile: () => ({ topicFactors: {} }),
}))
vi.mock('@/server/operator-post-reserve/post-image', () => ({ drawReservePostImage: m.draw }))
vi.mock('@/server/operator-avatars/generate', () => ({ canDrawImagesHere: m.canDraw, generateOperatorAvatar: vi.fn() }))
vi.mock('@/server/operators/create-operator', () => ({ createOperatorAccount: vi.fn() }))
vi.mock('@/server/operators/persona-draft', () => ({ generatePersonaDrafts: vi.fn() }))
vi.mock('@/server/operators/seed-plan', () => ({ mostUnderrepresentedCountry: () => 'KR' }))

import { koreanDay, writeDailyOperatorPosts } from './worker'
import { normalizeAutomationSettings, parseAutomationSettings } from './settings'

beforeEach(() => {
  vi.clearAllMocks()
  m.queryRaw.mockResolvedValue([{ low: -10 }])
  m.persona.mockResolvedValue({ language: 'ko' })
  m.texts.mockResolvedValue([])
  m.reserveCreate.mockResolvedValue({ id: 'r1' })
  m.reserveUpdateMany.mockResolvedValue({ count: 1 })
})

describe('daily operator posts', () => {
  it('uses the Korean calendar day', () => {
    expect(koreanDay(new Date('2026-10-31T14:59:00Z'))).toBe('2026-10-31')
    expect(koreanDay(new Date('2026-10-31T15:00:00Z'))).toBe('2026-11-01')
  })

  it('writes one post for each account that wins the roll, at the front of review, and draws its photo', async () => {
    m.userFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    m.generate.mockResolvedValue([{ topic: 'food', text: '라면', language: 'ko', imagePrompt: '[scene] ramen' }])
    m.draw.mockResolvedValue({ objectKey: 'post-images/a/1.jpg', width: 1280, height: 960 })
    const rolls = [0.1, 0.5, 0.15] // 20%: a and c win
    const result = await writeDailyOperatorPosts(20, new Date('2026-11-01T00:00:00Z'), () => rolls.shift() ?? 0.99)
    expect(result).toEqual({ accounts: 2, written: 2, failed: 0 })
    expect(m.reserveCreate).toHaveBeenCalledTimes(2)
    expect(m.reserveCreate.mock.calls[0][0].data).toMatchObject({ operatorUserId: 'a', state: 'review', reviewRank: -11, imagePrompt: '[scene] ramen', language: null })
    expect(m.draw).toHaveBeenCalledWith('a', '[scene] ramen')
    expect(m.reserveUpdateMany.mock.calls[0][0].data).toMatchObject({ imageObjectKey: 'post-images/a/1.jpg' })
  })

  it('reads and requires the posts rule in settings', () => {
    expect(normalizeAutomationSettings(null).posts).toEqual({ enabled: false, chancePercent: 20 })
    const body = { avatars: { enabled: false, intervalMinutes: 10 }, accounts: { enabled: true, perDay: 10, totalTarget: 100 }, posts: { enabled: true, chancePercent: 20 } }
    expect(parseAutomationSettings(body)).toMatchObject({ ok: true, settings: { posts: { enabled: true, chancePercent: 20 } } })
    expect(parseAutomationSettings({ ...body, posts: { enabled: true, chancePercent: 0 } })).toEqual({ ok: false, error: 'invalid_chance' })
  })
})
