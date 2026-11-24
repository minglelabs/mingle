import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { PROFILE_HEIGHT_COPY_LOCALES, resolveProfileHeightCopy } from '@/i18n/profile-height-copy'
import { resolveMissingProfileBasics } from './profile-basics'
import { normalizeHeightCm } from './profile-height'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('profile height', () => {
  it('takes whole centimetres between 120 and 230', () => {
    expect(normalizeHeightCm(178)).toBe(178)
    expect(normalizeHeightCm('165')).toBe(165)
    expect(normalizeHeightCm(119)).toBeNull()
    expect(normalizeHeightCm(231)).toBeNull()
    expect(normalizeHeightCm('')).toBeNull()
    expect(normalizeHeightCm('abc')).toBeNull()
  })

  it('is asked of men only, with the other profile basics', () => {
    const base = { birthDate: '2000-01-01' }
    expect(resolveMissingProfileBasics({ ...base, gender: 'male' })).toEqual(['height'])
    expect(resolveMissingProfileBasics({ ...base, gender: 'male', heightCm: 178 })).toEqual([])
    expect(resolveMissingProfileBasics({ ...base, gender: 'female' })).toEqual([])
    // No gender yet: the step is listed; the screens show it only once "male" is picked.
    expect(resolveMissingProfileBasics({ ...base })).toEqual(['gender', 'height'])
  })

  it('has the copy in every app language', () => {
    expect([...PROFILE_HEIGHT_COPY_LOCALES].sort()).toEqual([...PRIMARY_UI_LOCALES].sort())
    for (const locale of PRIMARY_UI_LOCALES) {
      for (const [key, value] of Object.entries(resolveProfileHeightCopy(locale))) expect(value.trim(), `${locale}.${key}`).not.toBe('')
    }
  })

  it('is wired: the step only for men, saved by the gate, shown on profiles', () => {
    const modal = read('../components/LivePhoneDemo/LanguageOnboardingModal.tsx')
    // Height and the self-introduction (2026-11-25): men only.
    expect(modal).toContain('(entry !== "height" && entry !== "bio") || gender === "male" || !baseSteps.includes("gender")')
    expect(read('../components/profile-basics-gate.tsx')).toContain('body.heightCm = payload.heightCm')
    expect(read('../app/api/profile/route.ts')).toContain('error: "invalid_height"')
    expect(read('../components/profile-gender-age-badge.tsx')).toContain('data-qa="profile-height"')
  })

  it('is picked on a wheel that starts at 177 cm, never typed on a keyboard', () => {
    const modal = read('../components/LivePhoneDemo/LanguageOnboardingModal.tsx')
    expect(modal).toContain('useState<number>(DEFAULT_HEIGHT_CM)')
    expect(modal).toContain('<ProfileHeightWheel value={heightCm} onChange={setHeightCm} />')
    expect(modal).not.toContain('inputMode="numeric"')
    const edit = read('../components/my-page.tsx')
    expect(edit).toContain('optional={gender !== "male"}')
    expect(edit).not.toContain('setHeightText')
  })

  it('explore cards follow and message without opening the profile', () => {
    const home = read('../components/explore/explore-people-page.tsx')
    expect(home).toContain('data-qa="home-card-follow"')
    expect(home).toContain('data-qa="home-card-message"')
    expect(home).toContain('pageCache.set(cacheKey, next)')
    expect(read('../app/api/users/discover/route.ts')).toContain('isFollowing: user.followerRelations.length > 0')
    // The card's Message goes through the same first-message setup as the profile's.
    expect(read('./use-start-direct-conversation.ts')).toContain('requestFirstMessageSetup(needs)')
  })

  // Owner, 2026-11-25: sign-up needs a face-verified photo (no "later"), and men a 20+ character self-introduction.
  it('asks a face-verified photo of everyone and a self-introduction of men before sign-up', async () => {
    const { BIO_MIN_LENGTH, bioLength } = await import('@/lib/pending-profile-extras')
    expect(BIO_MIN_LENGTH).toBe(20)
    expect(bioLength('  안녕하세요 😀  ')).toBe(7)
    const modal = readFileSync(new URL('../components/LivePhoneDemo/LanguageOnboardingModal.tsx', import.meta.url), 'utf8')
    expect(modal).toContain('target === "profile-photo" ? Boolean(photoDataUrl) && faceVerified')
    expect(modal).toContain('target === "bio" ? bioLength(bio) >= BIO_MIN_LENGTH')
    expect(modal).not.toContain('onboarding-photo-skip')
    const sync = readFileSync(new URL('../components/pending-profile-sync.tsx', import.meta.url), 'utf8')
    expect(sync).toContain('patch.bio = bio.slice(0, 160)')
  })
})
