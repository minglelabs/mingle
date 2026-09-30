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
  isEarphoneModeUtteranceSettled,
  keepManualTtsQueueItems,
  readEarphoneModeEnabled,
  resetEarphoneModePreferenceForTests,
  resolveEarphoneModeDefaultReadLanguage,
  resolveEarphoneModeGate,
  resolveEarphoneModeReadLanguage,
  resolveEarphoneModeReadTarget,
  resolveEarphoneModeToggle,
  shouldStopCurrentClipOnEarphoneFallingEdge,
  shouldTreatNativeTtsPostAsStart,
  subscribeEarphoneModePreference,
  writeEarphoneModeEnabled,
  type EarphoneModeDisplayContext,
  type EarphoneModeReadContext,
  type EarphoneModeReadLanguagePick,
} from './live-phone-demo.earphone-mode.logic'

const koViewer: EarphoneModeDisplayContext = {
  preferredDisplayLanguage: 'ko',
  preferredDisplayLanguages: ['ko'],
  defaultDisplayLanguage: 'ko',
  languageOrder: ['ko', 'en'],
}

const koRead: EarphoneModeReadContext = { readLanguage: 'ko', languageOrder: ['ko', 'en'] }

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

// The language a collapsed bubble shows, read from its markup.
function collapsedBubbleLanguage(message: Utterance, display: EarphoneModeDisplayContext): string | null {
  const html = renderToStaticMarkup(createElement(ChatBubble, {
    utterance: message,
    uiLocale: 'en',
    preferredDisplayLanguage: display.preferredDisplayLanguage,
    preferredDisplayLanguages: display.preferredDisplayLanguages,
    defaultDisplayLanguage: display.defaultDisplayLanguage,
    languageOrder: display.languageOrder,
    viewerUserId: 'viewer',
    bubbleDisplayMode: 'collapsed',
  }))
  return html.match(/data-translation-bubble-meta="[^"]*" class="sr-only">([^<]+)</)?.[1] ?? null
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

  it('keeps a notice pick for one session only and never stores it', () => {
    const display: EarphoneModeDisplayContext = { ...koViewer, languageOrder: ['ko', 'en', 'ja'] }
    // The room's reset, exactly as LivePhoneDemo registers it.
    let pick: EarphoneModeReadLanguagePick | null = null
    subscribeEarphoneModePreference(() => { pick = null })
    const readLanguage = () => resolveEarphoneModeReadLanguage({ pick, conversationKey: 'room-1', display })

    writeEarphoneModeEnabled(true)
    expect(readLanguage()).toBe('ko')
    pick = { conversationKey: 'room-1', language: 'ja' }
    expect(readLanguage()).toBe('ja')
    // Off and on again: the next session starts from the room display language.
    writeEarphoneModeEnabled(false)
    writeEarphoneModeEnabled(true)
    expect(readLanguage()).toBe('ko')

    // A toggle from another tab ends the session too.
    pick = { conversationKey: 'room-1', language: 'en' }
    store.set(EARPHONE_MODE_ENABLED_STORAGE_KEY, 'false')
    const storageEvent = new Event('storage') as Event & { key: string }
    storageEvent.key = EARPHONE_MODE_ENABLED_STORAGE_KEY
    target.dispatchEvent(storageEvent)
    expect(readLanguage()).toBe('ko')

    // Only the on/off toggle was ever written.
    expect([...store.keys()]).toEqual([EARPHONE_MODE_ENABLED_STORAGE_KEY])
  })
})

describe('read language (one per earphone-mode session)', () => {
  it('defaults to the room display language: member/solo default, then preferred, then the first room language', () => {
    expect(resolveEarphoneModeDefaultReadLanguage({
      preferredDisplayLanguages: ['ko'],
      defaultDisplayLanguage: 'en',
      languageOrder: ['ko', 'en'],
    })).toBe('en')
    // A default that is not a room language falls through to the viewer's preferred languages.
    expect(resolveEarphoneModeDefaultReadLanguage({
      preferredDisplayLanguages: ['fr', 'ja'],
      defaultDisplayLanguage: 'de',
      languageOrder: ['ko', 'ja'],
    })).toBe('ja')
    expect(resolveEarphoneModeDefaultReadLanguage({
      preferredDisplayLanguage: 'fr',
      defaultDisplayLanguage: null,
      languageOrder: ['ko', 'en'],
    })).toBe('ko')
    expect(resolveEarphoneModeDefaultReadLanguage({ defaultDisplayLanguage: 'ko', languageOrder: [] })).toBeNull()
  })

  it('returns the room list entry itself, Chinese variants included', () => {
    expect(resolveEarphoneModeDefaultReadLanguage({
      preferredDisplayLanguages: ['ko'],
      defaultDisplayLanguage: 'zh-tw',
      languageOrder: ['ko', 'zh-TW'],
    })).toBe('zh-TW')
  })

  it.each<[string, EarphoneModeDisplayContext]>([
    ['room default', { preferredDisplayLanguages: ['ko'], defaultDisplayLanguage: 'ja', languageOrder: ['ko', 'en', 'ja'] }],
    ['preferred fallback', { preferredDisplayLanguages: ['de', 'en'], defaultDisplayLanguage: null, languageOrder: ['ko', 'en', 'ja'] }],
    ['first room language', { preferredDisplayLanguages: ['de'], defaultDisplayLanguage: null, languageOrder: ['ja', 'ko', 'en'] }],
  ])('matches what a collapsed bubble shows (%s)', (_label, display) => {
    // An original outside the room, translated into every room language.
    const message = utterance({
      originalLang: 'fr',
      originalText: 'Bonjour',
      targetLanguages: [...display.languageOrder],
      translations: { ko: '안녕하세요', en: 'Hello', ja: 'こんにちは' },
      translationFinalized: { ko: true, en: true, ja: true },
    })
    expect(resolveEarphoneModeDefaultReadLanguage(display)).toBe(collapsedBubbleLanguage(message, display))
  })

  it('uses a notice pick only in its own room and only while it is a room language', () => {
    const display: EarphoneModeDisplayContext = { ...koViewer, languageOrder: ['ko', 'en', 'ja'] }
    const pick = { conversationKey: 'room-1', language: 'JA' }
    expect(resolveEarphoneModeReadLanguage({ pick, conversationKey: 'room-1', display })).toBe('ja')
    expect(resolveEarphoneModeReadLanguage({ pick: null, conversationKey: 'room-1', display })).toBe('ko')
    // Another room reads its own default.
    expect(resolveEarphoneModeReadLanguage({ pick, conversationKey: 'room-2', display })).toBe('ko')
    // No longer a room language: back to the default.
    expect(resolveEarphoneModeReadLanguage({
      pick,
      conversationKey: 'room-1',
      display: { ...display, languageOrder: ['ko', 'en'] },
    })).toBe('ko')
  })
})

describe('watermark', () => {
  const armedAtMs = 100_000
  const watermark = createEarphoneModeWatermark({
    committed: [{ id: 'old-1' }, { id: 'old-2' }],
    drafts: [{ id: 'speaking-now' }, { id: 'old-2' }],
    isCommittedSettled: () => true,
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

  it('counts a committed message whose translation is still pending like a draft', () => {
    const pending = utterance({ id: 'pending', translations: {}, translationFinalized: {}, translationStatus: 'pending' })
    const untranslated = utterance({ id: 'untranslated', translations: {}, translationFinalized: {} })
    const streaming = utterance({ id: 'streaming', translationFinalized: { ko: false } })
    const settled = utterance({ id: 'settled' })
    const photo = utterance({ id: 'photo', image: { conversationId: 'room-1', messageId: 'photo', width: 10, height: 10 } })
    const edge = createEarphoneModeWatermark({
      committed: [pending, untranslated, streaming, settled, photo],
      drafts: [{ id: 'pending' }, { id: 'settled' }],
      isCommittedSettled: (row) => isEarphoneModeUtteranceSettled({ utterance: row, read: koRead, viewerUserId: 'viewer' }),
      nowMs: armedAtMs,
    })
    expect([...edge.existingIds].sort()).toEqual(['photo', 'settled'])
    expect([...edge.inFlightIds].sort()).toEqual(['pending', 'streaming', 'untranslated'])
    // Counted even though it started long before the edge.
    expect(isEarphoneModeCandidate(edge, { id: 'pending', createdAtMs: armedAtMs - 60_000 })).toBe(true)
    expect(isEarphoneModeCandidate(edge, { id: 'settled', createdAtMs: armedAtMs + 1 })).toBe(false)
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

describe('resolveEarphoneModeReadTarget (the translation into L only)', () => {
  it('reads the L translation with the text, language and key of a manual tap on that row', () => {
    const message = utterance({ speakerUserId: 'partner' })
    const target = resolveEarphoneModeReadTarget(message, koRead)
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

  it('reads L even when the collapsed bubble shows another language', () => {
    const display: EarphoneModeDisplayContext = { ...koViewer, languageOrder: ['ko', 'en', 'ja'] }
    const message = utterance({
      targetLanguages: ['ko', 'ja'],
      translations: { ko: '안녕하세요', ja: 'こんにちは' },
      translationFinalized: { ko: true, ja: true },
    })
    expect(collapsedBubbleLanguage(message, display)).toBe('ko')
    expect(resolveEarphoneModeReadTarget(message, { readLanguage: 'ja', languageOrder: display.languageOrder })).toMatchObject({
      playbackKey: 'translation:u-1000-1:ja',
      language: 'ja',
      kind: 'translation',
      text: 'こんにちは',
    })
  })

  it('never reads a message whose original is in L, own or partner', () => {
    const own = utterance({
      id: 'u-2000-1',
      originalText: '저는 괜찮아요',
      originalLang: 'ko',
      translations: { en: "I'm fine" },
      translationFinalized: { en: true },
      speakerUserId: 'viewer',
    })
    expect(resolveEarphoneModeReadTarget(own, koRead)).toBeNull()
    expect(resolveEarphoneModeReadTarget({ ...own, speakerUserId: 'partner' }, koRead)).toBeNull()
    // The same message is read when L is one of its translations.
    expect(resolveEarphoneModeReadTarget(own, { readLanguage: 'en', languageOrder: ['ko', 'en'] })).toMatchObject({
      playbackKey: 'translation:u-2000-1:en',
      language: 'en',
      text: "I'm fine",
    })
  })

  it('waits while the L translation is still interim or missing', () => {
    expect(resolveEarphoneModeReadTarget(utterance({ translationFinalized: { ko: false } }), koRead)).toBeNull()
    expect(resolveEarphoneModeReadTarget(utterance({ translations: {}, translationFinalized: {} }), koRead)).toBeNull()
  })

  it('keys Chinese variants the way the bubble does', () => {
    const target = resolveEarphoneModeReadTarget(utterance({
      targetLanguages: ['zh-TW', 'en'],
      translations: { 'zh-TW': '你好' },
      translationFinalized: { 'zh-TW': true },
    }), { readLanguage: 'zh-TW', languageOrder: ['zh-TW', 'en'] })
    expect(target?.playbackKey).toBe('translation:u-1000-1:zh-tw')
    expect(target?.language).toBe('zh-TW')
  })

  it('lights the same row the bubble renders (seam with ChatBubble)', () => {
    const message = utterance({ speakerUserId: 'partner' })
    const target = resolveEarphoneModeReadTarget(message, koRead)!
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

    const ownMessage = utterance({ id: 'own', speakerUserId: 'viewer' })
    const ownTarget = resolveEarphoneModeReadTarget(ownMessage, koRead)!
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

    // An L other than the collapsed language lights its own expanded row.
    const multi = utterance({
      id: 'multi',
      speakerUserId: 'partner',
      targetLanguages: ['ko', 'ja'],
      translations: { ko: '안녕하세요', ja: 'こんにちは' },
      translationFinalized: { ko: true, ja: true },
    })
    const jaTarget = resolveEarphoneModeReadTarget(multi, { readLanguage: 'ja', languageOrder: ['ko', 'en', 'ja'] })!
    const expandedHtml = renderToStaticMarkup(createElement(ChatBubble, {
      utterance: multi,
      uiLocale: 'ko',
      preferredDisplayLanguages: ['ko'],
      defaultDisplayLanguage: 'ko',
      languageOrder: ['ko', 'en', 'ja'],
      viewerUserId: 'viewer',
      bubbleDisplayMode: 'expanded',
      playingPlaybackKey: jaTarget.playbackKey,
    }))
    const rows = expandedHtml.split('data-expanded-bubble-text').slice(1)
    expect(rows.find((row) => row.includes('こんにちは'))).toContain('data-bubble-tts-indicator="playing"')
    expect(rows.find((row) => row.includes('안녕하세요'))).not.toContain('data-bubble-tts-indicator')
  })
})

describe('classifyEarphoneModeUtterance', () => {
  const classify = (message: Utterance, overrides: Partial<Parameters<typeof classifyEarphoneModeUtterance>[0]> = {}) => (
    classifyEarphoneModeUtterance({ utterance: message, isDraft: false, read: koRead, viewerUserId: 'viewer', ...overrides })
  )

  it('is incomplete while spoken or while the translation is settling', () => {
    expect(classify(utterance(), { isDraft: true })).toEqual({ state: 'incomplete' })
    expect(classify(utterance({ translationStatus: 'pending' }))).toEqual({ state: 'incomplete' })
    expect(classify(utterance({ translationStatus: 'retrying' }))).toEqual({ state: 'incomplete' })
  })

  it('is ready once committed, settled and translated into L', () => {
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
    const own = utterance({ speakerUserId: 'viewer' })
    expect(classify(own)).toMatchObject({ state: 'ready' })
    expect(classify(own, { readOwnMessages: false })).toEqual({ state: 'unreadable', reason: 'own_message' })
    // Solo rooms carry no account ids: every row is this device's own.
    expect(classify(utterance({ speakerUserId: undefined }), { readOwnMessages: false })).toEqual({ state: 'unreadable', reason: 'own_message' })
    expect(classify(utterance({ speakerUserId: 'partner' }), { readOwnMessages: false })).toMatchObject({ state: 'ready' })
  })

  it('skips a message spoken in L once its translation has landed', () => {
    const spokenInKorean = utterance({
      originalLang: 'ko',
      originalText: '저는 괜찮아요',
      translations: { en: "I'm fine" },
      translationFinalized: { en: true },
    })
    // Own messages spoken in L, and partner ones.
    expect(classify({ ...spokenInKorean, speakerUserId: 'viewer' })).toEqual({ state: 'unreadable', reason: 'source_language' })
    expect(classify({ ...spokenInKorean, speakerUserId: 'partner' })).toEqual({ state: 'unreadable', reason: 'source_language' })
    // Own message still being translated: waits like any other.
    expect(classify({ ...spokenInKorean, speakerUserId: 'viewer', translationStatus: 'pending' })).toEqual({ state: 'incomplete' })
    // A source-only snapshot waits: the translation can still re-detect the source.
    expect(classify({ ...spokenInKorean, translations: {}, translationFinalized: {} })).toEqual({ state: 'incomplete' })
    // Nothing to translate into: decided at once.
    expect(classify({ ...spokenInKorean, targetLanguages: [], translations: {}, translationFinalized: {} })).toEqual({
      state: 'unreadable',
      reason: 'source_language',
    })
  })

  it('skips a message whose translations finished without L', () => {
    const read: EarphoneModeReadContext = { readLanguage: 'ko', languageOrder: ['ko', 'en', 'ja'] }
    // Targeted L, but the landed batch has no L translation.
    expect(classify(utterance({
      targetLanguages: ['ko', 'ja'],
      translations: { ja: 'こんにちは' },
      translationFinalized: { ja: true },
    }), { read })).toEqual({ state: 'unreadable', reason: 'missing_language' })
    // L was never a target (sent before L joined the room).
    expect(classify(utterance({
      targetLanguages: ['ja'],
      translations: { ja: 'こんにちは' },
      translationFinalized: { ja: true },
    }), { read })).toEqual({ state: 'unreadable', reason: 'missing_language' })
    // No translation targets at all.
    expect(classify(utterance({ targetLanguages: [], translations: {}, translationFinalized: {} }), { read })).toEqual({
      state: 'unreadable',
      reason: 'missing_language',
    })
    // A room without languages has no L.
    expect(classify(utterance(), { read: { readLanguage: null, languageOrder: [] } })).toEqual({
      state: 'unreadable',
      reason: 'missing_language',
    })
  })

  it('waits while the L translation is still to come', () => {
    const read: EarphoneModeReadContext = { readLanguage: 'ko', languageOrder: ['ko', 'en', 'ja'] }
    const base = { targetLanguages: ['ko', 'ja'] }
    // Source only.
    expect(classify(utterance({ ...base, translations: {}, translationFinalized: {} }), { read })).toEqual({ state: 'incomplete' })
    // L streaming.
    expect(classify(utterance({
      ...base,
      translations: { ko: '안녕', ja: 'こんにちは' },
      translationFinalized: { ko: false, ja: true },
    }), { read })).toEqual({ state: 'incomplete' })
    // Another language still streaming while L has nothing yet.
    expect(classify(utterance({
      ...base,
      translations: { ja: 'こんに' },
      translationFinalized: { ja: false },
    }), { read })).toEqual({ state: 'incomplete' })
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
