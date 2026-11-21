import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIRST_RUN_ONBOARDING_STEPS, INVITE_ONBOARDING_STEPS } from '@/components/LivePhoneDemo/LanguageOnboardingModal'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { resolveContactSyncCopy } from '@/i18n/contact-sync-copy'
import { resolveKoreanCheckCopy } from '@/i18n/korean-check-copy'
import { resolvePhoneSignInCopy } from '@/i18n/phone-sign-in-copy'
import { isKoreanAppLocale, resolveIsKorean } from '@/lib/korean-signup'
import { isPhoneRequiredFor } from '@/server/app-access'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// Owner, 2026-11-21: Koreans start with their phone number, then must pass the
// contact sync (inviting friends is the point of it). Who is Korean is asked
// right after the language, since many Koreans pick English.
describe('Korean sign-up: asked, phone first, then the contact sync', () => {
  it('asks "Are you Korean?" right after the language, in every first run', () => {
    expect(FIRST_RUN_ONBOARDING_STEPS).toEqual(['language', 'korean'])
    expect(INVITE_ONBOARDING_STEPS.slice(0, 2)).toEqual(['language', 'korean'])
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveKoreanCheckCopy(locale)
      for (const text of [copy.label, copy.title, copy.yes, copy.no]) expect(text.trim(), locale).not.toBe('')
    }
    expect(resolveKoreanCheckCopy('ko').title).toBe('한국인이신가요?')
  })

  it('goes by the answer, and by the Korean app language only without one', () => {
    expect(resolveIsKorean('yes', 'en')).toBe(true)
    expect(resolveIsKorean('no', 'ko')).toBe(false)
    expect(resolveIsKorean(null, 'ko-KR')).toBe(true)
    expect(resolveIsKorean(null, 'en')).toBe(false)
    expect(isKoreanAppLocale(null)).toBe(false)
  })

  it('asks a Korean for the phone number whatever app language they picked', () => {
    const env = {} as NodeJS.ProcessEnv
    expect(isPhoneRequiredFor({ locale: 'en', korean: true }, env)).toBe(true)
    expect(isPhoneRequiredFor({ locale: 'ko', korean: false }, env)).toBe(false)
    expect(isPhoneRequiredFor({ locale: 'en', nationalityCountry: 'KR' }, env)).toBe(true)
    expect(isPhoneRequiredFor({ locale: 'ko', nationalityCountry: 'US' }, env)).toBe(false)
    expect(isPhoneRequiredFor({ locale: 'ko' }, env)).toBe(true)
    expect(isPhoneRequiredFor({ locale: 'en' }, env)).toBe(false)
    expect(isPhoneRequiredFor({ locale: '', korean: false }, env)).toBe(false)
    expect(isPhoneRequiredFor({ locale: 'en', korean: false }, { PHONE_REQUIRED_LOCALES: '*' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })

  it('has the new labels in every app language', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolvePhoneSignInCopy(locale).otherWays.trim(), locale).not.toBe('')
      expect(resolveContactSyncCopy(locale).next.trim(), locale).not.toBe('')
    }
    expect(resolvePhoneSignInCopy('ko').otherWays).toBe('다른 방법으로 로그인')
  })

  it('leads the sign-in screen with the phone number for Koreans and folds the rest', () => {
    const login = read('../components/mingle-home.tsx')
    expect(login).toContain('&& isKoreanUser(props.locale)')
    expect(login).toContain('{phoneFirstSignIn && !otherSignInOpen ? (')
  })

  it('sends the answer to the gate, saves it as the nationality, and keeps the contact sync until answered', () => {
    expect(read('../components/onboarding/phone-gate.tsx')).toContain('?${appAccessQuery(locale)}`')
    expect(read('../components/onboarding/invite-gate.tsx')).toContain('?${appAccessQuery(locale)}`')
    const host = read('../components/contacts/contact-sync-host.tsx')
    expect(host).toContain('nationalityCountry = "KR";')
    expect(host).toContain('if (!requiredHere && isFirstSpeakPending()) return;')
    expect(host).toContain('if (access?.allowed !== true) return;')
    expect(read('../components/onboarding/phone-gate.tsx')).toContain('requestContactSyncPromptCheck()')
    // A foreigner who tapped "Korean" by mistake leaves the number screen with "I'm not Korean".
    expect(read('../components/onboarding/phone-gate.tsx')).toContain('writeKoreanAnswer("no");')
    const screen = read('../components/contacts/contact-sync-screen.tsx')
    expect(screen).toContain('const mustStay = required && !permissionAnswered;')
    expect(screen).toContain('onClose={closeUnlessRequired}')
  })
})
