import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatBubble, { type Utterance } from './ChatBubble'
import { buildLatestUtterancePayload } from './LivePhoneDemo'
import {
  EARPHONE_MODE_ENABLED_STORAGE_KEY,
  EARPHONE_MODE_HISTORY_CLOCK_SKEW_MS,
  EARPHONE_MODE_READ_OWN_MESSAGES,
  buildEarphoneModeProgressSignature,
  classifyEarphoneModeUtterance,
  createEarphoneModeWatermark,
  getEarphoneModePreferenceSnapshot,
  isEarphoneModeCandidate,
  keepManualTtsQueueItems,
  readEarphoneModeEnabled,
  resetEarphoneModePreferenceForTests,
  resolveEarphoneModeGate,
  resolveEarphoneModeReadTarget,
  resolveEarphoneModeToggle,
  shouldStopCurrentClipOnEarphoneFallingEdge,
  shouldTreatNativeTtsPostAsStart,
  subscribeEarphoneModePreference,
  writeEarphoneModeEnabled,
  type EarphoneModeDisplayContext,
} from './live-phone-demo.earphone-mode.logic'

const koViewer: EarphoneModeDisplayContext = {
  preferredDisplayLanguage: 'ko',
  preferredDisplayLanguages: ['ko'],
  defaultDisplayLanguage: 'ko',
  languageOrder: ['ko', 'en'],
}

function utterance(overrides: Partial<Utterance> = {}): Utterance {
  return {
    id: 'u-1000-1',
    originalText: 'Hello there',
    originalLang: 'en',
    targetLanguages: ['ko', 'en'],
    translations: { ko: '안녕하세요' },
    translationFinalized: { ko: true },
    createdAtMs: 1_000,
    ...overrides,
  }
}

describe('resolveEarphoneModeGate', () => {
  it.each([
    // supported, enabled, connected -> visible, autoRead, waiting
    [false, false, false, false, false, false],
    [false, true, true, false, false, false],
    [false, true, false, false, false, false],
    [true, false, false, true, false, false],
    [true, false, true, true, false, false],
    [true, true, false, true, false, true],
    [true, true, true, true, true, false],
  ])('supported=%s enabled=%s connected=%s', (supported, enabled, earphonesConnected, controlVisible, autoReadActive, waitingForEarphones) => {
    expect(resolveEarphoneModeGate({ supported, enabled, earphonesConnected })).toEqual({
      controlVisible,
      autoReadActive,
      waitingForEarphones,
    })
  })
})

describe('resolveEarphoneModeToggle', () => {
  it('shows the notice and re-reads the route on every off -> on', () => {
    expect(resolveEarphoneModeToggle(false)).toEqual({ nextEnabled: true, showNotice: true, requestRoute: true })
    // Again after turning it off: the notice is shown every time, not once.
    expect(resolveEarphoneModeToggle(resolveEarphoneModeToggle(true).nextEnabled)).toEqual({
      nextEnabled: true,
      showNotice: true,
      requestRoute: true,
    })
  })

  it('only turns the mode off on on -> off', () => {
    expect(resolveEarphoneModeToggle(true)).toEqual({ nextEnabled: false, showNotice: false, requestRoute: false })
  })
})

describe('earphone mode preference', () => {
  let store: Map<string, string>
  let target: EventTarget & { localStorage?: Storage }

  beforeEach(() => {
    resetEarphoneModePreferenceForTests()
    store = new Map()
    target = new EventTarget() as EventTarget & { localStorage?: Storage }
    target.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    } as Storage
    vi.stubGlobal('window', target)
  })

  afterEach(() => {
    resetEarphoneModePreferenceForTests()
    vi.unstubAllGlobals()
  })

  it('defaults to off per device and persists under its own key', () => {
    expect(getEarphoneModePreferenceSnapshot()).toBe(false)
    writeEarphoneModeEnabled(true)
    expect(store.get(EARPHONE_MODE_ENABLED_STORAGE_KEY)).toBe('true')
    expect(getEarphoneModePreferenceSnapshot()).toBe(true)
    expect(EARPHONE_MODE_ENABLED_STORAGE_KEY).toBe('mingle_earphone_mode_enabled')
  })

  it('notifies every mounted room and follows other tabs', () => {
    const listener = vi.fn()
    subscribeEarphoneModePreference(listener)
    writeEarphoneModeEnabled(true)
    writeEarphoneModeEnabled(true)
    expect(listener).toHaveBeenCalledTimes(1)

    store.set(EARPHONE_MODE_ENABLED_STORAGE_KEY, 'false')
    const storageEvent = new Event('storage') as Event & { key: string }
    storageEvent.key = EARPHONE_MODE_ENABLED_STORAGE_KEY
    target.dispatchEvent(storageEvent)
    expect(getEarphoneModePreferenceSnapshot()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('reads a broken storage as off', () => {
    expect(readEarphoneModeEnabled({
      getItem: () => { throw new Error('denied') },
      setItem: () => {},
    })).toBe(false)
  })
})

describe('watermark', () => {
  const armedAtMs = 100_000
  const watermark = createEarphoneModeWatermark({
    committed: [{ id: 'old-1' }, { id: 'old-2' }],
    drafts: [{ id: 'speaking-now' }, { id: 'old-2' }],
    nowMs: armedAtMs,
  })

  it('never reads a message committed at the rising edge', () => {
    expect(isEarphoneModeCandidate(watermark, { id: 'old-1', createdAtMs: armedAtMs + 5_000 })).toBe(false)
  })

  it('reads a draft that was still being spoken at the edge once it completes', () => {
    expect(watermark.inFlightIds.has('speaking-now')).toBe(true)
    expect(watermark.inFlightIds.has('old-2')).toBe(false)
    expect(isEarphoneModeCandidate(watermark, { id: 'speaking-now', createdAtMs: armedAtMs - 60_000 })).toBe(true)
  })

  it('reads messages that start after the edge', () => {
    expect(isEarphoneModeCandidate(watermark, { id: 'new', createdAtMs: armedAtMs + 1 })).toBe(true)
    // Counterpart rows are ordered by the server-reserved start.
    expect(isEarphoneModeCandidate(watermark, {
      id: 'partner',
      createdAtMs: 1,
      serverCreatedAtMs: armedAtMs + 2_000,
    })).toBe(true)
  })

  it('treats older pages and recovered history first seen after the edge as existing', () => {
    expect(isEarphoneModeCandidate(watermark, {
      id: 'older-page',
      createdAtMs: armedAtMs - EARPHONE_MODE_HISTORY_CLOCK_SKEW_MS - 1,
    })).toBe(false)
    // Within the clock-skew allowance a late first sighting still counts.
    expect(isEarphoneModeCandidate(watermark, {
      id: 'skewed',
      serverCreatedAtMs: armedAtMs - EARPHONE_MODE_HISTORY_CLOCK_SKEW_MS,
    })).toBe(true)
  })
})

describe('resolveEarphoneModeReadTarget (manual-tap parity)', () => {
  it('reads a counterpart message in the viewer language the collapsed bubble shows', () => {
    const message = utterance({ speakerUserId: 'partner' })
    const target = resolveEarphoneModeReadTarget(message, koViewer)
    expect(target).toEqual({
      playbackKey: 'translation:u-1000-1:ko',
      utteranceId: 'u-1000-1',
      language: 'ko',
      kind: 'translation',
      text: '안녕하세요',
    })
    const preview = buildLatestUtterancePayload(message, 'ko', ['ko'], 'ko', ['ko', 'en'])
    expect(preview?.preview).toBe(target?.text)
  })

  it('reads an own message as its original text and language, like tapping the original row', () => {
    const own = utterance({
      id: 'u-2000-1',
      originalText: '저는 괜찮아요',
      originalLang: 'ko',
      translations: { en: "I'm fine" },
      translationFinalized: { en: true },
      speakerUserId: 'viewer',
    })
    expect(resolveEarphoneModeReadTarget(own, koViewer)).toEqual({
      playbackKey: 'original:u-2000-1:ko',
      utteranceId: 'u-2000-1',
      language: 'ko',
      kind: 'original',
      text: '저는 괜찮아요',
    })
  })

  it('waits while the shown translation is still interim or missing', () => {
    expect(resolveEarphoneModeReadTarget(utterance({ translationFinalized: { ko: false } }), koViewer)).toBeNull()
    expect(resolveEarphoneModeReadTarget(utterance({ translations: {}, translationFinalized: {} }), koViewer)).toBeNull()
  })

  it('uses the collapsed bubble language key for Chinese variants', () => {
    const target = resolveEarphoneModeReadTarget(utterance({
      targetLanguages: ['zh-TW', 'en'],
      translations: { 'zh-TW': '你好' },
      translationFinalized: { 'zh-TW': true },
    }), {
      preferredDisplayLanguages: ['zh-TW'],
      defaultDisplayLanguage: 'zh-TW',
      languageOrder: ['zh-TW', 'en'],
    })
    expect(target?.playbackKey).toBe('translation:u-1000-1:zh-tw')
    expect(target?.language).toBe('zh-TW')
  })

  it('lights the same row the bubble renders (seam with ChatBubble)', () => {
    const message = utterance({ speakerUserId: 'partner' })
    const target = resolveEarphoneModeReadTarget(message, koViewer)!
    const html = renderToStaticMarkup(createElement(ChatBubble, {
      utterance: message,
      uiLocale: 'ko',
      preferredDisplayLanguage: 'ko',
      preferredDisplayLanguages: ['ko'],
      defaultDisplayLanguage: 'ko',
      languageOrder: ['ko', 'en'],
      viewerUserId: 'viewer',
      bubbleDisplayMode: 'collapsed',
      playingPlaybackKey: target.playbackKey,
    }))
    expect(html).toContain('data-bubble-tts-indicator="playing"')

    const ownMessage = utterance({ id: 'own', originalLang: 'ko', originalText: '네', translations: {}, translationFinalized: {}, speakerUserId: 'viewer' })
    const ownTarget = resolveEarphoneModeReadTarget(ownMessage, koViewer)!
    const ownHtml = renderToStaticMarkup(createElement(ChatBubble, {
      utterance: ownMessage,
      uiLocale: 'ko',
      preferredDisplayLanguages: ['ko'],
      defaultDisplayLanguage: 'ko',
      languageOrder: ['ko', 'en'],
      viewerUserId: 'viewer',
      bubbleDisplayMode: 'collapsed',
      pendingPlaybackKeys: [ownTarget.playbackKey],
    }))
    expect(ownHtml).toContain('data-bubble-tts-indicator="pending"')
  })
})

describe('classifyEarphoneModeUtterance', () => {
  const classify = (message: Utterance, overrides: Partial<Parameters<typeof classifyEarphoneModeUtterance>[0]> = {}) => (
    classifyEarphoneModeUtterance({ utterance: message, isDraft: false, display: koViewer, viewerUserId: 'viewer', ...overrides })
  )

  it('is incomplete while spoken or while the translation is settling', () => {
    expect(classify(utterance(), { isDraft: true })).toEqual({ state: 'incomplete' })
    expect(classify(utterance({ translationStatus: 'pending' }))).toEqual({ state: 'incomplete' })
    expect(classify(utterance({ translationStatus: 'retrying' }))).toEqual({ state: 'incomplete' })
  })

  it('is ready once committed, settled and readable', () => {
    expect(classify(utterance())).toMatchObject({ state: 'ready', target: { playbackKey: 'translation:u-1000-1:ko' } })
  })

  it('skips photos and empty messages', () => {
    expect(classify(utterance({ image: { conversationId: 'room-1', messageId: 'image-1', width: 10, height: 10 } }))).toEqual({
      state: 'unreadable',
      reason: 'image',
    })
    expect(classify(utterance({ originalText: '   ' }))).toEqual({ state: 'unreadable', reason: 'empty' })
  })

  it('reads own messages behind one switch', () => {
    expect(EARPHONE_MODE_READ_OWN_MESSAGES).toBe(true)
    const own = utterance({ originalLang: 'ko', originalText: '네', speakerUserId: 'viewer' })
    expect(classify(own)).toMatchObject({ state: 'ready' })
    expect(classify(own, { readOwnMessages: false })).toEqual({ state: 'unreadable', reason: 'own_message' })
    // Solo rooms carry no account ids: every row is this device's own.
    expect(classify(utterance({ speakerUserId: undefined }), { readOwnMessages: false })).toEqual({ state: 'unreadable', reason: 'own_message' })
    expect(classify(utterance({ speakerUserId: 'partner' }), { readOwnMessages: false })).toMatchObject({ state: 'ready' })
  })
})

describe('progress signature', () => {
  it('changes with anything visible on the row and nothing else', () => {
    const base = utterance()
    const signature = buildEarphoneModeProgressSignature(base, false)
    expect(buildEarphoneModeProgressSignature({ ...base }, false)).toBe(signature)
    expect(buildEarphoneModeProgressSignature({ ...base, originalText: 'Hello there!' }, false)).not.toBe(signature)
    expect(buildEarphoneModeProgressSignature({ ...base, translationStatus: 'retrying' }, false)).not.toBe(signature)
    expect(buildEarphoneModeProgressSignature(base, true)).not.toBe(signature)
  })
})

describe('falling edge and native start helpers', () => {
  it('drops queued auto items and keeps manual ones', () => {
    expect(keepManualTtsQueueItems([
      { id: 'a', mode: 'auto' as const },
      { id: 'm', mode: 'manual' as const },
      { id: 'b', mode: 'auto' as const },
    ])).toEqual([{ id: 'm', mode: 'manual' }])
  })

  it('stops only an auto clip', () => {
    expect(shouldStopCurrentClipOnEarphoneFallingEdge({ mode: 'auto' })).toBe(true)
    expect(shouldStopCurrentClipOnEarphoneFallingEdge({ mode: 'manual' })).toBe(false)
    expect(shouldStopCurrentClipOnEarphoneFallingEdge(null)).toBe(false)
  })

  it('treats the post as the start on shells without tts_started', () => {
    expect(shouldTreatNativeTtsPostAsStart(false)).toBe(true)
    expect(shouldTreatNativeTtsPostAsStart(true)).toBe(false)
  })
})
