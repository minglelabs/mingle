import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ userFindFirst: vi.fn(), drafts: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: m.userFindFirst } } }))
vi.mock('./persona-draft', () => ({ generatePersonaDrafts: m.drafts }))

import { draftOperatorProfile, parseProfileAiScope } from './profile-ai'

const NOW = new Date('2026-11-03T00:00:00Z')
const DRAFT = { name: '새 이름', handle: 'new.handle', city: 'Busan', birthYear: 1999, bio: '새 소개', primaryLanguage: 'ja' }

beforeEach(() => {
  vi.clearAllMocks()
  m.userFindFirst.mockResolvedValue({
    name: 'Yuki', handle: 'yuki.old', birthDate: new Date('2000-05-01T00:00:00Z'), locationCity: 'Osaka', primaryLanguages: ['ja'],
    operatorAccount: { personaCountry: 'JP', personaGender: 'female' },
  })
  m.drafts.mockResolvedValue({ drafts: [DRAFT], missing: 0 })
})

describe('profile AI drafts', () => {
  it('accepts only the three scopes', () => {
    expect(['bio', 'profile', 'all', 'photo', null].map(parseProfileAiScope)).toEqual(['bio', 'profile', 'all', null, null])
  })

  it('writes only a bio for the same city, age, country and gender', async () => {
    expect(await draftOperatorProfile('u1', 'bio', { now: NOW })).toEqual({ ok: true, draft: { bio: '새 소개' } })
    expect(m.drafts.mock.calls[0][0]).toMatchObject({ countries: ['JP'], genderMix: 'female', pin: { city: 'Osaka', birthYear: 2000 }, avoidHandles: ['yuki.old'] })
  })

  it('remakes everything but the bio, keeping country and gender, near the same age', async () => {
    const result = await draftOperatorProfile('u1', 'profile', { now: NOW, random: () => 0 })
    expect(result).toEqual({ ok: true, draft: { name: '새 이름', handle: 'new.handle', city: 'Busan', birthYear: 1999, interestLanguages: [{ code: 'ko', level: 1 }] } })
    expect(m.drafts.mock.calls[0][0]).toMatchObject({ ageMin: 23, ageMax: 29, genderMix: 'female' })
    expect(m.drafts.mock.calls[0][0].pin).toBeUndefined()
  })

  it('remakes all of it with the bio, and refuses a staff account without a persona', async () => {
    const all = await draftOperatorProfile('u1', 'all', { now: NOW, random: () => 0 })
    expect(all.ok && all.draft.bio).toBe('새 소개')
    m.userFindFirst.mockResolvedValueOnce({ name: 'Admin', handle: 'admin', birthDate: null, locationCity: null, primaryLanguages: ['ko'], operatorAccount: { personaCountry: null, personaGender: null } })
    expect(await draftOperatorProfile('admin', 'bio')).toEqual({ ok: false, error: 'no_persona' })
  })
})
