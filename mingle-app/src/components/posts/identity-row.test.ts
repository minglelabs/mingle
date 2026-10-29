import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AccountBadge from './account-badge'
import IdentityRow, { type IdentityRowAction } from './identity-row'

/**
 * Deepest nesting of interactive elements (<button>/<a>) in the markup.
 * 1 = none nested in another.
 */
function maxInteractiveDepth(html: string): number {
  let depth = 0
  let max = 0
  for (const match of html.matchAll(/<(\/?)(button|a)[\s>]/g)) {
    if (match[1]) depth -= 1
    else {
      depth += 1
      max = Math.max(max, depth)
    }
  }
  return max
}

function renderRow(action: IdentityRowAction) {
  return renderToStaticMarkup(
    createElement(
      IdentityRow,
      {
        action,
        label: 'Mina (공식), @mina',
        className: 'min-w-0 flex-1',
        actionClassName: 'rounded-xl active:bg-gray-50',
        contentClassName: 'flex items-center gap-3',
      },
      createElement('span', { 'aria-hidden': 'true' }, 'Mina'),
      createElement(AccountBadge, { kind: 'official', locale: 'ko' }),
    ),
  )
}

describe('IdentityRow', () => {
  it('puts the row action under the content instead of around it, so the badge is not nested', () => {
    const html = renderRow({ kind: 'button', onClick: () => {} })
    // The action is an empty, stretched button carrying the row label.
    expect(html).toContain(
      '<button type="button" aria-label="Mina (공식), @mina" class="absolute inset-0 rounded-xl active:bg-gray-50"></button>',
    )
    // Content passes taps through to the action; the badge (a later sibling) takes its own.
    expect(html).toContain('<div class="pointer-events-none relative flex items-center gap-3">')
    expect(html).toContain('data-account-badge="official"')
    expect(maxInteractiveDepth(html)).toBe(1)
    expect(html.indexOf('data-account-badge="official"')).toBeGreaterThan(html.indexOf('</button>'))
  })

  it('supports a link action and the toggle / expand states', () => {
    const link = renderRow({ kind: 'link', href: '/ko/users/u1' })
    expect(link).toContain('<a aria-label="Mina (공식), @mina" class="absolute inset-0 rounded-xl active:bg-gray-50" href="/ko/users/u1"></a>')
    expect(maxInteractiveDepth(link)).toBe(1)

    expect(renderRow({ kind: 'button', onClick: () => {}, pressed: true })).toContain('aria-pressed="true"')
    expect(renderRow({ kind: 'button', onClick: () => {}, expanded: false })).toContain('aria-expanded="false"')
  })

  it('keeps the whole row as the tap target', () => {
    const html = renderRow({ kind: 'button', onClick: () => {} })
    expect(html).toMatch(/^<div class="relative min-w-0 flex-1" data-identity-row="">/)
  })
})
