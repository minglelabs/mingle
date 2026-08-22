import { describe, expect, it } from 'vitest'
import {
  buildFallbackTranslationsFromCurrentTurnPreviousState,
  normalizeLang,
  normalizeSelectedLanguages,
  normalizeTargetLanguages,
  parseCurrentTurnPreviousState,
  parseDetectedSourceLanguage,
  parseImmediatePreviousTurn,
  parseRecentTurns,
  parseTranslations,
} from './utils'

describe('translate/finalize utils', () => {
  it('normalizes language codes to supported canonical forms', () => {
    expect(normalizeLang(' KO-KR ')).toBe('ko')
    expect(normalizeLang('en_US')).toBe('en')
    expect(normalizeLang('fil-PH')).toBe('tl')
    expect(normalizeLang('iw-IL')).toBe('he')
    expect(normalizeLang('zh')).toBe('zh')
    expect(normalizeLang('zh-Hant-TW')).toBe('zh-TW')
    expect(normalizeLang('zh-Hans-CN')).toBe('zh-CN')
    expect(normalizeLang('')).toBe('')
  })

  it('normalizes target languages by dedupe and source exclusion', () => {
    const normalized = normalizeTargetLanguages(
      ['ko', 'KO', 'en-US', 'ja', 'fil-PH', 'iw-IL', 'zh-TW', 123, '', 'en'] as unknown[],
      'en',
    )
    expect(normalized).toEqual(['ko', 'ja', 'tl', 'he', 'zh-TW'])
  })

  it('normalizes selected languages without excluding any hint language', () => {
    expect(normalizeSelectedLanguages(
      ['ko', 'KO', 'en-US', 'ja', 'fil-PH', 'iw-IL', 'zh-TW', 123, '', 'en'] as unknown[],
    )).toEqual(['ko', 'en', 'ja', 'tl', 'he', 'zh-TW'])
  })

  it('parses translation JSON and strips marker tokens', () => {
    const raw = [
      '```json',
      '{"ko":"안녕하세요<fin>","ja":" こんにちは ","invalid":123}',
      '```',
    ].join('\n')

    expect(parseTranslations(raw)).toEqual({
      ko: '안녕하세요',
      ja: 'こんにちは',
    })
  })

  it('recovers JSON payload embedded in non-json text', () => {
    const raw = 'result: {"en":" hello ","es":" hola "} done'
    expect(parseTranslations(raw)).toEqual({
      en: 'hello',
      es: 'hola',
    })
  })

  it('canonicalizes translation payload keys from known aliases', () => {
    const raw = '{"fil":" kamusta ","iw":" שלום ","zh-cn":"简体","zh-hant":"繁體"}'
    expect(parseTranslations(raw)).toEqual({
      tl: 'kamusta',
      he: 'שלום',
      'zh-CN': '简体',
      'zh-TW': '繁體',
    })
  })

  it('unwraps translations nested by an OpenAI-compatible provider', () => {
    expect(parseTranslations('{"sourceLanguage":"ja","translations":{"en":"Yes.","ko":"네."}}'))
      .toEqual({ en: 'Yes.', ko: '네.' })
  })

  it('parses detected source language from strict json payload', () => {
    expect(parseDetectedSourceLanguage('{"sourceLanguage":"ko","ko":"안녕하세요","ja":"こんにちは"}'))
      .toBe('ko')
    expect(parseDetectedSourceLanguage('result: {"sourceLang":"en-US","en":"hello"} done'))
      .toBe('en')
    expect(parseDetectedSourceLanguage('{"sourceLanguage":"unknown-code"}'))
      .toBe('')
  })

  it('keeps only latest 12 recent turns and removes source-language translations', () => {
    const raw = [
      { sourceLanguage: 'en', sourceText: 'too-old', translations: { ko: '오래됨' }, ageMs: 9999 },
      ...Array.from({ length: 12 }).map((_, index) => ({
        sourceLanguage: 'en',
        sourceText: `<fin>msg-${index}`,
        translations: {
          en: 'self-translation-should-drop',
          ko: `ko-${index}`,
        },
        ageMs: index === 0 ? '1500' : undefined,
      })),
    ]

    const turns = parseRecentTurns(raw)
    expect(turns).toHaveLength(12)
    expect(turns[0]).toEqual({
      sourceLanguage: 'en',
      sourceText: 'msg-0',
      translations: { ko: 'ko-0' },
      ageMs: 1500,
      isFinalized: false,
    })
    expect(turns[11]?.sourceText).toBe('msg-11')
  })

  it('parses immediate previous turn and defaults isFinalized to false', () => {
    expect(parseImmediatePreviousTurn({
      sourceLanguage: 'en',
      sourceText: '<fin>hello',
      translations: { ko: '안녕' },
    })).toEqual({
      sourceLanguage: 'en',
      sourceText: 'hello',
      translations: { ko: '안녕' },
      isFinalized: false,
    })

    expect(parseImmediatePreviousTurn({
      sourceLanguage: 'en',
      sourceText: 'hello again',
      translations: { ko: '또 안녕' },
      isFinalized: true,
    })?.isFinalized).toBe(true)
  })

  it('parses current turn previous state with source-language filtering', () => {
    const parsed = parseCurrentTurnPreviousState({
      sourceLanguage: 'ja-JP',
      sourceText: ' <end> こんにちは ',
      translations: {
        ja: '원문 언어는 제거',
        en: ' hello <fin> ',
      },
    })

    expect(parsed).toEqual({
      sourceLanguage: 'ja',
      sourceText: 'こんにちは',
      translations: {
        en: 'hello',
      },
    })
  })

  it('returns null when current turn previous state is not valid', () => {
    expect(parseCurrentTurnPreviousState({ sourceLanguage: 'en', sourceText: '  ' })).toBeNull()
    expect(parseCurrentTurnPreviousState(null)).toBeNull()
  })

  it('builds fallback translations only for requested targets with non-empty text', () => {
    const fallback = buildFallbackTranslationsFromCurrentTurnPreviousState(
      {
        sourceLanguage: 'ko',
        sourceText: '안녕하세요',
        translations: {
          en: ' hello ',
          ja: '',
        },
      },
      ['ja', 'en', 'fr'],
    )

    expect(fallback).toEqual({
      en: 'hello',
    })
  })
})
