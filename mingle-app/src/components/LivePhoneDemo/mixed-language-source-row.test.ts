import { describe, expect, it } from 'vitest'
import { buildTargetLanguagesForUtterance, type Utterance } from './ChatBubble'
import { RemotePreviews } from './conversation-live'
import {
  appendFinalizedUtteranceToStoreState,
  applyTranslationToUtteranceStoreState,
  buildFinalizedUtterancePayload,
  buildLiveUtterance,
  createUtteranceStoreState,
  mergeDisplayUtterances,
  mergeServerHydrationUtteranceWithRoomLanguages,
  normalizeConversationHydrationUtterances,
  type UtteranceStoreState,
} from './use-realtime-stt'

// A mixed-language (or foreign-script) utterance keeps a same-language row: a
// fully same-language rendering of what was said (a `ko` row for a `ko`
// original). The row is only rendered while the utterance carries the flags
// the finalize translation returned, so they must survive every path that
// runs after finalization: the server copy of the same message (push, poll,
// the committed realtime frame, a room reload) and other members' clients.

const ROOM_LANGUAGES = ['ko', 'ja', 'en']
const UTTERANCE_ID = 'u-1790000000000-1'
const CREATED_AT_MS = 1790000000000

type Scenario = {
  name: string
  text: string
  // What speech recognition tagged the live turn with.
  sttLanguage: string
  partialTranslations: Record<string, string>
  // The finalize translation (translate/finalize with source redetection).
  result: {
    sourceLanguage: string
    sourceLanguagesMixed: boolean
    sourceTextHasForeignScript: boolean
    translations: Record<string, string>
  }
  flag: 'sourceLanguagesMixed' | 'sourceTextHasForeignScript'
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Korean mixed with Japanese',
    text: 'イザナと 일본어로 잘 인식되는 소니옥스야',
    sttLanguage: 'ja',
    partialTranslations: {
      ko: '이자나랑 일본어로 잘 인식되는 소니옥스야',
      en: 'Soniox recognizes Izana well in Japanese.',
    },
    result: {
      sourceLanguage: 'ko',
      sourceLanguagesMixed: true,
      sourceTextHasForeignScript: false,
      translations: {
        ko: '이자나랑 일본어로 잘 인식되는 소니옥스야',
        ja: 'イザナと日本語でよく認識されるソニオックスだよ',
        en: 'Soniox recognizes Izana well in Japanese.',
      },
    },
    flag: 'sourceLanguagesMixed',
  },
  {
    name: 'Korean written with Chinese characters',
    text: '我爱你 라고 말했어',
    sttLanguage: 'zh',
    partialTranslations: {
      ko: '사랑해 라고 말했어',
      en: 'I said "I love you".',
    },
    result: {
      sourceLanguage: 'ko',
      sourceLanguagesMixed: false,
      sourceTextHasForeignScript: true,
      translations: {
        ko: '사랑해 라고 말했어',
        ja: '愛してると言ったよ',
        en: 'I said "I love you".',
      },
    },
    flag: 'sourceTextHasForeignScript',
  },
]

function visibleRows(utterance: Utterance | undefined): string[] {
  if (!utterance) return []
  return buildTargetLanguagesForUtterance(utterance, ROOM_LANGUAGES)
}

function renderedUtterance(store: UtteranceStoreState): Utterance | undefined {
  return mergeDisplayUtterances({ utterances: store.utterances, liveUtterances: [] })
    .find((utterance) => utterance.id === UTTERANCE_ID)
}

// Speech -> local finalize -> finalize translation, in the order the hook runs
// them (buildLiveUtterance while speaking, then the durable finalization
// result applied with applyTranslationToUtteranceStoreState).
function finalizeLocally(scenario: Scenario): { draft: Utterance, store: UtteranceStoreState } {
  const draft = buildLiveUtterance({
    pendingTurn: {
      utteranceId: UTTERANCE_ID,
      createdAtMs: CREATED_AT_MS,
      speaker: 'speaker-1',
      speakerAvatarSeed: 'seed-1',
      speakerAvatarIndex: 0,
      language: scenario.sttLanguage,
    },
    partialTranscript: scenario.text,
    partialLang: scenario.sttLanguage,
    partialTranslations: scenario.partialTranslations,
    languages: ROOM_LANGUAGES,
  })
  if (!draft) throw new Error('missing live draft')

  const payload = buildFinalizedUtterancePayload({
    speaker: 'speaker-1',
    rawText: scenario.text,
    rawLanguage: scenario.sttLanguage,
    languages: ROOM_LANGUAGES,
    partialTranslations: draft.translations,
    utteranceSerial: 1,
    utteranceId: UTTERANCE_ID,
    createdAtMs: CREATED_AT_MS,
  })
  if (!payload) throw new Error('missing finalized payload')

  const appended = appendFinalizedUtteranceToStoreState(createUtteranceStoreState([]), payload.utterance)
  const store = applyTranslationToUtteranceStoreState({
    store: appended,
    utteranceId: UTTERANCE_ID,
    translations: scenario.result.translations,
    priority: { kind: 'final', seq: 1 },
    markFinalized: true,
    detectedSourceLanguage: scenario.result.sourceLanguage,
    sourceLanguagesMixed: scenario.result.sourceLanguagesMixed,
    sourceTextHasForeignScript: scenario.result.sourceTextHasForeignScript,
    selectedLanguages: ROOM_LANGUAGES,
    sourceText: scenario.text,
  })
  return { draft, store }
}

// The message as GET /conversations/:id (and the committed realtime frame)
// returns it once the translation update is stored.
function serverCopy(scenario: Scenario, options: { flags: boolean }): Record<string, unknown> {
  return {
    id: UTTERANCE_ID,
    originalText: scenario.text,
    originalLang: scenario.result.sourceLanguage,
    targetLanguages: ['ko', 'ja', 'en'],
    translations: scenario.result.translations,
    translationFinalized: Object.fromEntries(Object.keys(scenario.result.translations).map((language) => [language, true])),
    createdAtMs: CREATED_AT_MS + 2_500,
    speaker: 'speaker-1',
    speakerAvatarSeed: null,
    speakerAvatarIndex: null,
    speakerName: null,
    speakerUserId: null,
    speakerImage: null,
    ...(options.flags ? { [scenario.flag]: true } : {}),
  }
}

function mergeServerCopy(store: UtteranceStoreState, rawServerUtterance: Record<string, unknown>): UtteranceStoreState {
  const [incoming] = normalizeConversationHydrationUtterances([rawServerUtterance], ROOM_LANGUAGES)
  return mergeServerHydrationUtteranceWithRoomLanguages(store, incoming, ROOM_LANGUAGES)
}

describe.each(SCENARIOS)('same-language row of $name', (scenario) => {
  it('is rendered while speaking and after the finalize translation', () => {
    const { draft, store } = finalizeLocally(scenario)

    expect(visibleRows(draft)).toContain('ko')
    expect(renderedUtterance(store)?.originalLang).toBe('ko')
    expect(renderedUtterance(store)?.[scenario.flag]).toBe(true)
    expect(visibleRows(renderedUtterance(store))).toEqual(['ko', 'ja', 'en'])
  })

  it('survives the push/poll/committed server copy of the same message', () => {
    const { store } = finalizeLocally(scenario)

    // A server that stores the flags, and one that does not (a copy read
    // before the translation update landed, or a row from an older server).
    for (const flags of [true, false]) {
      const merged = mergeServerCopy(store, serverCopy(scenario, { flags }))
      expect(renderedUtterance(merged)?.[scenario.flag]).toBe(true)
      expect(visibleRows(renderedUtterance(merged))).toEqual(['ko', 'ja', 'en'])
    }
  })

  it('survives a source-only server copy that raced ahead of the translation update', () => {
    const { store } = finalizeLocally(scenario)
    const sourceOnly = {
      ...serverCopy(scenario, { flags: false }),
      originalLang: scenario.sttLanguage,
      targetLanguages: ['ko', 'en'],
      translations: {},
      translationFinalized: {},
    }

    const merged = mergeServerCopy(store, sourceOnly)
    expect(renderedUtterance(merged)?.[scenario.flag]).toBe(true)
    expect(visibleRows(renderedUtterance(merged))).toContain('ko')
  })

  it('is rendered from the server copy alone (room reload, another device, another member)', () => {
    const reloaded = mergeServerCopy(createUtteranceStoreState([]), serverCopy(scenario, { flags: true }))
    expect(visibleRows(renderedUtterance(reloaded))).toEqual(['ko', 'ja', 'en'])

    // Another member: the speaker's final preview carries no flags, and the
    // committed frame replaces it.
    const previews = new RemotePreviews()
    previews.accept({
      type: 'utterance_preview',
      sessionKey: 'session-1',
      revision: 1,
      expiresAt: Date.now() + 60_000,
      final: true,
      utterance: {
        id: UTTERANCE_ID,
        originalText: scenario.text,
        originalLang: scenario.sttLanguage,
        targetLanguages: ['ko', 'en'],
        translations: scenario.partialTranslations,
        speakerUserId: 'user-speaker',
        createdAtMs: CREATED_AT_MS,
      },
    })
    const [committed] = normalizeConversationHydrationUtterances([{
      ...serverCopy(scenario, { flags: true }),
      speakerUserId: 'user-speaker',
      serverCreatedAtMs: CREATED_AT_MS,
      serverMessageId: 'message-1',
    }], ROOM_LANGUAGES)
    const otherMember = mergeServerHydrationUtteranceWithRoomLanguages(
      createUtteranceStoreState([]), previews.mergeCommitted(committed), ROOM_LANGUAGES,
    )
    // Row order follows the preview's targets first; only presence matters here.
    const otherMemberRows = visibleRows(renderedUtterance(otherMember))
    expect(otherMemberRows).toHaveLength(3)
    expect(otherMemberRows).toEqual(expect.arrayContaining(['ko', 'ja', 'en']))
  })
})

describe('same-language row of a single-language utterance', () => {
  it('stays hidden when the server copy has no flags', () => {
    // The finalize request asks for the source language too, so every
    // message stores a same-language copy of its original. Without a flag it
    // is only an echo and must not become a row.
    const reloaded = mergeServerCopy(createUtteranceStoreState([]), {
      id: UTTERANCE_ID,
      originalText: '안녕하세요',
      originalLang: 'ko',
      targetLanguages: ['ko', 'ja', 'en'],
      translations: { ko: '안녕하세요', ja: 'こんにちは', en: 'Hello' },
      translationFinalized: { ko: true, ja: true, en: true },
      createdAtMs: CREATED_AT_MS,
    })
    expect(visibleRows(renderedUtterance(reloaded))).toEqual(['ja', 'en'])
  })
})
