import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TranslationBubbleRow from './TranslationBubbleRow'

describe('TranslationBubbleRow', () => {
  it('renders the meta cluster before the message body inside the bubble', () => {
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
    expect(html.indexOf('data-translation-bubble-meta')).toBeLessThan(
      html.indexOf('data-translation-bubble-content'),
    )
    expect(html.indexOf('data-translation-bubble-content')).toBeLessThan(
      html.indexOf('짧은 번역'),
    )
    expect(html).not.toContain('data-translation-bubble-content" class="min-w-0 flex-1"')
  })
})
