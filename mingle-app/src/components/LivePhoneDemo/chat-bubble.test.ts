import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatBubble from './ChatBubble'

describe('ChatBubble', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders original bubble meta inside the bubble and timestamp outside on the right', () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-03-11T13:06:10+09:00').getTime(),
    )

    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-1',
          originalText: 'Original message',
          originalLang: 'en',
          translations: {},
          createdAtMs: new Date('2026-03-11T12:58:00+09:00').getTime(),
        },
        uiLocale: 'en',
      }),
    )

    expect(html).toContain('Original message')
    expect(html).toContain('🇺🇸')
    expect(html).toContain('>en<')
    expect(html).toContain('8m ago')
    expect(html.indexOf('data-original-bubble-content')).toBeLessThan(
      html.indexOf('data-original-bubble-meta'),
    )
    expect(html.indexOf('data-original-bubble-meta')).toBeLessThan(
      html.indexOf('Original message'),
    )
    expect(html.indexOf('data-original-bubble-body')).toBeLessThan(
      html.indexOf('data-original-bubble-timestamp'),
    )
    expect(html).toContain('max-width:min(86%, calc(100% - 2.5rem))')
    expect(html).toContain('border-top-left-radius:1px')
    expect(html).not.toContain('data-original-bubble-content" class="min-w-0 flex-1"')
    expect(html).toContain('data-original-bubble-text')
    expect(html).toContain('class="align-middle"')
  })

  it('keeps translation bubbles amber even before the final flag is set', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-2',
          originalText: 'Original message',
          originalLang: 'en',
          targetLanguages: ['ko'],
          translations: {
            ko: '부분 번역',
          },
          translationFinalized: {},
        },
        uiLocale: 'en',
      }),
    )

    expect(html).toContain('부분 번역')
    expect(html).toContain('bg-amber-50 border border-amber-100')
    expect(html).not.toContain('bg-gray-100/80')
    expect(html).not.toContain('bg-gray-400 animate-pulse')
  })
})
