import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { resolveSignupCopy } from '@/i18n/signup-copy'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// Production, 2026-11-21: 55 of 214 accounts with a birth date (26%) had kept the preselected
// 2000-01-01, and birth dates are locked once saved. Nothing counts as picked until the person
// picks the year, the month and the day themself.
describe('birth date must be picked, not accepted', () => {
  it('marks a column picked only on the person\'s own scroll or tap', () => {
    const picker = read('../components/signup-birth-date-picker.tsx')
    expect(picker).toContain('onPointerDown={() => { userScrollingRef.current = true; }}')
    expect(picker).toContain('if (userScrollingRef.current) {')
    expect(picker).toContain('onPickedChange?.(next.year && next.month && next.day);')
    // An unpicked column shows its value grey, as a suggestion.
    expect(picker).toContain('picked ? "scale-[1.04] font-bold text-slate-950" : "font-semibold text-slate-400"')
  })

  it('keeps Continue off in onboarding, and profile edit saves no date, until all three are picked', () => {
    const modal = read('../components/LivePhoneDemo/LanguageOnboardingModal.tsx')
    expect(modal).toContain(': birthDatePicked && isEligibleAge')
    expect(modal).toContain('onPickedChange={setBirthDatePicked}')
    expect(read('../components/my-page.tsx')).toContain('onPickedChange={setHasBirthDate}')
  })

  it('asks for it in every app language', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      expect(resolveSignupCopy(locale).birthDatePickHint.trim(), locale).not.toBe('')
    }
  })
})
