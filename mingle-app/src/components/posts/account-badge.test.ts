import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { accountBadgeCopy } from '@/i18n/account-badge-copy'
import { resolveAccountBadge, type AccountBadgeKind } from '@/lib/account-badge'
import AccountBadge from './account-badge'

function render(kind: AccountBadgeKind | null | undefined, locale = 'ko', tone?: 'light' | 'dark') {
  return renderToStaticMarkup(createElement(AccountBadge, { kind, locale, tone }))
}

/** HTML-escaped the way React writes attribute values and text. */
function escaped(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
}

describe('AccountBadge: kind', () => {
  it('renders nothing for an ordinary account', () => {
    expect(render(resolveAccountBadge({}))).toBe('')
    expect(render(resolveAccountBadge({ isOfficial: false }))).toBe('')
    expect(render(null)).toBe('')
    expect(render(undefined)).toBe('')
  })

  it('keeps the official badge exactly as before: a plain chip with a screen-reader description', () => {
    const html = render(resolveAccountBadge({ isOfficial: true }))
    expect(html).toMatch(/^<span data-account-badge="official"/)
    expect(html).toContain('bg-sky-50 text-sky-700 ring-1 ring-sky-200')
    expect(html).toContain('title="Mingle 공식 계정"')
    expect(html).toContain('<span aria-hidden="true">공식</span>')
    expect(html).toContain('<span class="sr-only">Mingle 공식 계정</span>')
    expect(html).not.toContain('<button')
    expect(render('official', 'ko', 'light')).toContain('bg-white/20 text-white ring-1 ring-white/40')
  })
})

describe('AccountBadge: copy per locale', () => {
  it('labels official kind in each of the 15 primary UI languages', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = accountBadgeCopy(locale)
      const official = render('official', locale)
      expect(official, locale).toContain(`>${escaped(copy.official)}</span>`)
      expect(official, locale).toContain(`>${escaped(copy.officialDescription)}</span>`)
    }
  })
})
