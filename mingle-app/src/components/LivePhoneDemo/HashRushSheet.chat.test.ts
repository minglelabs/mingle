import { describe, expect, it } from 'vitest'
import type { Utterance } from './ChatBubble'
import type { EarphoneModeDisplayContext } from './live-phone-demo.earphone-mode.logic'
import {
  HASH_RUSH_CHAT_SOURCE_WINDOW,
  buildHashRushChatEntries,
  resolveHashRushChatSenderId,
  resolveHashRushChatText,
} from './HashRushSheet.chat'

const KOREAN_VIEWER: EarphoneModeDisplayContext = {
  preferredDisplayLanguage: 'ko',
  preferredDisplayLanguages: ['ko'],
  defaultDisplayLanguage: 'ko',
  languageOrder: ['ko', 'en'],
}

function message(id: string, overrides: Partial<Utterance> = {}): Utterance {
  return {
    id,
    originalText: 'Hello there',
    originalLang: 'en',
    targetLanguages: ['ko'],
    translations: {},
    speakerUserId: 'user-mia',
    createdAtMs: 1_800_000_000_000,
    ...overrides,
  }
}

function build(utterances: Utterance[], overrides: Partial<Parameters<typeof buildHashRushChatEntries>[0]> = {}) {
  return buildHashRushChatEntries({
    utterances,
    draftIds: new Set(),
    display: KOREAN_VIEWER,
    viewerUserId: 'user-nam',
    isSharedRoom: true,
    ...overrides,
  })
}

describe('hash rush room talk: what the viewer reads', () => {
  it('sends the translation into the viewer language once it has landed', () => {
    const translated = message('m1', { translations: { ko: '안녕하세요' }, translationFinalized: { ko: true } })
    expect(resolveHashRushChatText(translated, KOREAN_VIEWER.languageOrder, 'ko')).toBe('안녕하세요')
  })

  it('sends the original while the translation is missing or still streaming', () => {
    expect(resolveHashRushChatText(message('m1'), KOREAN_VIEWER.languageOrder, 'ko')).toBe('Hello there')
    const streaming = message('m2', { translations: { ko: '안녕' }, translationFinalized: { ko: false } })
    expect(resolveHashRushChatText(streaming, KOREAN_VIEWER.languageOrder, 'ko')).toBe('Hello there')
  })

  it('sends the original when it is already in the viewer language', () => {
    const korean = message('m1', { originalText: '한 판 더?', originalLang: 'ko', targetLanguages: ['en'], translations: { en: 'One more?' }, translationFinalized: { en: true } })
    expect(resolveHashRushChatText(korean, KOREAN_VIEWER.languageOrder, 'ko')).toBe('한 판 더?')
    // A viewer reading English gets the English.
    expect(resolveHashRushChatText(korean, ['en', 'ko'], 'en')).toBe('One more?')
  })

  it('sends the original when the room has no language for the viewer', () => {
    expect(resolveHashRushChatText(message('m1', { translations: { ko: '안녕' } }), [], null)).toBe('Hello there')
  })
})

describe('hash rush room talk: who said it', () => {
  it('uses the sender account, the id on their ticket', () => {
    expect(resolveHashRushChatSenderId({ speakerUserId: 'user-mia' }, 'user-nam', true)).toBe('user-mia')
    expect(resolveHashRushChatSenderId({ speakerUserId: ' user-mia ' }, 'user-nam', true)).toBe('user-mia')
  })

  it('takes a row without an account as the viewer only when it is theirs', () => {
    expect(resolveHashRushChatSenderId({ speakerUserId: null, sentByViewer: true }, 'user-nam', true)).toBe('user-nam')
    expect(resolveHashRushChatSenderId({ speakerUserId: null, sentByViewer: false }, 'user-nam', false)).toBeNull()
    expect(resolveHashRushChatSenderId({ speakerUserId: null }, 'user-nam', true)).toBeNull()
    // A room of one: every row is the viewer's.
    expect(resolveHashRushChatSenderId({ speakerUserId: null }, 'user-nam', false)).toBe('user-nam')
    expect(resolveHashRushChatSenderId({}, null, false)).toBeNull()
  })
})

describe('hash rush room talk: entries', () => {
  it('builds one entry per message with sender, words and place', () => {
    const entries = build([
      message('m1', { translations: { ko: '안녕하세요' }, translationFinalized: { ko: true }, serverCreatedAtMs: 1_800_000_000_500 }),
      message('m2', { originalText: 'ㄱㄱ', originalLang: 'ko', targetLanguages: ['en'], speakerUserId: 'user-nam', createdAtMs: 1_800_000_001_000 }),
    ])
    expect(entries).toEqual([
      { id: 'm1', userId: 'user-mia', text: '안녕하세요', orderTimeMs: 1_800_000_000_500, pending: false },
      { id: 'm2', userId: 'user-nam', text: 'ㄱㄱ', orderTimeMs: 1_800_000_001_000, pending: false },
    ])
  })

  it('marks messages still being spoken, without words yet', () => {
    const entries = build([message('live', { originalText: 'Hel' })], { draftIds: new Set(['live']) })
    expect(entries).toEqual([{ id: 'live', userId: 'user-mia', text: '', orderTimeMs: 1_800_000_000_000, pending: true }])
  })

  it('leaves out deleted messages, photos, empty rows and rows without a sender', () => {
    const photo = { conversationId: 'room-1', messageId: 'msg-1', width: 640, height: 480 }
    const entries = build([
      message('recalled', { recalled: true }),
      message('photo', { image: photo, originalText: '' }),
      message('empty', { originalText: '   ' }),
      message('nobody', { speakerUserId: null }),
      message('kept'),
    ])
    expect(entries.map((entry) => entry.id)).toEqual(['kept'])
  })

  it('only looks at the room latest messages', () => {
    const utterances = Array.from({ length: HASH_RUSH_CHAT_SOURCE_WINDOW + 10 }, (_, index) => message(`m${index}`))
    const entries = build(utterances)
    expect(entries).toHaveLength(HASH_RUSH_CHAT_SOURCE_WINDOW)
    expect(entries[0].id).toBe('m10')
    expect(entries.at(-1)?.id).toBe(`m${HASH_RUSH_CHAT_SOURCE_WINDOW + 9}`)
  })
})
