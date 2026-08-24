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
        bubbleDisplayMode: 'collapsed',
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
    expect(html).toContain('aria-label="Expand"')
    expect(html).toContain('data-original-language-quote-badge')
    expect(html).toContain('data-original-language-quote-icon')
    expect(html).toContain('text-black')
    expect(html).not.toContain('“”')
    expect(html).toContain('h-[30px] w-[30px]')
    expect(html).toContain('h-[30px] w-[42px]')
    expect(html).toContain('mr-1 inline-flex items-center gap-0')
    expect((html.match(/data-chat-language-badge-visual="true"/g) || []).length).toBe(1)
    expect((html.match(/data-chat-language-badge-variant="circle"/g) || []).length).toBe(1)
    expect(html).toContain('h-[11px] w-[11px]')
    expect(html).toContain('data-display-language="en"')
    expect((html.match(/data-chat-message-bubble="true"/g) || []).length).toBe(1)
    expect((html.match(/data-chat-language-badge="true"/g) || []).length).toBe(1)
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
    expect(html).toContain('max-width:100%')
    expect(html).toContain('px-2.5 py-1.5')
    expect(html).not.toContain('px-3.5 py-2')
    expect(html).not.toContain('data-original-bubble-tail')
    expect(html).not.toContain('border-bottom-left-radius:1px')
    expect(html).not.toContain('data-original-bubble-content" class="min-w-0 flex-1"')
    expect(html).toContain('data-current-bubble-text-value')
    expect(html.indexOf('data-chat-bubble-language-badges')).toBeLessThan(
      html.indexOf('data-current-bubble-text-value'),
    )
    expect(html).not.toContain('aria-label="Copy"')
    expect(html).not.toContain('data-message-copy-button')
    expect(html).toContain('data-copyable-bubble')
    expect((html.match(/data-message-copy-button/g) || []).length).toBe(0)
    expect((html.match(/data-copyable-bubble-double-tap-action="play-pronunciation"/g) || []).length).toBe(1)
    expect(html.indexOf('data-original-bubble-body')).toBeLessThan(
      html.indexOf('data-copyable-bubble'),
    )
    expect(html).toContain('class="align-middle"')
  })

  it('renders expanded original and translation rows as copyable surfaces without persistent copy buttons', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-expanded-default',
          originalText: 'Original message',
          originalLang: 'en',
          targetLanguages: ['ko', 'ja'],
          translations: {
            ko: '번역 메시지',
            ja: '翻訳メッセージ',
          },
        },
        uiLocale: 'en',
      }),
    )

    expect((html.match(/data-expanded-chat-bubble-row="true"/g) || []).length).toBe(3)
    expect((html.match(/data-copyable-bubble="true"/g) || []).length).toBe(3)
    expect((html.match(/data-expanded-bubble-container="true"/g) || []).length).toBe(1)
    expect((html.match(/data-expanded-bubble-divider="true"/g) || []).length).toBe(2)
    expect((html.match(/data-chat-language-badge-visual="true"/g) || []).length).toBe(3)
    expect((html.match(/data-chat-language-badge-variant="icon"/g) || []).length).toBe(3)
    expect((html.match(/data-message-copy-button="true"/g) || []).length).toBe(0)
    expect(html).toContain('data-chat-bubble-toggle="true"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-label="Collapse"')
    expect(html).toContain('>Collapse</button>')
    expect(html).toContain('data-chat-bubble-content-switch="expanded"')
    expect(html).toContain('my-0.5 h-px w-full bg-gray-200/60')
    expect(html).toContain('mr-0 inline-flex align-middle')
    expect(html).toContain('max-width:100%')
    expect(html).toContain('px-2 py-1')
    expect(html).not.toContain('shrink-0 pt-0.5')
    expect(html).not.toContain('rotate-90')
    expect(html).not.toContain('>EN<')
    expect(html).not.toContain('>KO<')
    expect(html).not.toContain('>JA<')
    expect(html).not.toContain('data-chat-bubble-language-badges')
    expect(html).toContain('Original message')
    expect(html).toContain('번역 메시지')
    expect(html).toContain('翻訳メッセージ')
    expect(html).toContain('inline-block w-fit max-w-full rounded-2xl border')
    expect(html).not.toContain('inline w-fit max-w-full rounded-2xl border')
    expect(html.indexOf('data-expanded-bubble-content')).toBeLessThan(
      html.indexOf('data-expanded-bubble-meta'),
    )
    expect(html.indexOf('data-expanded-bubble-meta')).toBeLessThan(
      html.indexOf('Original message'),
    )
  })

  it('keeps the localized toggle attached to the bubble bottom edge on both sides', () => {
    const renderBubble = (speakerUserId: string, viewerUserId: string) => renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: `u-toggle-${speakerUserId}`,
          originalText: 'Short message',
          originalLang: 'en',
          translations: {},
          speakerUserId,
        },
        uiLocale: 'en',
        viewerUserId,
        bubbleDisplayMode: 'collapsed',
      }),
    )
    const openingTag = (html: string, marker: string) => {
      const start = html.indexOf(marker)
      return html.slice(start, html.indexOf('>', start) + 1)
    }

    const otherHtml = renderBubble('user-other', 'user-me')
    const otherMessageColumnTag = openingTag(otherHtml, 'data-chat-message-column')
    const otherContentSwitchTag = openingTag(otherHtml, 'data-chat-bubble-content-switch="collapsed"')
    const otherControlsTag = openingTag(otherHtml, 'data-chat-bubble-controls')

    expect(otherMessageColumnTag).toContain('items-end gap-0.5')
    expect(otherMessageColumnTag).not.toContain('gap-1 ')
    expect(otherMessageColumnTag).not.toContain('gap-1.5')
    expect(otherMessageColumnTag).not.toContain('flex-row-reverse')
    expect(otherContentSwitchTag).toContain('min-w-0 w-max max-w-full shrink')
    expect(otherContentSwitchTag).toContain('flex-basis:max-content')
    expect(otherContentSwitchTag).not.toContain('flex-1')
    expect(otherControlsTag).toContain('self-end')
    expect(otherControlsTag).not.toContain('mb-1.5')
    expect(otherHtml.indexOf('data-chat-message-bubble-stack')).toBeLessThan(
      otherHtml.indexOf('data-chat-bubble-controls'),
    )

    const ownHtml = renderBubble('user-me', 'user-me')
    const ownMessageColumnTag = openingTag(ownHtml, 'data-chat-message-column')
    expect(ownMessageColumnTag).toContain('items-end gap-0.5')
    expect(ownMessageColumnTag).toContain('flex-row-reverse')
  })

  it('starts bubble sizing from max-content before shrinking to the available row width', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-natural-width',
          originalText: '또',
          originalLang: 'ko',
          targetLanguages: ['en', 'ja'],
          translations: {
            en: 'Again',
            ja: 'また',
          },
          speakerUserId: 'user-me',
        },
        uiLocale: 'en',
        viewerUserId: 'user-me',
      }),
    )

    const openingTag = (markup: string, marker: string) => {
      const start = markup.indexOf(marker)
      return markup.slice(start, markup.indexOf('>', start) + 1)
    }
    const contentSwitchTag = openingTag(html, 'data-chat-bubble-content-switch="expanded"')
    expect(contentSwitchTag).toContain('w-max max-w-full shrink')
    expect(contentSwitchTag).toContain('flex-basis:max-content')
    expect(html).toContain('max-width:100%')
    expect(html.indexOf('🇺🇸')).toBeLessThan(html.indexOf('Again'))
  })

  it('uses one speaker-based background color for every expanded row', () => {
    const otherHtml = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-other-color',
          originalText: 'Other original',
          originalLang: 'en',
          targetLanguages: ['ko'],
          translations: { ko: '다른 사람 번역' },
          speakerUserId: 'user-other',
        },
        uiLocale: 'en',
        viewerUserId: 'user-me',
      }),
    )
    const ownHtml = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-own-color',
          originalText: 'My original',
          originalLang: 'en',
          targetLanguages: ['ko'],
          translations: { ko: '내 번역' },
          speakerUserId: 'user-me',
        },
        uiLocale: 'en',
        viewerUserId: 'user-me',
      }),
    )

    expect(otherHtml).toContain('border-gray-200 bg-white')
    expect(otherHtml).not.toContain('border-amber-100')
    expect(otherHtml).not.toContain('border-gray-200 bg-amber-50/80')
    expect(ownHtml).toContain('border-gray-200 bg-amber-50/80')
    expect(ownHtml).not.toContain('border-gray-200 bg-white')
    expect(ownHtml).not.toContain('border-amber-100')

    const ownOriginalRowStart = ownHtml.indexOf('data-expanded-chat-bubble-row')
    const ownOriginalRowEnd = ownHtml.indexOf('data-expanded-bubble-divider')
    const ownOriginalRowHtml = ownHtml.slice(ownOriginalRowStart, ownOriginalRowEnd)
    expect(ownOriginalRowHtml).not.toContain('flex-row-reverse')
    expect(ownOriginalRowHtml.indexOf('data-chat-language-badge')).toBeLessThan(
      ownOriginalRowHtml.indexOf('My original'),
    )

    const ownCollapsedHtml = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-own-collapsed-color',
          originalText: 'My collapsed original',
          originalLang: 'en',
          targetLanguages: ['ko'],
          translations: { ko: '내 접힌 번역' },
          speakerUserId: 'user-me',
        },
        uiLocale: 'en',
        viewerUserId: 'user-me',
        bubbleDisplayMode: 'collapsed',
      }),
    )
    expect(ownCollapsedHtml).toContain('border border-gray-200 bg-amber-50/80')
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
        languageOrder: ['ko'],
        bubbleDisplayMode: 'collapsed',
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
    expect(html).not.toContain('aria-label="Copy"')
    expect(html).not.toContain('data-message-copy-button')
    expect(html).toContain('data-copyable-bubble')
    expect((html.match(/data-message-copy-button/g) || []).length).toBe(0)
    expect((html.match(/data-copyable-bubble-double-tap-action="play-pronunciation"/g) || []).length).toBe(1)
    expect(html).not.toContain('data-original-bubble-body')
    expect(html.indexOf('data-translation-bubble-body')).toBeLessThan(
      html.indexOf('data-copyable-bubble'),
    )
    expect(html).not.toContain('data-interim-translation-cursor')
  })

  it('keeps room language order while moving the original-language quote badge', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-room-order',
          originalText: '원문',
          originalLang: 'en',
          targetLanguages: ['ja', 'ko'],
          translations: {
            ja: '原文',
            ko: '원문',
          },
        },
        uiLocale: 'ko',
        languageOrder: ['ja', 'en', 'ko'],
        bubbleDisplayMode: 'collapsed',
      }),
    )

    const japaneseIndex = html.indexOf('data-chat-language="ja"')
    const englishIndex = html.indexOf('data-chat-language="en"')
    const koreanIndex = html.indexOf('data-chat-language="ko"')
    const quoteIndex = html.indexOf('data-original-language-quote-badge')

    expect(japaneseIndex).toBeGreaterThan(-1)
    expect(englishIndex).toBeGreaterThan(japaneseIndex)
    expect(koreanIndex).toBeGreaterThan(englishIndex)
    expect(quoteIndex).toBeGreaterThan(englishIndex)
    expect(quoteIndex).toBeLessThan(koreanIndex)
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
        languageOrder: ['ko'],
        bubbleDisplayMode: 'collapsed',
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
        languageOrder: ['ko'],
        bubbleDisplayMode: 'collapsed',
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
        bubbleDisplayMode: 'collapsed',
      }),
    )

    expect(html).toContain('Draft message')
    expect(html).toContain('text-sm text-gray-400')
    expect(html).toContain('bg-amber-400 align-middle animate-pulse')
    expect(html).toContain('10s ago')
    expect(html).toContain('data-original-bubble-row')
    expect((html.match(/data-message-copy-button/g) || []).length).toBe(0)
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
        bubbleDisplayMode: 'collapsed',
      }),
    )

    expect((html.match(/data-copyable-bubble-double-tap-action="play-pronunciation"/g) || []).length).toBe(1)
    expect((html.match(/data-chat-language-badge="true"/g) || []).length).toBe(2)
    expect((html.match(/data-original-language-quote-badge/g) || []).length).toBe(1)
    expect(html).not.toContain('data-message-tts-button')
  })

  it('keeps wide flag hit areas while reducing visible spacing between languages', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-multi-language-flags',
          originalText: 'Hello there',
          originalLang: 'en',
          targetLanguages: ['ko', 'ja'],
          translations: {
            ko: '안녕하세요',
            ja: 'こんにちは',
          },
        },
        uiLocale: 'en',
        bubbleDisplayMode: 'collapsed',
      }),
    )

    expect((html.match(/data-chat-language-badge="true"/g) || []).length).toBe(3)
    expect((html.match(/data-chat-language-badge-visual="true"/g) || []).length).toBe(3)
    expect((html.match(/h-\[30px\] w-\[42px\]/g) || []).length).toBe(3)
    expect(html).toContain('mr-1 inline-flex items-center gap-0')
  })

  it('keeps the solo-room left-anchored layout when there is no viewer/speaker account match', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-solo',
          originalText: 'Solo room message',
          originalLang: 'en',
          translations: {},
          speakerUserId: 'user-a',
        },
        uiLocale: 'en',
        viewerUserId: 'user-b',
      }),
    )

    expect(html).not.toContain('justify-end')
    expect(html).not.toContain('flex-row-reverse')
    expect(html.indexOf('data-speaker-avatar-column')).toBeLessThan(
      html.indexOf('data-chat-message-bubble-stack'),
    )
  })

  it('renders the avatar unaffected when speakerUserId/viewerUserId are simply absent', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-no-account',
          originalText: 'No account info',
          originalLang: 'en',
          translations: {},
        },
        uiLocale: 'en',
      }),
    )

    expect(html).not.toContain('justify-end')
    expect(html.indexOf('data-speaker-avatar-column')).toBeLessThan(
      html.indexOf('data-chat-message-bubble-stack'),
    )
  })

  it('right-aligns the bubble and moves the avatar after it when the viewer is the sender', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-own',
          originalText: 'My own message',
          originalLang: 'en',
          translations: {},
          speakerUserId: 'user-a',
        },
        uiLocale: 'en',
        viewerUserId: 'user-a',
      }),
    )

    expect(html).toContain('justify-end')
    expect(html).toContain('flex-row-reverse')
    expect(html.indexOf('data-chat-message-bubble-stack')).toBeLessThan(
      html.indexOf('data-speaker-avatar-column'),
    )
  })

  it('renders the real photo instead of the animal avatar when speakerImage is set', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-photo',
          originalText: 'Hi there',
          originalLang: 'en',
          translations: {},
          speakerUserId: 'user-b',
          speakerImage: 'https://cdn.example.com/bob.jpg',
        },
        uiLocale: 'en',
        viewerUserId: 'user-a',
      }),
    )

    expect(html).toContain('https://cdn.example.com/bob.jpg')
    expect(html).not.toContain('/avatars/animals/')
  })

  it('renders a neutral placeholder, not the animal avatar, for a shared-room member with no photo', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-no-photo',
          originalText: 'Hi there',
          originalLang: 'en',
          translations: {},
          speakerUserId: 'user-b',
        },
        uiLocale: 'en',
        viewerUserId: 'user-a',
      }),
    )

    expect(html).not.toContain('/avatars/animals/')
  })

  it('keeps the animal avatar for a true solo-room turn with no speakerUserId', () => {
    const html = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-solo-diarized',
          originalText: 'Hi there',
          originalLang: 'en',
          translations: {},
        },
        uiLocale: 'en',
      }),
    )

    expect(html).toContain('/avatars/animals/')
  })

  it('makes both identified member avatars onOpenProfile buttons', () => {
    const otherHtml = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-other',
          originalText: 'Hi there',
          originalLang: 'en',
          translations: {},
          speakerUserId: 'user-b',
        },
        uiLocale: 'en',
        viewerUserId: 'user-a',
        onOpenProfile: () => {},
      }),
    )
    expect(otherHtml).toContain('<button')
    expect(otherHtml).toContain('data-speaker-avatar-column')

    const ownHtml = renderToStaticMarkup(
      createElement(ChatBubble, {
        utterance: {
          id: 'u-self',
          originalText: 'Hi there',
          originalLang: 'en',
          translations: {},
          speakerUserId: 'user-a',
        },
        uiLocale: 'en',
        viewerUserId: 'user-a',
        onOpenProfile: () => {},
      }),
    )
    const avatarColumnStart = ownHtml.indexOf('data-speaker-avatar-column')
    const avatarColumnHtml = ownHtml.slice(avatarColumnStart, avatarColumnStart + 400)
    expect(avatarColumnHtml).toContain('<button')
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
