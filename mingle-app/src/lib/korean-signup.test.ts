import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { resolveContactSyncCopy } from '@/i18n/contact-sync-copy'
import { resolvePhoneSignInCopy } from '@/i18n/phone-sign-in-copy'
import { isContactSyncRequiredLocale, isKoreanAppLocale, isPhoneFirstSignInLocale } from '@/lib/korean-signup'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// Owner, 2026-11-21: Koreans start with their phone number, then must pass the
// contact sync (inviting friends is the point of it).
describe('Korean sign-up: phone first, then the contact sync', () => {
  it('counts the Korean app language only', () => {
    expect(isKoreanAppLocale('ko')).toBe(true)
    expect(isKoreanAppLocale('ko-KR')).toBe(true)
    expect(isKoreanAppLocale('en')).toBe(false)
    expect(isKoreanAppLocale(null)).toBe(false)
    expect(isPhoneFirstSignInLocale('ko')).toBe(true)
    expect(isContactSyncRequiredLocale('ja')).toBe(false)
  })

  it('has the new labels in every app language', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolvePhoneSignInCopy(locale).otherWays.trim(), locale).not.toBe('')
      expect(resolveContactSyncCopy(locale).next.trim(), locale).not.toBe('')
    }
    expect(resolvePhoneSignInCopy('ko').otherWays).toBe('다른 방법으로 로그인')
  })

  it('leads the sign-in screen with the phone number and folds the rest', () => {
    const login = read('../components/mingle-home.tsx')
    expect(login).toContain('isPhoneFirstSignInLocale(props.locale)')
    expect(login).toContain('{phoneFirstSignIn && !otherSignInOpen ? (')
  })

  it('opens the contact sync right after the number, and keeps it until the permission is answered', () => {
    const host = read('../components/contacts/contact-sync-host.tsx')
    expect(host).toContain('if (!requiredHere && isFirstSpeakPending()) return;')
    expect(host).toContain('if (access?.allowed !== true) return;')
    expect(read('../components/onboarding/phone-gate.tsx')).toContain('requestContactSyncPromptCheck()')
    const screen = read('../components/contacts/contact-sync-screen.tsx')
    expect(screen).toContain('const mustStay = required && !permissionAnswered;')
    expect(screen).toContain('onClose={closeUnlessRequired}')
  })
})
