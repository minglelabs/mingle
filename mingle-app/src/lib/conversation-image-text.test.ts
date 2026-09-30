import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_IMAGE_TEXT_MAX_LANGUAGES,
  blockNeedsTranslation,
  buildConversationImageTextEndpoint,
  isConversationImageTextPending,
  languageHasTextToTranslate,
  normalizeImageTextLanguage,
  normalizeImageTextLanguageList,
  overlayBlocksFor,
  parseConversationImageTextResponse,
  type ConversationImageTextBlock,
  type ConversationImageTextResponse,
} from './conversation-image-text'

function block(id: string, text: string, sourceLanguage: string | null): ConversationImageTextBlock {
  return { id, box: [0.1, 0.1, 0.5, 0.2], text, sourceLanguage, angle: 0, lines: 1 }
}

describe('normalizeImageTextLanguage', () => {
  it('returns catalog codes and drops unknown values', () => {
    expect(normalizeImageTextLanguage('en-US')).toBe('en')
    expect(normalizeImageTextLanguage(' KO ')).toBe('ko')
    expect(normalizeImageTextLanguage('und')).toBeNull()
    expect(normalizeImageTextLanguage('')).toBeNull()
    expect(normalizeImageTextLanguage(null)).toBeNull()
    expect(normalizeImageTextLanguage('xx')).toBeNull()
  })

  it('resolves Chinese to a variant, letting the written script win', () => {
    expect(normalizeImageTextLanguage('zh', '简体菜单')).toBe('zh-CN')
    expect(normalizeImageTextLanguage('zh-CN', '繁體菜單')).toBe('zh-TW')
    expect(normalizeImageTextLanguage('zh-Hant')).toBe('zh-TW')
    expect(normalizeImageTextLanguage('zh-TW')).toBe('zh-TW')
    expect(normalizeImageTextLanguage('zh')).toBe('zh-CN')
  })
})

describe('language lists and the endpoint', () => {
  it('normalizes, de-duplicates and caps a list or a query value', () => {
    expect(normalizeImageTextLanguageList('ko,en,KO,zh-Hant,,und')).toEqual(['ko', 'en', 'zh-TW'])
    const many = ['af', 'sq', 'ar', 'az', 'eu', 'be', 'bn', 'bs', 'bg', 'ca']
    expect(normalizeImageTextLanguageList(many)).toHaveLength(CONVERSATION_IMAGE_TEXT_MAX_LANGUAGES)
  })

  it('builds the text endpoint with encoded ids and languages', () => {
    expect(buildConversationImageTextEndpoint('conv 1', 'msg/2')).toBe('/conversations/conv%201/images/msg%2F2/text')
    expect(buildConversationImageTextEndpoint('c1', 'm1', ['ko', 'zh-TW', 'ko'])).toBe('/conversations/c1/images/m1/text?languages=ko,zh-TW')
  })
})

describe('translation eligibility', () => {
  it('skips blocks already in the target language and treats zh variants as different', () => {
    expect(blockNeedsTranslation(block('b0', '抹茶ラテ', 'ja'), 'ja')).toBe(false)
    expect(blockNeedsTranslation(block('b0', '抹茶ラテ', 'ja'), 'ko')).toBe(true)
    expect(blockNeedsTranslation(block('b0', 'OPEN', null), 'en')).toBe(true)
    expect(blockNeedsTranslation(block('b0', '简体菜单', 'zh-CN'), 'zh-TW')).toBe(true)
    expect(blockNeedsTranslation(block('b0', '   ', null), 'ko')).toBe(false)
    expect(languageHasTextToTranslate([block('b0', '메뉴', 'ko')], 'ko')).toBe(false)
    expect(languageHasTextToTranslate([block('b0', '메뉴', 'ko'), block('b1', 'Menu', 'en')], 'ko')).toBe(true)
  })
})

describe('overlayBlocksFor', () => {
  const response: ConversationImageTextResponse = {
    status: 'ready',
    blocks: [block('b0', '本日のおすすめ', 'ja'), block('b1', 'STARBUCKS', 'en'), block('b2', '메뉴', 'ko'), block('b3', '抹茶ラテ', 'ja')],
    translations: [{ language: 'ko', status: 'ready', texts: { b0: '오늘의 추천', b1: ' starbucks ' } }],
  }

  it('paints only translated blocks whose text changed', () => {
    expect(overlayBlocksFor(response, 'ko')).toEqual([{ block: response.blocks[0], text: '오늘의 추천' }])
  })

  it('paints nothing when not ready or the language is missing', () => {
    expect(overlayBlocksFor(response, 'en')).toEqual([])
    expect(overlayBlocksFor({ ...response, status: 'pending' }, 'ko')).toEqual([])
    expect(overlayBlocksFor(null, 'ko')).toEqual([])
    expect(overlayBlocksFor(response, null)).toEqual([])
  })

  it('reports pending work for polling', () => {
    expect(isConversationImageTextPending(response)).toBe(false)
    expect(isConversationImageTextPending({ status: 'pending', blocks: [], translations: [] })).toBe(true)
    expect(isConversationImageTextPending({ ...response, translations: [{ language: 'en', status: 'pending', texts: {} }] })).toBe(true)
    expect(isConversationImageTextPending({ status: 'failed', blocks: [], translations: [] })).toBe(false)
  })
})

describe('parseConversationImageTextResponse', () => {
  it('rejects unusable envelopes', () => {
    expect(parseConversationImageTextResponse(null)).toBeNull()
    expect(parseConversationImageTextResponse({ status: 'done' })).toBeNull()
    expect(parseConversationImageTextResponse({ status: 'ready' })).toBeNull()
  })

  it('keeps pending and terminal statuses with empty arrays', () => {
    expect(parseConversationImageTextResponse({ status: 'pending', retryAfterMs: 99_999, blocks: [block('b0', 'x', 'en')] }))
      .toEqual({ status: 'pending', blocks: [], translations: [], retryAfterMs: 10_000 })
    expect(parseConversationImageTextResponse({ status: 'disabled' })).toEqual({ status: 'disabled', blocks: [], translations: [] })
  })

  it('drops malformed blocks, clamps boxes and filters translation texts', () => {
    const parsed = parseConversationImageTextResponse({
      status: 'ready',
      blocks: [
        { id: 'b0', box: [-0.2, 0.1, 0.5, 1.4], text: '抹茶', sourceLanguage: 'ja-JP', angle: 120, lines: 2.4, style: { background: '#AABBCC', color: 'red', bold: true } },
        { id: 'b0', box: [0.1, 0.1, 0.2, 0.2], text: 'duplicate', sourceLanguage: 'en' },
        { id: '__proto__', box: [0.1, 0.1, 0.2, 0.2], text: 'bad id', sourceLanguage: 'en' },
        { id: 'b2', box: [0.5, 0.1, 0.4, 0.2], text: 'inverted box', sourceLanguage: 'en' },
        { id: 'b3', box: [0.1, 0.1, 0.2, 0.2], text: '  ', sourceLanguage: 'en' },
        { id: 'b4', box: [0.1, 0.1, 0.2, 0.2], text: 'OPEN', sourceLanguage: 'und', vertical: 'yes' },
        { id: 'b5', box: [0.8, 0.1, 0.9, 0.7], text: '本日のおすすめ', sourceLanguage: 'ja', vertical: true },
      ],
      translations: [
        { language: 'KO', status: 'ready', texts: { b0: '말차', b9: 'unknown block', b4: '영업 중' } },
        { language: 'ko', status: 'ready', texts: {} },
        { language: 'en', status: 'weird', texts: {} },
      ],
    })
    expect(parsed?.blocks).toEqual([
      { id: 'b0', box: [0, 0.1, 0.5, 1], text: '抹茶', sourceLanguage: 'ja', angle: 90, lines: 2, style: { background: '#aabbcc', bold: true } },
      { id: 'b4', box: [0.1, 0.1, 0.2, 0.2], text: 'OPEN', sourceLanguage: null, angle: 0, lines: 1 },
      { id: 'b5', box: [0.8, 0.1, 0.9, 0.7], text: '本日のおすすめ', sourceLanguage: 'ja', angle: 0, lines: 1, vertical: true },
    ])
    expect(parsed?.translations).toEqual([{ language: 'ko', status: 'ready', texts: { b0: '말차', b4: '영업 중' } }])
  })
})
