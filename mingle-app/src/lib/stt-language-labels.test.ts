import { describe, expect, it } from 'vitest'
import {
  findOwnSelectedLanguage,
  isLikelyMixedUtterance,
  listTextScripts,
  parseSttLanguageLabels,
  resolveSingleLabelTargetLanguages,
  singleLabelResultDisagrees,
  usesSingleScript,
} from './stt-language-labels'

describe('parseSttLanguageLabels', () => {
  it('keeps base codes, drops unknown and junk', () => {
    expect(parseSttLanguageLabels(['ko', 'EN-us', 'unknown', '', 3, 'ko', 'x y'])).toEqual(['en', 'ko'])
    expect(parseSttLanguageLabels('ko')).toEqual([])
    expect(parseSttLanguageLabels(undefined)).toEqual([])
  })
})

describe('usesSingleScript', () => {
  it('reads letters only', () => {
    expect(listTextScripts('안녕하세요, 3시에 봐요!')).toEqual(['hangul'])
    expect(usesSingleScript('Hello there, 2 pm?', 'en')).toBe(true)
    expect(usesSingleScript('', 'en')).toBe(false)
  })
  it('takes kana with kanji as one script only for Japanese', () => {
    expect(usesSingleScript('今日はいい天気ですね', 'ja')).toBe(true)
    expect(usesSingleScript('今日はいい天気ですね', 'ko')).toBe(false)
  })
  it('sees a second script', () => {
    expect(usesSingleScript('나는 iPhone 샀어', 'ko')).toBe(false)
    expect(usesSingleScript('そんな답답해서 죽겠다고', 'ko')).toBe(false)
  })
})

describe('resolveSingleLabelTargetLanguages', () => {
  const base = { targetLanguages: ['en', 'ko', 'ja'], text: '오늘 날씨 좋네요', sourceLanguage: 'ko' }
  it('drops the own language when one label matches it', () => {
    expect(resolveSingleLabelTargetLanguages({ ...base, sttLanguages: ['ko'] })).toEqual(['en', 'ja'])
  })
  it('asks for everything when labels are missing, several, or another language', () => {
    expect(resolveSingleLabelTargetLanguages({ ...base, sttLanguages: [] })).toBeNull()
    expect(resolveSingleLabelTargetLanguages({ ...base, sttLanguages: ['en', 'ko'] })).toBeNull()
    expect(resolveSingleLabelTargetLanguages({ ...base, sttLanguages: ['ja'] })).toBeNull()
  })
  it('asks for everything when the text has a second script', () => {
    expect(resolveSingleLabelTargetLanguages({ ...base, sttLanguages: ['ko'], text: '나는 iPhone 샀어' })).toBeNull()
  })
  it('asks for everything for Chinese, an unknown source, and when nothing would be left', () => {
    expect(resolveSingleLabelTargetLanguages({
      sttLanguages: ['zh'], sourceLanguage: 'zh-CN', targetLanguages: ['zh-CN', 'zh-TW', 'en'], text: '你好',
    })).toBeNull()
    expect(resolveSingleLabelTargetLanguages({ ...base, sourceLanguage: 'unknown', sttLanguages: ['ko'] })).toBeNull()
    expect(resolveSingleLabelTargetLanguages({ ...base, targetLanguages: ['ko'], sttLanguages: ['ko'] })).toBeNull()
    expect(resolveSingleLabelTargetLanguages({ ...base, targetLanguages: ['en', 'ja'], sttLanguages: ['ko'] })).toBeNull()
  })
})

describe('singleLabelResultDisagrees', () => {
  it('agrees on the same language without flags', () => {
    expect(singleLabelResultDisagrees({ sourceLanguage: 'ko', sourceLanguagesMixed: false, sourceTextHasForeignScript: false }, 'ko')).toBe(false)
    expect(singleLabelResultDisagrees({ sourceLanguage: 'en-US' }, 'en')).toBe(false)
  })
  it('disagrees on a flag or another language', () => {
    expect(singleLabelResultDisagrees({ sourceLanguage: 'ko', sourceLanguagesMixed: true }, 'ko')).toBe(true)
    expect(singleLabelResultDisagrees({ sourceLanguage: 'ko', sourceTextHasForeignScript: true }, 'ko')).toBe(true)
    expect(singleLabelResultDisagrees({ sourceLanguage: 'ja' }, 'ko')).toBe(true)
  })
})

describe('isLikelyMixedUtterance', () => {
  it('is true when the labels name another language or the text uses another script', () => {
    expect(isLikelyMixedUtterance({ sttLanguages: ['en', 'ko'], sourceLanguage: 'en', text: 'Hello there' })).toBe(true)
    expect(isLikelyMixedUtterance({ sttLanguages: [], sourceLanguage: 'en', text: 'Hello 내 목숨' })).toBe(true)
    expect(isLikelyMixedUtterance({ sttLanguages: ['es'], sourceLanguage: 'en', text: 'Hola amigo' })).toBe(true)
  })

  it('is false for one language in one script', () => {
    expect(isLikelyMixedUtterance({ sttLanguages: ['en'], sourceLanguage: 'en', text: 'Hello there' })).toBe(false)
    expect(isLikelyMixedUtterance({ sttLanguages: [], sourceLanguage: 'ja', text: '今日は天気がいい' })).toBe(false)
    expect(isLikelyMixedUtterance({ sttLanguages: ['ko'], sourceLanguage: 'unknown', text: '안녕 hello' })).toBe(false)
  })
})

describe('findOwnSelectedLanguage', () => {
  it('finds the selected language with the source base', () => {
    expect(findOwnSelectedLanguage(['ko', 'en'], 'en-US')).toBe('en')
    expect(findOwnSelectedLanguage(['ko', 'ja'], 'en')).toBeNull()
  })
})
