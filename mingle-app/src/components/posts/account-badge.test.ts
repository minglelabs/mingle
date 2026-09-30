import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { accountBadgeCopy } from '@/i18n/account-badge-copy'
import { commentsCopy } from '@/i18n/comments-copy'
import { resolveAccountBadge, type AccountBadgeKind } from '@/lib/account-badge'
import AccountBadge, {
  activateAccountBadge,
  OPERATOR_SHEET_BACK_PRIORITY,
  OperatorAccountSheetPanel,
  operatorBadgeAccessibleName,
  resolveSheetKeyAction,
} from './account-badge'

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
    expect(render(resolveAccountBadge({ isOfficial: false, isOperator: false }))).toBe('')
    expect(render(null)).toBe('')
    expect(render(undefined)).toBe('')
  })

  it('renders the operator badge as a button that opens a dialog, closed at first', () => {
    const html = render(resolveAccountBadge({ isOperator: true }))
    expect(html).toMatch(/^<button type="button" data-account-badge="operator"/)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    // Label + description for screen readers, visible label first (label in name).
    expect(html).toContain('aria-label="운영 계정, Mingle 팀이 운영하는 계정"')
    expect(html).toContain('>운영 계정</span>')
    // Nothing of the sheet is rendered until the badge is tapped.
    expect(html).not.toContain('role="dialog"')
  })

  it('gives the small operator chip a >= 44 px touch target', () => {
    const html = render('operator')
    expect(html).toContain('before:h-11')
    expect(html).toContain('before:min-w-11')
    // It stays tappable inside an IdentityRow's pass-through content.
    expect(html).toContain('pointer-events-auto')
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

  it('shows the operator label, never the official one, when a row carries both flags', () => {
    expect(render(resolveAccountBadge({ isOfficial: true, isOperator: true }))).toContain('data-account-badge="operator"')
  })

  it('uses a neutral chip for operators on light surfaces and the white chip on photos', () => {
    expect(render('operator', 'ko', 'dark')).toContain('bg-slate-100 text-slate-700 ring-1 ring-slate-300')
    expect(render('operator', 'ko', 'light')).toContain('bg-white/20 text-white ring-1 ring-white/40')
  })
})

describe('AccountBadge: copy per locale', () => {
  it('labels both kinds in each of the 15 primary UI languages', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = accountBadgeCopy(locale)
      const operator = render('operator', locale)
      expect(operator, locale).toContain(`>${escaped(copy.operator)}</span>`)
      expect(operator, locale).toContain(`aria-label="${escaped(`${copy.operator}, ${copy.operatorDescription}`)}"`)
      const official = render('official', locale)
      expect(official, locale).toContain(`>${escaped(copy.official)}</span>`)
      expect(official, locale).toContain(`>${escaped(copy.officialDescription)}</span>`)
    }
  })

  it('reads the English label for an unknown locale and a region tag', () => {
    expect(operatorBadgeAccessibleName('xx')).toBe('Run by Mingle, This account is run by the Mingle team.')
    expect(operatorBadgeAccessibleName('ko-KR')).toBe('운영 계정, Mingle 팀이 운영하는 계정')
    expect(render('operator', 'en')).toContain('>Run by Mingle</span>')
  })
})

describe('activateAccountBadge (a tap on the operator badge)', () => {
  it('opens the sheet and stops the tap from reaching the profile button / like gesture around it', () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
    const openSheet = vi.fn()
    activateAccountBadge(event, openSheet)
    expect(event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(openSheet).toHaveBeenCalledTimes(1)
  })
})

describe('OperatorAccountSheetPanel', () => {
  function renderPanel(locale: string) {
    return renderToStaticMarkup(
      createElement(OperatorAccountSheetPanel, { locale, titleId: 'sheet-title', bodyId: 'sheet-body', onClose: () => {} }),
    )
  }

  it('is a labelled, described modal dialog with a close button', () => {
    const html = renderPanel('ko')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="sheet-title"')
    expect(html).toContain('aria-describedby="sheet-body"')
    expect(html).toContain('<h2 id="sheet-title"')
    expect(html).toContain('>운영 계정</h2>')
    expect(html).toContain('<p id="sheet-body"')
    expect(html).toContain('이 계정은 개인이 아니라 Mingle 팀이 운영합니다. 게시물과 답장은 Mingle 팀원이 작성합니다.')
    expect(html).toContain('aria-label="닫기"')
    // The close button is a full-size touch target; the sheet respects the home indicator.
    expect(html).toContain('h-11 w-11')
    expect(html).toContain('env(safe-area-inset-bottom)')
  })

  it('shows the sheet title and body of every primary UI language', () => {
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = accountBadgeCopy(locale)
      const html = renderPanel(locale)
      expect(html, locale).toContain(`>${escaped(copy.operatorSheetTitle)}</h2>`)
      expect(html, locale).toContain(`>${escaped(copy.operatorSheetBody)}</p>`)
      expect(html, locale).toContain(`aria-label="${escaped(commentsCopy(locale).close)}"`)
    }
  })
})

describe('resolveSheetKeyAction', () => {
  it('closes on Escape', () => {
    expect(resolveSheetKeyAction('Escape', false, 0, 1)).toEqual({ type: 'close' })
    expect(resolveSheetKeyAction('Esc', false, -1, 1)).toEqual({ type: 'close' })
  })

  it('keeps Tab and Shift+Tab inside the sheet', () => {
    // Only the close button: focus stays on it either way.
    expect(resolveSheetKeyAction('Tab', false, 0, 1)).toEqual({ type: 'focus', index: 0 })
    expect(resolveSheetKeyAction('Tab', true, 0, 1)).toEqual({ type: 'focus', index: 0 })
    // Wraps at both ends; moves normally in between.
    expect(resolveSheetKeyAction('Tab', false, 2, 3)).toEqual({ type: 'focus', index: 0 })
    expect(resolveSheetKeyAction('Tab', true, 0, 3)).toEqual({ type: 'focus', index: 2 })
    expect(resolveSheetKeyAction('Tab', false, 0, 3)).toBeNull()
    expect(resolveSheetKeyAction('Tab', true, 2, 3)).toBeNull()
    // Focus outside the sheet is pulled back in.
    expect(resolveSheetKeyAction('Tab', false, -1, 3)).toEqual({ type: 'focus', index: 0 })
    expect(resolveSheetKeyAction('Tab', true, -1, 3)).toEqual({ type: 'focus', index: 2 })
    expect(resolveSheetKeyAction('Tab', false, -1, 0)).toEqual({ type: 'focus', index: -1 })
  })

  it('leaves every other key to the focused element', () => {
    expect(resolveSheetKeyAction('Enter', false, 0, 1)).toBeNull()
    expect(resolveSheetKeyAction(' ', false, 0, 1)).toBeNull()
  })
})

describe('operator sheet: Android back', () => {
  it('outranks every other native back handler (image preview = 80, profile = 40)', () => {
    expect(OPERATOR_SHEET_BACK_PRIORITY).toBeGreaterThan(80)
  })
})
