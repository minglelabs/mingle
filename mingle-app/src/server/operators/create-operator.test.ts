import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userCreate: vi.fn(),
  writeAdminAudit: vi.fn(),
  updateProfileWithBio: vi.fn(),
  runBioVersion: vi.fn(),
  requireOperatorAccount: vi.fn(),
  ensureSignupWelcomeOnboarding: vi.fn(),
  txUserUpdate: vi.fn(),
  txOperatorAccountUpsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: { create: mocks.userCreate } } }))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mocks.writeAdminAudit }))
vi.mock('@/server/profile-bio', () => ({ updateProfileWithBio: mocks.updateProfileWithBio, runBioVersion: mocks.runBioVersion }))
vi.mock('@/lib/signup-welcome-onboarding', () => ({ ensureSignupWelcomeOnboarding: mocks.ensureSignupWelcomeOnboarding }))
vi.mock('@/server/operators/operator-guard', async importOriginal => ({
  ...(await importOriginal<typeof import('@/server/operators/operator-guard')>()),
  requireOperatorAccount: mocks.requireOperatorAccount,
}))

import type { AdminContext } from '@/server/admin/guard'
import { whenOperatorBioQueueIdle } from './bio-queue'
import {
  birthDateFromYear,
  createOperatorAccount,
  OperatorDraftInvalidError,
  OperatorHandleTakenError,
  updateOperatorAccount,
} from './create-operator'
import { OperatorAccountRequiredError } from './operator-guard'
import { OperatorHandleUnavailableError } from './operator-handles'
import { parseOperatorPatch, type PersonaDraft } from './persona-rules'

const NOW = new Date('2026-09-30T03:00:00Z')
const CTX: AdminContext = { sessionId: 'sess-1', ip: '203.0.113.9', userAgent: 'test' }
const DRAFT: PersonaDraft = {
  name: '田中 ゆき',
  handle: 'yuki.tnk',
  personaCountry: 'JP',
  city: 'Osaka',
  countryName: 'Japan',
  latitude: 34.69,
  longitude: 135.5,
  birthYear: 1998,
  bio: '大阪でカフェ巡りが好き',
  primaryLanguage: 'ja',
  gender: 'female',
}

function handleConflict() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['handle'] } })
}

describe('createOperatorAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userCreate.mockImplementation(async ({ data }: { data: { handle: string } }) => ({ id: 'op_1', handle: data.handle }))
    mocks.updateProfileWithBio.mockImplementation(async (_userId: string, _bio: string, update: (tx: unknown) => Promise<unknown>) => {
      await update({ user: { update: mocks.txUserUpdate } })
      return { profile: null, versionId: 'bio-v1' }
    })
    mocks.runBioVersion.mockResolvedValue(undefined)
  })

  it('creates a login-less operator (never official) with signup-style languages, table location and an OperatorAccount row', async () => {
    const created = await createOperatorAccount(CTX, DRAFT, { notes: ' travel persona ', now: NOW, random: () => 0.5 })
    expect(created).toEqual({ userId: 'op_1', handle: 'yuki.tnk', requestedHandle: 'yuki.tnk', bioQueued: true })

    const { data } = mocks.userCreate.mock.calls[0][0]
    expect(data).toMatchObject({
      handle: 'yuki.tnk',
      name: '田中 ゆき',
      isOperator: true,
      isOfficial: false,
      nationality: 'ja',
      primaryLanguages: ['ja'],
      defaultConversationLanguages: ['ja', 'en', 'ko'],
      defaultDisplayLanguage: 'ja',
      locationLatitude: 34.69,
      locationLongitude: 135.5,
      locationCity: 'Osaka',
      locationCountry: 'Japan',
      locationCountryCode: 'jp',
      locationUpdatedAt: NOW,
      operatorAccount: { create: { personaCountry: 'JP', notes: 'travel persona', createdBySessionId: 'sess-1' } },
    })
    for (const key of ['email', 'passwordHash', 'externalUserId', 'bio', 'pushTokens', 'accounts']) expect(data).not.toHaveProperty(key)
    expect((data.birthDate as Date).getUTCFullYear()).toBe(1998)

    expect(mocks.writeAdminAudit).toHaveBeenCalledWith(CTX, expect.objectContaining({
      action: 'operator.create',
      operatorUserId: 'op_1',
      targetType: 'user',
      targetId: 'op_1',
      metadata: expect.objectContaining({ handle: 'yuki.tnk', personaCountry: 'JP', hasBio: true }),
    }))
    expect(mocks.ensureSignupWelcomeOnboarding).not.toHaveBeenCalled()

    // The bio is written through bio-versioning in the background, then translated.
    await whenOperatorBioQueueIdle()
    expect(mocks.updateProfileWithBio).toHaveBeenCalledWith('op_1', DRAFT.bio, expect.any(Function))
    expect(mocks.txUserUpdate).toHaveBeenCalledWith({ where: { id: 'op_1' }, data: { bio: DRAFT.bio }, select: { id: true } })
    expect(mocks.runBioVersion).toHaveBeenCalledWith('bio-v1')
  })

  it('never imports signup, analytics or PostHog side effects', () => {
    const source = readFileSync(new URL('./create-operator.ts', import.meta.url), 'utf8')
    for (const moduleName of ['signup-welcome-onboarding', 'app-analytics', 'posthog', 'push-notifications']) {
      expect(source).not.toMatch(new RegExp(`from ['"][^'"]*${moduleName}`))
    }
  })

  it('retries a taken handle with a numeric suffix', async () => {
    mocks.userCreate.mockRejectedValueOnce(handleConflict())
    const created = await createOperatorAccount(CTX, { ...DRAFT, bio: '' }, { now: NOW, random: () => 0.5 })
    expect(mocks.userCreate).toHaveBeenCalledTimes(2)
    expect(mocks.userCreate.mock.calls[1][0].data.handle).toBe('yuki.tnk55')
    expect(created).toMatchObject({ handle: 'yuki.tnk55', requestedHandle: 'yuki.tnk', bioQueued: false })
    expect(mocks.updateProfileWithBio).not.toHaveBeenCalled()
  })

  it('gives up after the suffixed candidates and rethrows other errors without auditing', async () => {
    mocks.userCreate.mockRejectedValue(handleConflict())
    await expect(createOperatorAccount(CTX, DRAFT, { now: NOW })).rejects.toBeInstanceOf(OperatorHandleUnavailableError)

    mocks.userCreate.mockReset()
    mocks.userCreate.mockRejectedValue(new Error('db down'))
    await expect(createOperatorAccount(CTX, DRAFT, { now: NOW })).rejects.toThrow('db down')
    expect(mocks.userCreate).toHaveBeenCalledTimes(1)
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled()
  })

  it('refuses an invalid draft before touching the database', async () => {
    await expect(createOperatorAccount(CTX, { ...DRAFT, handle: 'admin', birthYear: 2010 }, { now: NOW }))
      .rejects.toBeInstanceOf(OperatorDraftInvalidError)
    expect(mocks.userCreate).not.toHaveBeenCalled()
  })
})

describe('birthDateFromYear', () => {
  it('keeps a persona who turns 20 this year an adult today', () => {
    for (const roll of [0, 0.5, 0.999999]) {
      const date = birthDateFromYear(2006, NOW, () => roll)
      expect(date.getUTCFullYear()).toBe(2006)
      expect(date.getTime()).toBeLessThanOrEqual(Date.UTC(2006, 8, 30))
    }
    expect(birthDateFromYear(1990, NOW, () => 0.999999).toISOString().slice(0, 10)).toBe('1990-12-31')
  })
})

describe('updateOperatorAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOperatorAccount.mockResolvedValue({ id: 'op_1', handle: 'old.handle' })
    mocks.updateProfileWithBio.mockImplementation(async (_userId: string, _bio: unknown, update: (tx: unknown) => Promise<unknown>) => {
      await update({ user: { update: mocks.txUserUpdate }, operatorAccount: { upsert: mocks.txOperatorAccountUpsert } })
      return { profile: undefined, versionId: 'bio-v2' }
    })
    mocks.runBioVersion.mockResolvedValue(undefined)
  })

  it('refuses anyone who is not an operator account', async () => {
    mocks.requireOperatorAccount.mockRejectedValue(new OperatorAccountRequiredError('user_1'))
    const parsed = parseOperatorPatch({ name: 'Mina' })
    if (!parsed.ok) throw new Error('patch')
    await expect(updateOperatorAccount(CTX, 'user_1', parsed.patch)).rejects.toBeInstanceOf(OperatorAccountRequiredError)
    expect(mocks.updateProfileWithBio).not.toHaveBeenCalled()
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled()
  })

  it('writes the changed fields, re-derives languages, translates the new bio and audits the edit', async () => {
    const parsed = parseOperatorPatch({
      name: 'Mina',
      handle: 'mina.k',
      bio: '부산 바다 좋아해요',
      primaryLanguage: 'ko',
      personaCountry: 'KR',
      city: 'Busan',
      notes: 'beach',
    }, { now: NOW })
    if (!parsed.ok) throw new Error('patch')
    const result = await updateOperatorAccount(CTX, 'op_1', parsed.patch, { now: NOW })
    expect(result.changed).toEqual(['name', 'handle', 'primaryLanguage', 'location', 'bio', 'notes'])

    expect(mocks.requireOperatorAccount).toHaveBeenCalledWith('op_1')
    expect(mocks.updateProfileWithBio).toHaveBeenCalledWith('op_1', '부산 바다 좋아해요', expect.any(Function))
    expect(mocks.txUserUpdate.mock.calls[0][0].data).toMatchObject({
      name: 'Mina',
      handle: 'mina.k',
      bio: '부산 바다 좋아해요',
      nationality: 'ko',
      primaryLanguages: ['ko'],
      defaultDisplayLanguage: 'ko',
      locationCity: 'Busan',
      locationCountry: 'South Korea',
      locationCountryCode: 'kr',
      locationLatitude: 35.18,
    })
    expect(mocks.txOperatorAccountUpsert).toHaveBeenCalledWith({
      where: { userId: 'op_1' },
      create: { userId: 'op_1', personaCountry: 'KR', notes: 'beach' },
      update: { personaCountry: 'KR', notes: 'beach' },
    })
    await whenOperatorBioQueueIdle()
    expect(mocks.runBioVersion).toHaveBeenCalledWith('bio-v2')
    expect(mocks.writeAdminAudit).toHaveBeenCalledWith(CTX, expect.objectContaining({
      action: 'operator.update',
      operatorUserId: 'op_1',
      metadata: expect.objectContaining({ handle: 'mina.k', previousHandle: 'old.handle' }),
    }))
  })

  it('maps a handle conflict to OperatorHandleTakenError', async () => {
    mocks.updateProfileWithBio.mockRejectedValue(handleConflict())
    const parsed = parseOperatorPatch({ handle: 'taken.one' })
    if (!parsed.ok) throw new Error('patch')
    await expect(updateOperatorAccount(CTX, 'op_1', parsed.patch)).rejects.toBeInstanceOf(OperatorHandleTakenError)
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled()
  })
})
