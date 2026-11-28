import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// iOS does not resize the page for the on-screen keyboard, so a sheet's bottom
// button (Continue, Save, Send) hid under it. Sheets with a text field end
// above the keyboard instead (owner, 2026-11-20: "no such scene anywhere").
describe('keyboard-safe sheets', () => {
  it('publishes the keyboard height as --keyboard-inset from the app layout', () => {
    expect(read('../app/layout.tsx')).toContain('<KeyboardInsetVar />')
    expect(read('../components/keyboard-inset-var.tsx')).toContain('root.style.setProperty("--keyboard-inset"')
    const css = read('../app/globals.css')
    expect(css).toContain('.keyboard-safe {\n  bottom: var(--keyboard-inset, 0px) !important;')
    // Outside @layer, so it wins over Tailwind's inset-0.
    expect(css.lastIndexOf('.keyboard-safe {')).toBeGreaterThan(css.lastIndexOf('@layer'))
  })

  it.each([
    'components/LivePhoneDemo/LanguageOnboardingModal.tsx',
    'components/LivePhoneDemo/LanguageSelector.tsx',
    'components/interest-language-sheet.tsx',
    'components/my-page.tsx',
    'components/follow-list-screen.tsx',
    'components/invite-friends-screen.tsx',
    'components/public-user-profile-screen.tsx',
    'components/contacts/contact-sync-screen.tsx',
    'components/contacts/invite-screen.tsx',
    'components/coins/coin-gift-sheet.tsx',
    'components/reports/report-sheet.tsx',
    'components/search/open-rooms.tsx',
    'components/onboarding/invite-gate.tsx',
    'components/first-message-gate.tsx',
    'components/conversation-list.tsx',
  ])('%s ends its text-field sheet above the keyboard', (file) => {
    expect(read(`../${file}`)).toMatch(/className="keyboard-safe (fixed|absolute) inset-0/)
  })
})
