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
    expect(html.indexOf('data-original-bubble-meta')).toBeLessThan(
      html.indexOf('data-original-bubble-content'),
    )
    expect(html.indexOf('data-original-bubble-body')).toBeLessThan(
      html.indexOf('data-original-bubble-timestamp'),
    )
    expect(html).not.toContain('data-original-bubble-content" class="min-w-0 flex-1"')
  })
})
