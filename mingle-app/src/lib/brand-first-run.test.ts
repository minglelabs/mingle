import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveFirstRunCopy } from '@/i18n/first-run-copy'
import { BRAND_TAGLINE, resolveBrandTagline } from '@/i18n/loading-messages'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { resolveSpeakTrialCopy } from '@/i18n/speak-trial-copy'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// Brand and onboarding review on an iPhone 14, 2026-11-20: the store and the
// Home tab said "make friends", but everything a new user saw before that
// (splash, language, speak trial, sign-in) still spoke as a translator.
describe('first run speaks as the friends app', () => {
  it('has the brand line in every app language, Korean for Koreans and Korean friends for everyone else', () => {
    expect(Object.keys(BRAND_TAGLINE).sort()).toEqual([...PRIMARY_UI_LOCALES].sort())
    for (const locale of PRIMARY_UI_LOCALES) expect(resolveBrandTagline(locale).trim(), locale).not.toBe('')
    expect(resolveBrandTagline('ko')).toBe('외국인 친구, 말이 안 통해도 사귈 수 있어요')
    expect(resolveBrandTagline('en')).toBe('Make Korean friends, even before your Korean is good')
    expect(resolveBrandTagline('xx')).toBe(BRAND_TAGLINE.en)
  })

  it('shows the icon and the brand line on the sign-in screen', () => {
    const login = read('../components/mingle-home.tsx')
    expect(login).toContain('data-qa="login-brand-icon"')
    expect(login).toContain('{resolveBrandTagline(props.locale)}')
  })

  it('shows the brand line on the startup splash when there is no screen to restore', () => {
    const shell = read('../../rn/App.tsx')
    expect(shell).toContain('const [startupSplashIsFirstLook] = useState(() => !initialRestoreUrlRef.current);')
    expect(shell).toContain('startupSplashIsFirstLook ? { text: resolveBrandTagline(webLocale), source: null } : pickLoadingMessage(webLocale)')
  })

  it('asks for first words to a friend, not for a try of the interpreter', () => {
    expect(resolveFirstRunCopy('ko').speakTitle).toBe('외국인 친구에게 건넬 첫 마디, 먼저 말해 볼까요?')
    expect(resolveSpeakTrialCopy('ko').hint).toBe('Start를 누르고, 10초 동안 아래 문장을 말해 보세요')
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolveFirstRunCopy(locale).speakTitle.trim(), locale).not.toBe('')
      expect(resolveSpeakTrialCopy(locale).hint, locale).toContain('10')
    }
  })

  it('keeps one look: brand-coloured buttons, the same wordmark on Home and Chats, no ad on a new account\'s first screen', () => {
    const phone = read('../components/contacts/phone-verify-sheet.tsx')
    expect(phone).not.toContain('bg-blue-600')
    expect(phone).toContain('bg-[#FBBC32]')
    const contactSync = read('../components/contacts/contact-sync-screen.tsx')
    expect(contactSync).not.toContain('blue-')
    expect(contactSync).toContain('bg-[#FBBC32]')
    expect(read('../components/mingle-home.tsx')).toContain('rounded-xl bg-[#FBBC32] px-3 text-[0.96rem] font-bold leading-none text-slate-950')
    expect(read('../components/explore/explore-people-page.tsx')).toContain('<MingleWordmark />')
    expect(read('../components/conversation-list.tsx')).toContain('useNativeBannerSuppression(showFirstSpeakCard);')
  })
})
