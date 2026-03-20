import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatBubble from './ChatBubble'

describe('ChatBubble', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders original bubble meta inside the bubble and stacks the timestamp under the avatar', () => {
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
    expect(html).toContain('data-speaker-avatar-column')
    expect(html).toContain('data-original-bubble-tail')
    expect(html).toContain('width="32"')
    expect(html).toContain('height="32"')
    expect(html.indexOf('data-original-bubble-content')).toBeLessThan(
      html.indexOf('data-original-bubble-meta'),
    )
    expect(html.indexOf('data-original-bubble-meta')).toBeLessThan(
      html.indexOf('Original message'),
    )
    expect(html.indexOf('data-speaker-avatar-column')).toBeLessThan(
      html.indexOf('data-original-bubble-timestamp'),
    )
    expect(html.indexOf('data-speaker-avatar-column')).toBeLessThan(
      html.indexOf('data-original-bubble-row'),
    )
    expect(html).toContain('max-width:93%')
    expect(html).not.toContain('border-bottom-left-radius:1px')
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

  it('renders draft original bubbles with the same bubble structure and a live cursor', () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-03-20T10:00:10+09:00').getTime(),
    )

    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-draft',
          originalText: 'Draft message',
          originalLang: 'en',
          translations: {},
          createdAtMs: new Date('2026-03-20T10:00:00+09:00').getTime(),
        },
        uiLocale: 'en',
        isDraft: true,
      }),
    )

    expect(html).toContain('Draft message')
    expect(html).toContain('text-sm text-gray-400')
    expect(html).toContain('bg-amber-400 align-middle animate-pulse')
    expect(html).toContain('10s ago')
    expect(html).toContain('data-original-bubble-row')
  })
})
