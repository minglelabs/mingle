import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ChatBubble, { type Utterance } from './ChatBubble'
import {
  arePlaybackKeyListsEqual,
  buildOriginalBubblePlaybackKey,
  buildTranslationBubblePlaybackKey,
  groupBubbleTtsIndicatorsByUtterance,
  parseBubblePlaybackKeyUtteranceId,
  resolveBubbleTtsIndicatorKeys,
  resolveBubbleTtsIndicatorState,
} from './live-phone-demo.bubble-tts-indicator'

const partnerMessage: Utterance = {
  id: 'u-1000-1',
  originalText: 'Hello there',
  originalLang: 'en',
  targetLanguages: ['ko', 'en'],
  translations: { ko: '안녕하세요' },
  translationFinalized: { ko: true },
  createdAtMs: 1_000,
  speakerUserId: 'partner',
}
const translationKey = buildTranslationBubblePlaybackKey(partnerMessage.id, 'ko')

function renderBubble(props: Record<string, unknown>, displayMode: 'collapsed' | 'expanded' = 'collapsed') {
  return renderToStaticMarkup(createElement(ChatBubble, {
    utterance: partnerMessage,
    uiLocale: 'ko',
    preferredDisplayLanguage: 'ko',
    preferredDisplayLanguages: ['ko'],
    defaultDisplayLanguage: 'ko',
    languageOrder: ['ko', 'en'],
    viewerUserId: 'viewer',
    bubbleDisplayMode: displayMode,
    ...props,
  }))
}

describe('playback keys', () => {
  it('builds and parses the keys every surface shares', () => {
    expect(buildOriginalBubblePlaybackKey('u-1', ' KO ')).toBe('original:u-1:ko')
    expect(buildTranslationBubblePlaybackKey('u-1', 'zh-TW')).toBe('translation:u-1:zh-tw')
    expect(parseBubblePlaybackKeyUtteranceId('translation:u-1:zh-tw')).toBe('u-1')
    expect(parseBubblePlaybackKeyUtteranceId('image-1')).toBeNull()
    expect(parseBubblePlaybackKeyUtteranceId('other:u-1:ko')).toBeNull()
  })
})

describe('resolveBubbleTtsIndicatorKeys', () => {
  it('shows the current clip as pending until its audio really starts', () => {
    expect(resolveBubbleTtsIndicatorKeys({ current: { playbackKey: 'k1', started: false } })).toEqual({ pendingPlaybackKeys: ['k1'] })
    expect(resolveBubbleTtsIndicatorKeys({ current: { playbackKey: 'k1', started: true } })).toEqual({
      playingPlaybackKey: 'k1',
      pendingPlaybackKeys: [],
    })
  })

  it('shows a synthesizing manual request and queued auto items as pending', () => {
    expect(resolveBubbleTtsIndicatorKeys({
      current: { playbackKey: 'auto-1', started: true },
      pendingManualPlaybackKey: 'manual-1',
      queuedAutoPlaybackKeys: ['auto-2', 'manual-1', 'auto-1'],
    })).toEqual({ playingPlaybackKey: 'auto-1', pendingPlaybackKeys: ['manual-1', 'auto-2'] })
  })

  it('groups keys per row so uninvolved rows keep undefined props', () => {
    const grouped = groupBubbleTtsIndicatorsByUtterance({
      playingPlaybackKey: 'translation:a:ko',
      pendingPlaybackKeys: ['original:a:en', 'translation:b:ko'],
    })
    expect(grouped.get('a')).toEqual({ playingPlaybackKey: 'translation:a:ko', pendingPlaybackKeys: ['original:a:en'] })
    expect(grouped.get('b')).toEqual({ pendingPlaybackKeys: ['translation:b:ko'] })
    expect(grouped.get('c')).toBeUndefined()
  })

  it('resolves one state per row key, playing first', () => {
    expect(resolveBubbleTtsIndicatorState('k', { playingPlaybackKey: 'k', pendingPlaybackKeys: ['k'] })).toBe('playing')
    expect(resolveBubbleTtsIndicatorState('k', { pendingPlaybackKeys: ['k'] })).toBe('pending')
    expect(resolveBubbleTtsIndicatorState('k', { speakingPlaybackKey: 'k' })).toBe('speaking')
    expect(resolveBubbleTtsIndicatorState('k', {})).toBeNull()
    expect(arePlaybackKeyListsEqual(['a'], ['a'])).toBe(true)
    expect(arePlaybackKeyListsEqual(undefined, [])).toBe(true)
    expect(arePlaybackKeyListsEqual(['a'], ['b'])).toBe(false)
  })
})

describe('ChatBubble TTS indicator', () => {
  it('renders a static "…" while pending (manual or auto)', () => {
    const html = renderBubble({ pendingPlaybackKeys: [translationKey] })
    expect(html).toContain('data-bubble-tts-indicator="pending"')
    expect(html).toContain('aria-label="음성 준비 중"')
    expect(html).not.toContain('mingle-tts-playing-bar')
  })

  it('animates only while audio is playing', () => {
    const html = renderBubble({ playingPlaybackKey: translationKey })
    expect(html).toContain('data-bubble-tts-indicator="playing"')
    expect(html).toContain('mingle-tts-playing-bar')
    expect(html).toContain('aria-label="재생 중"')
  })

  it('lights the matching expanded row too', () => {
    const html = renderBubble({ playingPlaybackKey: translationKey }, 'expanded')
    expect(html.match(/data-bubble-tts-indicator="playing"/g)).toHaveLength(1)
  })

  it('shows nothing for another row key', () => {
    const html = renderBubble({ playingPlaybackKey: buildOriginalBubblePlaybackKey(partnerMessage.id, 'en') })
    expect(html).not.toContain('data-bubble-tts-indicator')
  })

  it('keeps the legacy single-key indicator exactly as before', () => {
    const legacy = renderBubble({ speakingPlaybackKey: translationKey })
    expect(legacy).not.toContain('data-bubble-tts-indicator')
    expect(legacy).toContain('aria-label="재생 중"')
    expect(legacy).toContain('bg-sky-400')
  })
})
