import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settingFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  reserveUpdateMany: vi.fn(),
  reserveFindMany: vi.fn(),
  reserveCreateMany: vi.fn(),
  userFindFirst: vi.fn(),
  postFindMany: vi.fn(),
  audit: vi.fn(),
  publishPost: vi.fn(),
  checkOperator: vi.fn(),
  generateJson: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminSetting: { findUnique: mocks.settingFindUnique },
    operatorPostReserve: { updateMany: mocks.reserveUpdateMany, findMany: mocks.reserveFindMany, createMany: mocks.reserveCreateMany },
    user: { findFirst: mocks.userFindFirst },
    post: { findMany: mocks.postFindMany },
    $queryRaw: mocks.queryRaw,
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mocks.audit }))
vi.mock('@/server/posts/publish-post', () => ({ publishPost: mocks.publishPost }))
vi.mock('@/server/operator-posts/operator-check', () => ({
  checkOperatorForPosting: mocks.checkOperator,
  personaLanguageOf: () => 'ko',
}))
vi.mock('@/server/llm/generate-json', () => ({ generateJson: mocks.generateJson }))

import { DEFAULT_SEED_PLAN, defaultSeedRows, parseSeedCount, seedPlanTotal } from '@/app/admin/operators/seed/seed-plan'
import { cleanReservePost, generateReservePosts, pickReserveTopics, RESERVE_TOPICS, reservePostKey } from './generate'
import { avoidLocalNight, nextReleaseAt, utcOffsetHoursOf } from './schedule'
import { normalizePostReserveSettings, parsePostReserveDailyPercent, parsePostReserveTarget, postsPerDay } from './settings'
import { reserveClientPostId, runOperatorPostReserve } from './worker'

const NOW = new Date('2026-10-03T03:00:00.000Z') // 12:00 in Korea
const HOUR = 60 * 60_000
const persona = { name: '민아', bio: '커피랑 산책', age: 26, city: 'Seoul', country: 'South Korea', language: 'ko' }

function answer(posts: Array<{ slot: number; text: string; photo?: string }>) {
  mocks.generateJson.mockImplementation(async (request: { validate: (value: unknown) => unknown }) => request.validate({ posts }))
}

describe('post reserve settings', () => {
  it('defaults to off, 200 posts and 1% a day (2 posts per account per day)', () => {
    const settings = normalizePostReserveSettings(null)
    expect(settings).toEqual({ enabled: false, targetPerOperator: 200, dailyPercent: 1 })
    expect(postsPerDay(settings)).toBe(2)
  })

  it('validates the target and the percentage', () => {
    expect(parsePostReserveTarget('200')).toBe(200)
    expect(parsePostReserveTarget(9)).toBeNull()
    expect(parsePostReserveTarget(501)).toBeNull()
    expect(parsePostReserveDailyPercent('0.5')).toBe(0.5)
    expect(parsePostReserveDailyPercent(0)).toBeNull()
    expect(parsePostReserveDailyPercent(11)).toBeNull()
  })
})

describe('release schedule', () => {
  it('knows the persona countries and falls back to UTC', () => {
    expect(utcOffsetHoursOf('kr')).toBe(9)
    expect(utcOffsetHoursOf(null)).toBe(0)
  })

  it('moves a night-time release to the local morning', () => {
    const night = new Date('2026-10-03T18:30:00.000Z') // 03:30 in Korea
    const moved = avoidLocalNight(night, 9, () => 0.5)
    expect(moved.toISOString()).toBe('2026-10-04T00:30:00.000Z') // 09:30 in Korea
    const day = new Date('2026-10-03T05:00:00.000Z')
    expect(avoidLocalNight(day, 9, () => 0.5)).toBe(day)
  })

  it('spaces an account\'s posts by a jittered share of the day', () => {
    const lastAt = new Date(NOW.getTime() - HOUR)
    const soonest = nextReleaseAt({ now: NOW, lastAt, postsPerDay: 2, personaCountry: 'KR', random: () => 0 })
    const latest = nextReleaseAt({ now: NOW, lastAt, postsPerDay: 2, personaCountry: 'KR', random: () => 0.999 })
    expect(soonest.getTime() - lastAt.getTime()).toBeCloseTo(12 * HOUR * 0.6, -4)
    expect(latest.getTime() - lastAt.getTime()).toBeGreaterThan(12 * HOUR)
    expect(latest.getTime() - lastAt.getTime()).toBeLessThan(12 * HOUR * 1.4 + 11 * HOUR)
  })

  it('starts a new account inside its first gap and an overdue one soon', () => {
    const first = nextReleaseAt({ now: NOW, lastAt: null, postsPerDay: 2, personaCountry: 'KR', random: () => 0.25 })
    expect(first.getTime() - NOW.getTime()).toBe(3 * HOUR)
    const overdue = nextReleaseAt({ now: NOW, lastAt: new Date(NOW.getTime() - 72 * HOUR), postsPerDay: 2, personaCountry: 'KR', random: () => 0.5 })
    expect(overdue.getTime() - NOW.getTime()).toBeLessThanOrEqual(5 * 60_000)
  })
})

describe('reserve post generation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('picks varied topics from the catalog', () => {
    const topics = pickReserveTopics(20)
    expect(topics).toHaveLength(20)
    const keys = new Set(RESERVE_TOPICS.map((topic) => topic.key))
    expect(topics.every((topic) => keys.has(topic))).toBe(true)
    for (const key of keys) expect(topics.filter((topic) => topic === key).length).toBeLessThanOrEqual(2)
  })

  it('rejects contact details, hashtags, the app name and over-long text', () => {
    expect(cleanReservePost('  오늘 커피 맛있다  ')).toBe('오늘 커피 맛있다')
    expect(cleanReservePost('카톡 주세요 https://example.com')).toBeNull()
    expect(cleanReservePost('맛집 #서울')).toBeNull()
    expect(cleanReservePost('Mingle 재밌네')).toBeNull()
    expect(cleanReservePost('가'.repeat(401))).toBeNull()
    expect(cleanReservePost(3)).toBeNull()
  })

  it('compares posts ignoring case, spacing and punctuation', () => {
    expect(reservePostKey('Hello,  World!')).toBe(reservePostKey('hello world'))
  })

  it('keeps one valid, new post per slot', async () => {
    answer([
      { slot: 1, text: '김치찌개 끓였는데 생각보다 잘 됐다' },
      { slot: 1, text: '같은 슬롯 두 번째' },
      { slot: 2, text: '이미 있는 글!' },
      { slot: 3, text: '링크 https://a.example' },
      { slot: 9, text: '없는 슬롯' },
    ])
    const posts = await generateReservePosts({ persona, topics: ['food', 'thought', 'hobby'], existingTexts: ['이미 있는 글'], random: () => 0.99 })
    expect(posts).toEqual([{ topic: 'food', text: '김치찌개 끓였는데 생각보다 잘 됐다', language: 'ko', imagePrompt: null }])
    const request = mocks.generateJson.mock.calls[0][0]
    expect(request.input.slots).toHaveLength(3)
    expect(request.instructions).toContain('(ko)')
    expect(request.instructions).toContain('Never mention a date')
  })

  it('attaches a photo description and writes learner posts in the language being learned', async () => {
    answer([{ slot: 1, text: '오늘 라멘 먹었어요', photo: '  a bowl of ramen on a   counter ' }])
    const posts = await generateReservePosts({
      persona: { ...persona, language: 'ja' }, topics: ['food'], existingTexts: [], random: () => 0, seed: 'op_ja',
    })
    expect(posts).toEqual([{ topic: 'food', text: '오늘 라멘 먹었어요', language: 'ko', imagePrompt: 'a bowl of ramen on a counter' }])
    const request = mocks.generateJson.mock.calls[0][0]
    expect(request.input.slots[0]).toMatchObject({ language: 'ko', photo: true })
    expect(request.input.learner.language).toBe('ko')
  })

  it('drops a photo description the slot did not ask for', async () => {
    answer([{ slot: 1, text: '그냥 글', photo: 'a cat' }])
    const posts = await generateReservePosts({ persona, topics: ['thought'], existingTexts: [], random: () => 0.99 })
    expect(posts[0].imagePrompt).toBeNull()
  })
})

describe('reserve worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reserveUpdateMany.mockResolvedValue({ count: 1 })
    mocks.checkOperator.mockResolvedValue({ ok: true, account: { id: 'op_1', primaryLanguages: ['ko'] } })
    mocks.publishPost.mockResolvedValue({ kind: 'created', post: { id: 'post_1' } })
  })

  it('does nothing while the reserve is off', async () => {
    mocks.settingFindUnique.mockResolvedValue(null)
    expect(await runOperatorPostReserve({ now: () => NOW })).toMatchObject({ enabled: false, released: 0, generated: 0 })
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('releases due posts, schedules the next one and refills an account', async () => {
    mocks.settingFindUnique.mockResolvedValue({ value: { enabled: true, targetPerOperator: 200, dailyPercent: 1 } })
    mocks.queryRaw
      .mockResolvedValueOnce([{ id: 'r1', operatorUserId: 'op_1', text: '산책 다녀옴', attempts: 1 }]) // claim
      .mockResolvedValueOnce([{ operatorUserId: 'op_1', personaCountry: 'KR', lastAt: NOW, headId: 'r2' }]) // unscheduled
      .mockResolvedValueOnce([{ operatorUserId: 'op_1', waiting: 40 }]) // refill
    mocks.userFindFirst.mockResolvedValue({ name: '민아', bio: null, birthDate: null, locationCity: 'Seoul', locationCountry: 'South Korea', primaryLanguages: ['ko'] })
    mocks.reserveFindMany.mockResolvedValue([])
    mocks.postFindMany.mockResolvedValue([])
    answer([{ slot: 1, text: '요즘 일본어 공부가 재밌다' }, { slot: 2, text: '다들 아침에 뭐 먹어?' }])
    mocks.reserveCreateMany.mockResolvedValue({ count: 2 })

    const summary = await runOperatorPostReserve({ now: () => NOW, random: () => 0.5 })
    expect(summary).toEqual({ enabled: true, released: 1, releaseFailed: 0, scheduled: 1, refilledAccounts: 1, generated: 2 })
    expect(mocks.publishPost).toHaveBeenCalledWith(expect.objectContaining({
      authorId: 'op_1', text: '산책 다녀옴', imageObjectKey: null, clientPostId: reserveClientPostId('r1'),
    }))
    expect(mocks.audit).toHaveBeenCalledWith(null, expect.objectContaining({ action: 'operator_post.reserve_published', targetId: 'post_1' }))
    const scheduleCall = mocks.reserveUpdateMany.mock.calls.find(([args]) => args.where.id === 'r2')
    expect(scheduleCall?.[0].data.releaseAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(mocks.reserveCreateMany.mock.calls[0][0].data).toHaveLength(2)
  })

  it('fails a post of a retired account instead of publishing it', async () => {
    mocks.settingFindUnique.mockResolvedValue({ value: { enabled: true } })
    mocks.checkOperator.mockResolvedValue({ ok: false, reason: 'operator_inactive' })
    mocks.queryRaw
      .mockResolvedValueOnce([{ id: 'r1', operatorUserId: 'op_1', text: 'x', attempts: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const summary = await runOperatorPostReserve({ now: () => NOW })
    expect(summary).toMatchObject({ released: 0, releaseFailed: 1 })
    expect(mocks.publishPost).not.toHaveBeenCalled()
  })
})

describe('seed plan', () => {
  it('defaults to 100 accounts centered on Korea and Japan', () => {
    const rows = defaultSeedRows()
    expect(seedPlanTotal(rows)).toBe(100)
    expect(DEFAULT_SEED_PLAN.KR + DEFAULT_SEED_PLAN.JP).toBe(44)
    expect(Object.keys(DEFAULT_SEED_PLAN).every((code) => rows.some((row) => row.code === code))).toBe(true)
  })

  it('reads typed counts defensively', () => {
    expect(parseSeedCount('12')).toBe(12)
    expect(parseSeedCount('-3')).toBe(0)
    expect(parseSeedCount('999')).toBe(200)
    expect(parseSeedCount('abc')).toBe(0)
  })
})
