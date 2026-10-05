import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settingFindUnique: vi.fn(),
  settingUpsert: vi.fn(),
  userFindFirst: vi.fn(),
  userCount: vi.fn(),
  auditFindFirst: vi.fn(),
  accountUpdateMany: vi.fn(),
  accountGroupBy: vi.fn(),
  setAvatar: vi.fn(),
  drafts: vi.fn(),
  createAccount: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminSetting: { findUnique: mocks.settingFindUnique, upsert: mocks.settingUpsert },
    user: { findFirst: mocks.userFindFirst, count: mocks.userCount },
    adminAuditLog: { findFirst: mocks.auditFindFirst },
    operatorAccount: { updateMany: mocks.accountUpdateMany, groupBy: mocks.accountGroupBy },
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: vi.fn() }))
vi.mock('@/server/operators/operator-avatar', () => ({ setOperatorAvatarFromBytes: mocks.setAvatar }))
vi.mock('@/server/operators/persona-draft', () => ({ generatePersonaDrafts: mocks.drafts }))
vi.mock('@/server/operators/create-operator', () => ({ createOperatorAccount: mocks.createAccount }))

import { normalizeAutomationSettings, parseAutomationSettings } from '@/server/operator-automation/settings'
import { __resetAvatarFailuresForTests, runOperatorAutomation } from '@/server/operator-automation/worker'
import { DEFAULT_SEED_PLAN, mostUnderrepresentedCountry } from '@/server/operators/seed-plan'
import { generateOperatorAvatar, requestAvatarImage, resolveAvatarImageModel } from './generate'
import { AVATAR_CATEGORIES, AVATAR_SUBTYPES, pickAvatarSpec, seededRandom, type AvatarPersona } from './taxonomy'

const NOW = new Date('2026-10-03T03:00:00.000Z')
const korean: AvatarPersona = { gender: 'female', name: '민아', age: 26, country: 'KR', countryName: 'South Korea', city: 'Seoul', bio: '커피랑 산책' }
const american: AvatarPersona = { gender: 'male', name: 'Jake', age: 31, country: 'US', countryName: 'United States', city: 'Chicago', bio: null }

function imageResponse(data = Buffer.from('png-bytes').toString('base64')) {
  return vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data } }] } }] }), { status: 200 }))
}

function sampleCategories(persona: AvatarPersona, count: number): Map<string, number> {
  const seen = new Map<string, number>()
  for (let index = 0; index < count; index += 1) {
    const { category } = pickAvatarSpec(persona, seededRandom(`sample:${index}`))
    seen.set(category, (seen.get(category) ?? 0) + 1)
  }
  return seen
}

describe('avatar taxonomy', () => {
  it('covers every kind of photo, with subtypes for each', () => {
    expect(AVATAR_CATEGORIES.map((entry) => entry.key)).toEqual(['face', 'partial', 'back', 'body', 'part', 'group', 'object', 'animal', 'scenery', 'other'])
    for (const { key } of AVATAR_CATEGORIES) expect(AVATAR_SUBTYPES[key].length).toBeGreaterThan(2)
    expect(AVATAR_SUBTYPES.back.length).toBeGreaterThanOrEqual(12)
    expect(AVATAR_SUBTYPES.body.length).toBeGreaterThanOrEqual(12)
  })

  it('is deterministic for one seed and different for another', () => {
    const first = pickAvatarSpec(korean, seededRandom('op_1:a'))
    expect(pickAvatarSpec(korean, seededRandom('op_1:a'))).toEqual(first)
    const others = new Set(Array.from({ length: 12 }, (_, index) => pickAvatarSpec(korean, seededRandom(`op_1:${index}`)).prompt))
    expect(others.size).toBeGreaterThan(8)
  })

  it('shows a face (whole or partly) in roughly half of the photos', () => {
    const seen = sampleCategories(american, 2000)
    const faces = (seen.get('face') ?? 0) + (seen.get('partial') ?? 0)
    expect(faces / 2000).toBeGreaterThan(0.4)
    expect(faces / 2000).toBeLessThan(0.65)
    for (const { key } of AVATAR_CATEGORIES) expect(seen.get(key) ?? 0).toBeGreaterThan(0)
  })

  it('hides the face more for East Asian accounts than for Western ones', () => {
    const kr = sampleCategories({ ...korean, bio: null }, 2000)
    const us = sampleCategories(american, 2000)
    expect(kr.get('face') ?? 0).toBeLessThan(us.get('face') ?? 0)
    expect(kr.get('partial') ?? 0).toBeGreaterThan(us.get('partial') ?? 0)
    expect(kr.get('back') ?? 0).toBeGreaterThan(us.get('back') ?? 0)
  })

  it('follows the bio: a cat person mostly gets a cat', () => {
    const seen = sampleCategories({ ...korean, bio: '고양이 두 마리 집사' }, 1000)
    expect(seen.get('animal') ?? 0).toBeGreaterThan(200)
  })

  it('keeps the outfit, light and flaws consistent with the person and the place', () => {
    for (let index = 0; index < 1500; index += 1) {
      const spec = pickAvatarSpec(american, seededRandom(`consistency:${index}`))
      expect(['dress', 'fitted_dress', 'crop', 'leggings']).not.toContain(spec.attributes.outfit)
      const outdoors = ['street', 'alley', 'park', 'riverside', 'beach', 'mountain', 'rooftop', 'market', 'campus', 'night_street', 'flower_field', 'travel_city', 'festival', 'stadium']
        .includes(spec.attributes.location ?? '')
      if (outdoors) expect(['window', 'fluorescent', 'warm_lamp', 'screen']).not.toContain(spec.attributes.lighting)
      if (spec.attributes.flaw === 'mirror_smudge') expect(spec.prompt).toMatch(/mirror/)
    }
  })

  it('describes the person from the account and never shows the face in a back or body photo', () => {
    for (let index = 0; index < 400; index += 1) {
      const spec = pickAvatarSpec(korean, seededRandom(`rules:${index}`))
      expect(spec.prompt).toContain('No text, captions, watermarks')
      expect(spec.prompt).toContain('adult')
      expect(spec.labelKo).toContain(' · ')
      if (['face', 'partial', 'back', 'body'].includes(spec.category)) {
        expect(spec.prompt).toContain('Korean woman in her late twenties')
      }
      if (spec.category === 'back') expect(spec.prompt).toContain('The face is not visible at all')
      if (spec.category === 'body') {
        expect(spec.prompt).toContain('The face is not visible')
        expect(spec.attributes.build).toBeTruthy()
      }
      if (spec.category === 'face') expect(spec.attributes.faceShape).toBeTruthy()
    }
  })
})

describe('seed plan', () => {
  it('starts with Korea and keeps the pool near the plan', () => {
    expect(mostUnderrepresentedCountry(new Map())).toBe('KR')
    const counts = new Map<string, number>()
    for (let index = 0; index < 100; index += 1) {
      const country = mostUnderrepresentedCountry(counts)
      counts.set(country, (counts.get(country) ?? 0) + 1)
    }
    expect(Object.fromEntries(counts)).toEqual(DEFAULT_SEED_PLAN)
  })
})

describe('avatar generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    vi.stubEnv('OPERATOR_AVATAR_IMAGE_MODEL', 'gemini-2.5-flash-image')
    mocks.userFindFirst.mockResolvedValue({
      name: '민아', bio: null, birthDate: new Date('2000-01-01'), locationCity: 'Seoul', locationCountry: 'South Korea',
      operatorAccount: { personaCountry: 'KR', personaGender: 'female' },
    })
    mocks.setAvatar.mockResolvedValue({ ok: true, image: 'https://img.example/a.jpg', objectKey: 'profiles/op_1/a.jpg' })
    mocks.accountUpdateMany.mockResolvedValue({ count: 1 })
  })

  it('uses the configured image model', () => {
    expect(resolveAvatarImageModel({} as NodeJS.ProcessEnv)).toBe('gpt-image-2')
    expect(resolveAvatarImageModel({ OPERATOR_AVATAR_IMAGE_MODEL: 'x' } as unknown as NodeJS.ProcessEnv)).toBe('x')
  })

  it('reports a missing key, an HTTP failure and a refusal without throwing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    expect(await requestAvatarImage('p')).toEqual({ ok: false, error: 'image_unavailable' })
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    expect(await requestAvatarImage('p', { fetchImpl: vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch }))
      .toEqual({ ok: false, error: 'image_request_failed', detail: 'http_500' })
    const refused = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'no' }] } }] }), { status: 200 }))
    expect(await requestAvatarImage('p', { fetchImpl: refused as unknown as typeof fetch })).toEqual({ ok: false, error: 'image_refused', detail: 'SAFETY' })
  })

  it('draws the picked spec, stores it as the avatar and saves the spec', async () => {
    const fetchImpl = imageResponse()
    const result = await generateOperatorAvatar(null, 'op_1', { nonce: 'n1', now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(result.ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('gemini-2.5-flash-image:generateContent')
    const body = JSON.parse(String(init.body))
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE'])
    expect(body.contents[0].parts[0].text).toContain('profile picture')
    expect(mocks.setAvatar).toHaveBeenCalledWith(null, 'op_1', Buffer.from('png-bytes'), expect.objectContaining({ generated: true }))
    expect(mocks.accountUpdateMany.mock.calls[0][0].data.avatarSpec.labelKo).toContain(' · ')
  })

  it('sends gpt models to OpenAI at low quality', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(await requestAvatarImage('p', { model: 'gpt-image-2' })).toEqual({ ok: false, error: 'image_unavailable' })
    vi.stubEnv('OPENAI_API_KEY', 'openai-key')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }] }), { status: 200 }))
    const result = await requestAvatarImage('a prompt', { model: 'gpt-image-2', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(result).toEqual({ ok: true, bytes: Buffer.from('png-bytes') })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/images/generations')
    expect(JSON.parse(String(init.body))).toEqual({ model: 'gpt-image-2', prompt: 'a prompt', size: '1024x1024', quality: 'low', n: 1 })
    const refused = vi.fn(async () => new Response('{}', { status: 400 }))
    expect(await requestAvatarImage('p', { model: 'gpt-image-2', fetchImpl: refused as unknown as typeof fetch })).toEqual({ ok: false, error: 'image_refused', detail: 'http_400' })
  })

  it('is not_operator for an unknown account', async () => {
    mocks.userFindFirst.mockResolvedValue(null)
    expect(await generateOperatorAvatar(null, 'nope')).toEqual({ ok: false, error: 'not_operator' })
  })
})

describe('automation rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetAvatarFailuresForTests()
    mocks.settingUpsert.mockResolvedValue({})
  })

  it('is off by default and validates staff input', () => {
    expect(normalizeAutomationSettings(null)).toEqual({ avatars: { enabled: false, intervalMinutes: 10 }, accounts: { enabled: false, perDay: 5, totalTarget: 100 } })
    expect(parseAutomationSettings({ avatars: { enabled: true, intervalMinutes: 0 }, accounts: { enabled: false, perDay: 5, totalTarget: 100 } })).toEqual({ ok: false, error: 'invalid_interval' })
    expect(parseAutomationSettings({ avatars: { enabled: true, intervalMinutes: 10 }, accounts: { enabled: true, perDay: 3, totalTarget: 150 } }).ok).toBe(true)
  })

  it('does nothing while both rules are off', async () => {
    mocks.settingFindUnique.mockResolvedValue(null)
    expect(await runOperatorAutomation({ now: () => NOW })).toEqual({ avatar: 'off', account: 'off' })
    expect(mocks.userFindFirst).not.toHaveBeenCalled()
  })

  it('waits for the interval, then creates one account and looks for one photo', async () => {
    const settings = { avatars: { enabled: true, intervalMinutes: 10 }, accounts: { enabled: true, perDay: 4, totalTarget: 100 } }
    const state = (lastAvatarAt: string | null, lastAccountAt: string | null) => {
      mocks.settingFindUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (
        where.key === 'operator_automation' ? { value: settings } : { value: { lastAvatarAt, lastAccountAt } }
      ))
    }
    const recent = new Date(NOW.getTime() - 60_000).toISOString()
    state(recent, recent)
    expect(await runOperatorAutomation({ now: () => NOW })).toEqual({ avatar: 'waiting', account: 'waiting' })

    state(new Date(NOW.getTime() - 11 * 60_000).toISOString(), new Date(NOW.getTime() - 7 * 60 * 60_000).toISOString())
    mocks.accountGroupBy.mockResolvedValue([{ personaCountry: 'KR', _count: { _all: 1 } }])
    mocks.drafts.mockResolvedValue({ drafts: [{ name: 'Yui', handle: 'yui' }], missing: 0 })
    mocks.createAccount.mockResolvedValue({ userId: 'op_new', handle: 'yui', requestedHandle: 'yui', bioQueued: false })
    mocks.userFindFirst.mockResolvedValue(null) // no account without a photo
    expect(await runOperatorAutomation({ now: () => NOW })).toEqual({ avatar: 'none', account: 'created' })
    expect(mocks.drafts.mock.calls[0][0]).toMatchObject({ count: 1, countries: ['JP'] })
    expect(mocks.createAccount).toHaveBeenCalledWith(expect.objectContaining({ sessionId: null }), { name: 'Yui', handle: 'yui' }, expect.anything())
  })

  it('stops creating accounts at the target', async () => {
    mocks.settingFindUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (
      where.key === 'operator_automation'
        ? { value: { avatars: { enabled: false, intervalMinutes: 10 }, accounts: { enabled: true, perDay: 4, totalTarget: 3 } } }
        : null
    ))
    mocks.accountGroupBy.mockResolvedValue([{ personaCountry: 'KR', _count: { _all: 3 } }])
    expect(await runOperatorAutomation({ now: () => NOW })).toEqual({ avatar: 'off', account: 'target_reached' })
    expect(mocks.drafts).not.toHaveBeenCalled()
  })
})
