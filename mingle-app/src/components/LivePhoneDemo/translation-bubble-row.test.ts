import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TranslationBubbleRow from './TranslationBubbleRow'

describe('TranslationBubbleRow', () => {
  it('renders the message body before the right-side meta cluster', () => {
    const html = renderToStaticMarkup(
      createElement(
        TranslationBubbleRow,
        {
          lang: 'ko',
          bubbleClassName: 'bg-amber-50',
          metaClassName: 'text-amber-500',
        },
        createElement('p', null, '짧은 번역'),
      ),
    )

    expect(html).toContain('짧은 번역')
    expect(html).toContain('🇰🇷')
    expect(html).toContain('>ko<')
    expect(html.indexOf('data-translation-bubble-body')).toBeLessThan(
      html.indexOf('data-translation-bubble-meta'),
    )
  })
})
