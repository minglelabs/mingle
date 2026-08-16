import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatBubble from './ChatBubble'

describe('ChatBubble', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders one unified message bubble with language badges and a timestamp under the avatar', () => {
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
    expect(html).toContain('width="32"')
    expect(html).toContain('height="32"')
    expect(html).toContain('data-chat-message-bubble')
    expect(html).toContain('data-chat-bubble-language-badges')
    expect(html).toContain('data-original-language-quote-badge')
    expect(html).toContain('data-original-language-quote-icon')
    expect(html).toContain('text-black')
    expect(html).not.toContain('“”')
    expect(html).toContain('h-[30px] w-[30px]')
    expect(html).toContain('h-[11px] w-[11px]')
    expect(html).toContain('data-display-language="en"')
    expect((html.match(/data-chat-message-bubble/g) || []).length).toBe(1)
    expect((html.match(/data-chat-language-badge/g) || []).length).toBe(1)
    expect(html.indexOf('data-current-bubble-content')).toBeLessThan(
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
    expect(html).toContain('max-width:90%')
    expect(html).not.toContain('data-original-bubble-tail')
    expect(html).not.toContain('border-bottom-left-radius:1px')
    expect(html).not.toContain('data-original-bubble-content" class="min-w-0 flex-1"')
    expect(html).toContain('data-current-bubble-text-value')
    expect(html.indexOf('data-chat-bubble-language-badges')).toBeLessThan(
      html.indexOf('data-current-bubble-text-value'),
    )
    expect(html).toContain('aria-label="Copy"')
    expect(html).toContain('data-message-copy-button')
    expect(html).toContain('data-copyable-bubble')
    expect((html.match(/data-message-copy-button/g) || []).length).toBe(1)
    expect((html.match(/data-copyable-bubble-double-tap-action="play-pronunciation"/g) || []).length).toBe(1)
    expect(html.indexOf('data-original-bubble-body')).toBeLessThan(
      html.indexOf('aria-label="Copy"'),
    )
    expect(html).toContain('class="align-middle"')
  })

  it('matches interim translation text to the draft input gray without a cursor', () => {
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
          translationFinalized: {
            ko: false,
          },
        },
        uiLocale: 'en',
        preferredDisplayLanguage: 'ko',
      }),
    )

    expect(html).toContain('부분 번역')
    expect(html).toContain('data-translation-state="interim"')
    expect(html).toContain('data-chat-message-bubble')
    expect(html).toContain('data-display-language="ko"')
    expect(html).toContain('data-translation-bubble-body')
    expect(html).toContain('text-sm text-gray-400')
    expect(html).not.toContain('bg-amber-50')
    expect(html).not.toContain('bg-gray-100 border border-gray-200')
    expect(html).toContain('aria-label="Copy"')
    expect(html).toContain('data-message-copy-button')
    expect((html.match(/data-message-copy-button/g) || []).length).toBe(1)
    expect((html.match(/data-copyable-bubble-double-tap-action="play-pronunciation"/g) || []).length).toBe(1)
    expect(html).not.toContain('data-original-bubble-body')
    expect(html.indexOf('data-translation-bubble-body')).toBeLessThan(
      html.indexOf('aria-label="Copy"'),
    )
    expect(html).not.toContain('data-interim-translation-cursor')
  })

  it('renders one finalized translation when its language badge is selected', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-final',
          originalText: 'Original message',
          originalLang: 'en',
          targetLanguages: ['ko'],
          translations: {
            ko: 'Final translation',
          },
          translationFinalized: {
            ko: true,
          },
        },
        uiLocale: 'en',
        preferredDisplayLanguage: 'ko',
      }),
    )

    expect(html).toContain('data-translation-state="final"')
    expect(html).toContain('data-display-language="ko"')
    expect(html).toContain('data-chat-message-bubble')
    expect(html).toContain('border-gray-200 bg-white')
    expect(html).not.toContain('bg-amber-50')
    expect(html).not.toContain('data-interim-translation-cursor')
  })

  it('treats translations without a finalization flag as finalized for saved conversations', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-saved',
          originalText: 'Saved original',
          originalLang: 'en',
          translations: {
            ko: 'Saved translation',
          },
        },
        uiLocale: 'en',
        preferredDisplayLanguage: 'ko',
      }),
    )

    expect(html).toContain('data-translation-state="final"')
    expect(html).toContain('data-display-language="ko"')
    expect(html).toContain('Saved translation')
    expect(html).not.toContain('bg-amber-50')
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
    expect((html.match(/data-message-copy-button/g) || []).length).toBe(1)
    expect((html.match(/data-copyable-bubble-double-tap-action="play-pronunciation"/g) || []).length).toBe(0)
    expect((html.match(/data-copyable-bubble-double-tap-action="copy"/g) || []).length).toBe(1)
  })

  it('renders a warning icon instead of the unknown language label', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-unknown',
          originalText: 'Mystery language',
          originalLang: 'unknown',
          translations: {},
        },
        uiLocale: 'en',
      }),
    )

    expect(html).toContain('🌐')
    expect(html).toContain('❓')
    expect(html).not.toContain('>unknown<')
    expect(html).not.toContain('>UNKNOWN<')
  })

  it('routes original and translated bubbles to pronunciation playback on double tap', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-actions',
          originalText: 'Hello there',
          originalLang: 'en',
          translations: {
            ko: '안녕하세요',
          },
        },
        uiLocale: 'en',
        preferredDisplayLanguage: 'ko',
      }),
    )

    expect((html.match(/data-copyable-bubble-double-tap-action="play-pronunciation"/g) || []).length).toBe(1)
    expect((html.match(/data-chat-language-badge/g) || []).length).toBe(2)
    expect((html.match(/data-original-language-quote-badge/g) || []).length).toBe(1)
    expect(html).not.toContain('data-message-tts-button')
  })

  it('does not render visible tts icon buttons', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-actions-ko',
          originalText: '안녕하세요',
          originalLang: 'ko',
          translations: {
            en: 'Hello',
          },
        },
        uiLocale: 'ko',
      }),
    )

    expect(html).not.toContain('data-message-tts-button')
  })
})
