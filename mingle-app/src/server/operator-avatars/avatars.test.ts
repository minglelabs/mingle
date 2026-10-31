import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settingFindUnique: vi.fn(),
  settingUpsert: vi.fn(),
  queryRaw: vi.fn(async () => [{ low: null }]),
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
    $queryRaw: mocks.queryRaw,
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: vi.fn() }))
vi.mock('@/server/operators/operator-avatar', () => ({ setOperatorAvatarFromBytes: mocks.setAvatar }))
vi.mock('@/server/operators/persona-draft', () => ({ generatePersonaDrafts: mocks.drafts }))
vi.mock('@/server/operators/create-operator', () => ({ createOperatorAccount: mocks.createAccount }))

import { normalizeAutomationSettings, parseAutomationSettings } from '@/server/operator-automation/settings'
import { __resetAvatarFailuresForTests, runOperatorAutomation } from '@/server/operator-automation/worker'
import { DEFAULT_SEED_PLAN, mostUnderrepresentedCountry } from '@/server/operators/seed-plan'
import { generateOperatorAvatar, isProxyImageModel, requestAvatarImage, resolveAvatarImageModel, resolveImageProxyUrl } from './generate'
import { AVATAR_CATEGORIES, AVATAR_SUBTYPES, pickAvatarSpec, seededRandom, type AvatarPersona } from './taxonomy'
import { describeFace, type FaceGrade } from './face-anatomy'

const NOW = new Date('2026-10-03T03:00:00.000Z')
const korean: AvatarPersona = { gender: 'female', name: '민아', age: 26, country: 'KR', countryName: 'South Korea', city: 'Seoul', bio: '커피랑 산책' }
const american: AvatarPersona = { gender: 'male', name: 'Jake', age: 31, country: 'US', countryName: 'United States', city: 'Chicago', bio: null }

function imageResponse(data = Buffer.from('png-bytes').toString('base64')) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: `![image](data:image/png;base64,${data})` } }] }), { status: 200 }))
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
      expect(spec.prompt).toMatch(/No (other )?text, captions, watermarks/)
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
      if (spec.category === 'face') {
        expect(spec.prompt).toContain('unmistakably Korean features')
        // A striking face is asked for in the abstract with an impression word; others name a few traits.
        if (spec.attributes.attractiveness === 'striking') {
          expect(spec.prompt).toContain('not the typical AI beauty')
          expect(spec.prompt).toContain('the overall impression of the face: ')
          expect(spec.prompt).toContain('the slight natural asymmetry of a real face')
          // Three or four subtle real-face details, each from a different area.
          const subtle = Object.keys(spec.attributes).filter((key) => key.startsWith('subtle_'))
          expect(subtle.length).toBeGreaterThanOrEqual(3)
          expect(subtle.length).toBeLessThanOrEqual(4)
          expect(spec.prompt).toContain('very subtle details of a real face')
          expect(spec.prompt).toContain('a distinctive look of their own')
          expect(spec.prompt).not.toContain('unlike a typical pretty face')
          expect(spec.prompt).not.toContain('what people notice about the face')
        } else {
          expect(spec.prompt).toContain('what people notice about the face')
          if (spec.attributes.attractiveness === 'pleasant') expect(spec.prompt).toContain('face, subtly unlike a typical pretty face: ')
        }
        if (['high_round', 'broad'].includes(spec.attributes.forehead) || spec.attributes.faceShape === 'high_forehead') {
          expect(spec.attributes.fringe).not.toBe('none')
          expect(spec.prompt).toContain('the head in natural proportion to the face')
        }
        if (spec.attributes.attractiveness !== 'striking') expect(spec.prompt).not.toMatch(/beautiful|good-looking/i)
      }
    }
  })

  it('varies expression, head angle and hands, and keeps two-hand poses out of selfies', () => {
    const expressions = new Set<string>()
    for (let index = 0; index < 400; index += 1) {
      const spec = pickAvatarSpec(korean, seededRandom(`pose:${index}`))
      if (spec.category !== 'face' && spec.category !== 'partial') continue
      expressions.add(spec.attributes.expression)
      if (!['profile', 'high_angle', 'low_angle', 'head_down', 'look_back', 'lying_down'].includes(spec.subtype)) expect(spec.attributes.headPose).toBeTruthy()
      if (spec.attributes.shooter === 'selfie') expect(['arms_crossed', 'pocket', 'cheeks_cupped', 'frame_face', 'hood_strings']).not.toContain(spec.attributes.handPose)
      if (spec.attributes.bodyPose) expect(['waist', 'full']).toContain(spec.attributes.distance)
    }
    expect(expressions.size).toBeGreaterThan(25)
  })

  it('draws Japanese women with Japanese makeup, hair and dress', () => {
    const japanese: AvatarPersona = { gender: 'female', name: 'ゆき', age: 24, country: 'JP', countryName: 'Japan', city: 'Tokyo', bio: null }
    let faces = 0
    for (let index = 0; index < 300; index += 1) {
      const spec = pickAvatarSpec(japanese, seededRandom(`jp:${index}`))
      if (spec.category !== 'face') continue
      faces += 1
      expect(spec.prompt).toContain('unmistakably Japanese features')
      if (!['none', 'minimal'].includes(spec.attributes.makeup)) expect(spec.prompt).toContain('Japanese-style makeup')
    }
    expect(faces).toBeGreaterThan(20)
    const us = pickAvatarSpec(american, seededRandom('us-face'))
    expect(us.prompt).not.toContain('unmistakably')
  })

  it('keeps selfies coherent: no full-body framing, eyes on the screen, no flash, filter or finger', () => {
    for (let index = 0; index < 1500; index += 1) {
      const spec = pickAvatarSpec(korean, seededRandom(`selfie:${index}`))
      expect(spec.prompt).not.toMatch(/flash|beauty filter|fingertip|photo-booth/i)
      if (['face', 'partial'].includes(spec.category)) expect(spec.prompt).not.toMatch(/film camera/i)
      if (spec.attributes.shooter !== 'selfie') continue
      expect(spec.attributes.distance).not.toBe('full')
      if (spec.subtype === 'front') expect(spec.prompt).toContain('looking at their own face on the phone screen')
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

describe('ancestry and the persona name', () => {
  it('leans toward the ancestry the family name suggests in a mixed country', () => {
    const count = (name: string) => {
      let eastAsian = 0
      for (let index = 0; index < 200; index += 1) {
        const spec = pickAvatarSpec({ gender: 'female', name, age: 30, country: 'US', countryName: 'United States', city: 'Houston', bio: null }, seededRandom(`${name}:${index}`))
        if (/East Asian American/.test(spec.prompt)) eastAsian += 1
      }
      return eastAsian
    }
    expect(count('Jessica Lee')).toBeGreaterThan(count('Jessica Miller') * 3)
  })
})

describe('avatar generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OPERATOR_AVATAR_IMAGE_MODEL', 'chatgpt-app/image')
    mocks.userFindFirst.mockResolvedValue({
      name: '민아', bio: null, birthDate: new Date('2000-01-01'), locationCity: 'Seoul', locationCountry: 'South Korea',
      operatorAccount: { personaCountry: 'KR', personaGender: 'female' },
    })
    mocks.setAvatar.mockResolvedValue({ ok: true, image: 'https://img.example/a.jpg', objectKey: 'profiles/op_1/a.jpg' })
    mocks.accountUpdateMany.mockResolvedValue({ count: 1 })
  })

  it('draws nothing by default: photos wait to be drawn by hand', () => {
    expect(resolveAvatarImageModel({} as NodeJS.ProcessEnv)).toBe('none')
    expect(resolveAvatarImageModel({ OPERATOR_AVATAR_IMAGE_MODEL: 'x' } as unknown as NodeJS.ProcessEnv)).toBe('x')
  })

  it('draws through the ChatGPT pool when CHATGPT_POOL_KEY is set', () => {
    expect(resolveAvatarImageModel({ CHATGPT_POOL_KEY: 'k' } as unknown as NodeJS.ProcessEnv)).toBe('chatgpt-pool')
    expect(resolveAvatarImageModel({ CHATGPT_POOL_KEY: 'k', OPERATOR_AVATAR_IMAGE_MODEL: 'none' } as unknown as NodeJS.ProcessEnv)).toBe('none')
  })

  it('sends chatgpt-pool images to the pool and maps its errors', async () => {
    vi.stubEnv('CHATGPT_POOL_KEY', 'pool-key')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'image_limit' } }), { status: 429 }))
    const result = await requestAvatarImage('p', { model: 'chatgpt-pool', fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(result).toEqual({ ok: false, error: 'image_request_failed', detail: 'http_429_image_limit' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://chatgpt-pool.minglelabs.app/v1/images/generations')
    expect(JSON.parse(String(init.body))).toEqual({ prompt: 'p', async: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('never calls a paid image API', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'openai-key')
    vi.stubEnv('GEMINI_API_KEY', 'gemini-key')
    const fetchImpl = vi.fn()
    for (const model of ['none', 'gpt-image-2', 'gemini-2.5-flash-image', 'dall-e-3']) {
      expect(await requestAvatarImage('p', { model, fetchImpl: fetchImpl as unknown as typeof fetch }))
        .toEqual({ ok: false, error: 'image_unavailable', detail: 'image_api_disabled' })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('draws the picked spec, stores it as the avatar and saves the spec', async () => {
    const fetchImpl = imageResponse()
    const result = await generateOperatorAvatar(null, 'op_1', { nonce: 'n1', now: NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(result.ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:10310/v1/chat/completions')
    const body = JSON.parse(String(init.body))
    expect(body.messages[0].content).toContain('profile picture')
    expect(mocks.setAvatar).toHaveBeenCalledWith(null, 'op_1', Buffer.from('png-bytes'), expect.objectContaining({ generated: true }))
    expect(mocks.accountUpdateMany.mock.calls[0][0].data.avatarSpec.labelKo).toContain(' · ')
  })

  describe('through the local subscription proxy', () => {
    const PROXY_MODEL = 'google-antigravity/gemini-3.1-flash-image'
    const chatReply = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })

    it('treats a provider-prefixed model as a proxy model and reads the proxy address', () => {
      expect(isProxyImageModel(PROXY_MODEL)).toBe(true)
      expect(isProxyImageModel('gpt-image-2')).toBe(false)
      expect(resolveImageProxyUrl({} as NodeJS.ProcessEnv)).toBe('http://127.0.0.1:10100')
      expect(resolveImageProxyUrl({ OPERATOR_IMAGE_PROXY_URL: 'http://localhost:9000/' } as unknown as NodeJS.ProcessEnv)).toBe('http://localhost:9000')
    })

    it('asks the proxy for the image and downloads the stored picture from the proxy', async () => {
      const fetchImpl = vi.fn(async (url: string) => (url.endsWith('/v1/chat/completions')
        ? chatReply('Here it is.\n![image](/v1/opencodex/artifacts/img-1.jpg)')
        : new Response(Buffer.from('jpg-bytes'), { status: 200 })))
      const result = await requestAvatarImage('a prompt', { model: PROXY_MODEL, fetchImpl: fetchImpl as unknown as typeof fetch })
      expect(result).toEqual({ ok: true, bytes: Buffer.from('jpg-bytes'), model: PROXY_MODEL })
      expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
        'http://127.0.0.1:10100/v1/chat/completions',
        'http://127.0.0.1:10100/v1/opencodex/artifacts/img-1.jpg',
      ])
      const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))
      expect(body.model).toBe(PROXY_MODEL)
      expect(body.messages[0].content).toContain('a prompt')
    })

    it('accepts an inlined data URL', async () => {
      const data = Buffer.from('png-bytes').toString('base64')
      const fetchImpl = vi.fn(async () => chatReply([{ type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } }]))
      const result = await requestAvatarImage('p', { model: PROXY_MODEL, fetchImpl: fetchImpl as unknown as typeof fetch })
      expect(result).toEqual({ ok: true, bytes: Buffer.from('png-bytes'), model: PROXY_MODEL })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('never fetches a link that points away from the proxy', async () => {
      const fetchImpl = vi.fn(async () => chatReply('![image](https://elsewhere.example/a.jpg)'))
      const result = await requestAvatarImage('p', { model: PROXY_MODEL, fetchImpl: fetchImpl as unknown as typeof fetch })
      expect(result).toEqual({ ok: false, error: 'image_refused', detail: 'no_image' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('reports a proxy error such as an exhausted quota without paying for the API model', async () => {
      const fetchImpl = vi.fn(async () => new Response('', { status: 429 }))
      const result = await requestAvatarImage('p', { model: PROXY_MODEL, fetchImpl: fetchImpl as unknown as typeof fetch })
      expect(result).toEqual({ ok: false, error: 'image_request_failed', detail: 'http_429' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('reports an unreachable proxy without falling back to any API', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'openai-key')
      const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
      const result = await requestAvatarImage('p', { model: PROXY_MODEL, fetchImpl: fetchImpl as unknown as typeof fetch })
      expect(result).toEqual({ ok: false, error: 'image_unavailable', detail: 'proxy_unreachable' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('sends chatgpt-app models to the ChatGPT app bridge with its own key', async () => {
      vi.stubEnv('OPERATOR_CHATGPT_IMAGE_KEY', 'bridge-key')
      const data = Buffer.from('png-bytes').toString('base64')
      const fetchImpl = vi.fn(async () => chatReply(`![image](data:image/png;base64,${data})`))
      const result = await requestAvatarImage('p', { model: 'chatgpt-app/image', fetchImpl: fetchImpl as unknown as typeof fetch })
      expect(result).toEqual({ ok: true, bytes: Buffer.from('png-bytes'), model: 'chatgpt-app/image' })
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('http://127.0.0.1:10310/v1/chat/completions')
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer bridge-key')
      expect(resolveImageProxyUrl({ OPERATOR_CHATGPT_IMAGE_URL: 'https://bridge.example/' } as unknown as NodeJS.ProcessEnv, 'chatgpt-app/image')).toBe('https://bridge.example')
    })

    it('keeps the reason the bridge gives for a failure', async () => {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'image_limit' } }), { status: 429 }))
      const result = await requestAvatarImage('p', { model: 'chatgpt-app/image', fetchImpl: fetchImpl as unknown as typeof fetch })
      expect(result).toEqual({ ok: false, error: 'image_request_failed', detail: 'http_429_image_limit' })
    })
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
    expect(normalizeAutomationSettings(null)).toEqual({ avatars: { enabled: false, intervalMinutes: 10 }, accounts: { enabled: false, perDay: 5, totalTarget: 100 }, posts: { enabled: false, chancePercent: 20 } })
    expect(parseAutomationSettings({ avatars: { enabled: true, intervalMinutes: 0 }, accounts: { enabled: false, perDay: 5, totalTarget: 100 }, posts: { enabled: false, chancePercent: 20 } })).toEqual({ ok: false, error: 'invalid_interval' })
    expect(parseAutomationSettings({ avatars: { enabled: true, intervalMinutes: 10 }, accounts: { enabled: true, perDay: 3, totalTarget: 150 }, posts: { enabled: true, chancePercent: 20 } }).ok).toBe(true)
  })

  it('does nothing while both rules are off', async () => {
    mocks.settingFindUnique.mockResolvedValue(null)
    expect(await runOperatorAutomation({ now: () => NOW })).toEqual({ avatar: 'off', account: 'off', posts: 'off' })
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
    expect(await runOperatorAutomation({ now: () => NOW })).toEqual({ avatar: 'waiting', account: 'waiting', posts: 'off' })

    state(new Date(NOW.getTime() - 11 * 60_000).toISOString(), new Date(NOW.getTime() - 7 * 60 * 60_000).toISOString())
    mocks.accountGroupBy.mockResolvedValue([{ personaCountry: 'KR', _count: { _all: 1 } }])
    mocks.drafts.mockResolvedValue({ drafts: [{ name: 'Yui', handle: 'yui' }], missing: 0 })
    mocks.createAccount.mockResolvedValue({ userId: 'op_new', handle: 'yui', requestedHandle: 'yui', bioQueued: false })
    mocks.userFindFirst.mockResolvedValue(null) // no account without a photo
    expect(await runOperatorAutomation({ now: () => NOW })).toEqual({ avatar: 'none', account: 'created', posts: 'off' })
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
    expect(await runOperatorAutomation({ now: () => NOW })).toEqual({ avatar: 'off', account: 'target_reached', posts: 'off' })
    expect(mocks.drafts).not.toHaveBeenCalled()
  })
})

describe('describeFace', () => {
  const kinds = (grade: FaceGrade, seed: string) => {
    const attributes: Record<string, string> = {}
    const random = seededRandom(seed)
    const take = (axis: string, options: ReadonlyArray<readonly [string, number, string]>) => {
      const total = options.reduce((sum, option) => sum + option[1], 0)
      let roll = random() * total
      const option = options.find((candidate) => (roll -= candidate[1]) < 0) ?? options[options.length - 1]
      attributes[axis] = option[0]
      return option[2]
    }
    return { prompt: describeFace(take, random, grade), attributes }
  }

  it('names exactly one mild distinctive trait on a striking face and nothing plain', () => {
    for (let index = 0; index < 200; index += 1) {
      const { prompt } = kinds('striking', `striking:${index}`)
      const traits = prompt.split('unlike a typical pretty face: ')[1]?.split('; ').filter((trait) => !trait.startsWith('the head in')) ?? []
      expect(traits.length).toBe(1)
      expect(prompt).not.toMatch(/puffy|bulbous|heavy chin|a long face|broad, round face|dark under-eye|sparse/)
      expect(prompt).not.toMatch(/slightly long midface|wide mouth for the face|short face whose|bone structure shows/)
    }
  })

  it('lets ordinary faces carry plain traits', () => {
    const plain = Array.from({ length: 100 }, (_, index) => kinds('ordinary', `ordinary:${index}`).prompt).filter((prompt) => /puffy|bulbous|heavy chin|a long face|broad, round face|round cheeks|flat|thin lips|small, narrow eyes|low, narrow forehead|long midface|long philtrum|large nose|sparse|dark under-eye|wide, square jaw/.test(prompt))
    expect(plain.length).toBeGreaterThan(80)
  })
})
