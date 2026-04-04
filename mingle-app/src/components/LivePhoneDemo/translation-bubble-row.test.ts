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
          contentClassName: 'text-sm text-gray-500',
          contentStyle: { lineHeight: 1.25 },
        },
        createElement('span', null, '짧은 번역'),
      ),
    )

    expect(html).toContain('짧은 번역')
    expect(html).toContain('🇰🇷')
    expect(html).toContain('>ko<')
    expect(html.indexOf('data-translation-bubble-content')).toBeLessThan(
      html.indexOf('data-translation-bubble-meta'),
    )
    expect(html.indexOf('data-translation-bubble-meta')).toBeLessThan(
      html.indexOf('짧은 번역'),
    )
    expect(html).toContain('max-width:93%')
    expect(html).toContain('border-top-left-radius:1px')
    expect(html).toContain('line-height:1.25')
    expect(html).not.toContain('data-translation-bubble-content" class="min-w-0 flex-1"')
    expect(html).toContain('data-translation-bubble-meta')
    expect(html).toContain('data-translation-bubble-text')
    expect(html).toContain('class="align-middle"')
    expect(html).not.toContain('ml-2.5')
  })

  it('renders inline actions after the translated text', () => {
    const html = renderToStaticMarkup(
      createElement(
        TranslationBubbleRow,
        {
          lang: 'ko',
          bubbleClassName: 'bg-amber-50',
          metaClassName: 'text-amber-500',
          actions: createElement(
            'span',
            { 'data-message-bubble-actions': true },
            createElement('button', { 'data-message-copy-button': true }, 'copy'),
            createElement('button', { 'data-message-tts-button': true }, 'tts'),
          ),
        },
        createElement('span', null, '짧은 번역'),
      ),
    )

    expect(html).toContain('data-message-bubble-actions')
    expect(html).toContain('data-message-copy-button')
    expect(html).toContain('data-message-tts-button')
    expect(html.indexOf('짧은 번역')).toBeLessThan(
      html.indexOf('data-message-bubble-actions'),
    )
  })
})
