import { describe, expect, it } from 'vitest'

import {
  convertChineseScript,
  ensureChineseScript,
  localizeChineseText,
  normalizeChineseContent,
} from '@/server/chinese-script-conversion'

describe('Chinese script conversion', () => {
  it('converts script without changing words', () => {
    expect(convertChineseScript('我在看视频，头发很长。', 'zh-TW')).toBe('我在看視頻，頭髮很長。')
    expect(convertChineseScript('這個軟體的資訊很有用。', 'zh-CN')).toBe('这个软体的资讯很有用。')
  })

  it('leaves text already in the right script untouched', () => {
    expect(ensureChineseScript('皇后以後再說。', 'zh-TW')).toBe('皇后以後再說。')
    expect(ensureChineseScript('你好', 'zh-CN')).toBe('你好')
    expect(ensureChineseScript('我們', 'zh-CN')).toBe('我们')
  })

  it('localizes vocabulary for the other region', () => {
    expect(localizeChineseText('这个软件的信息很有用，坐出租车吧。', 'zh-TW')).toBe('這個軟體的資訊很有用，坐計程車吧。')
    // Simplified input labelled zh-TW (speech recognition output) still gets mainland vocabulary.
    expect(localizeChineseText('搭计程车', 'zh-CN')).toBe('搭出租车')
    expect(localizeChineseText('搭計程車', 'zh-CN')).toBe('搭出租车')
  })
})

describe('normalizeChineseContent', () => {
  it('labels a Taiwanese room speaker zh-TW and renders the source in Traditional', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'zh',
      sourceText: '我们明天去台湾',
      translations: { ko: '우리 내일 대만에 가요' },
      targetLanguages: ['ko'],
      candidates: ['ko', 'zh-TW'],
    })
    expect(result.sourceLanguage).toBe('zh-TW')
    expect(result.sourceDisplayText).toBe('我們明天去臺灣')
    expect(result.translations).toEqual({ ko: '우리 내일 대만에 가요' })
    expect(result.targetLanguages).toEqual(['ko'])
  })

  it('derives the other Chinese variant from a Chinese source instead of trusting the model', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'zh-CN',
      sourceText: '这个软件很好用',
      // A model copied the Simplified source into zh-TW.
      translations: { 'zh-TW': '这个软件很好用', ko: '이 소프트웨어 좋아요' },
      targetLanguages: ['zh-TW', 'ko'],
    })
    expect(result.sourceLanguage).toBe('zh-CN')
    expect(result.sourceDisplayText).toBeNull()
    expect(result.translations['zh-TW']).toBe('這個軟體很好用')
    expect(result.translations.ko).toBe('이 소프트웨어 좋아요')
  })

  it('fills a requested Chinese variant that the model left out', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'zh-TW',
      sourceText: '我们搭计程车',
      translations: { ko: '택시 타요' },
      targetLanguages: ['zh-CN', 'ko'],
      candidates: ['zh-CN', 'zh-TW', 'ko'],
    })
    expect(result.translations['zh-CN']).toBe('我们搭出租车')
    expect(result.sourceDisplayText).toBe('我們搭計程車')
  })

  it('uses the same-variant rendering of mixed-language speech for the sibling', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'zh-CN',
      sourceText: '我们去 한국 식당',
      translations: { 'zh-CN': '我们去韩国餐厅', 'zh-TW': '我们去 한국 식당' },
      targetLanguages: ['zh-CN', 'zh-TW'],
    })
    expect(result.translations['zh-TW']).toBe('我們去韓國餐廳')
  })

  it('re-keys a bare zh translation by its script and keeps both variants', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'ko',
      sourceText: '안녕하세요',
      translations: { zh: '這個很好', ko: '안녕하세요' },
      targetLanguages: ['zh-CN', 'zh-TW'],
    })
    expect(result.translations['zh-TW']).toBe('這個很好')
    expect(result.translations['zh-CN']).toBe('这个很好')
    expect(result.translations.zh).toBeUndefined()
    expect(result.targetLanguages).toEqual(['zh-CN', 'zh-TW', 'ko'])
  })

  it('never lets a bare zh key overwrite an explicit variant', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'ko',
      sourceText: '네',
      translations: { 'zh-CN': '是的', zh: '是的呀' },
      targetLanguages: ['zh-CN'],
    })
    expect(result.translations['zh-CN']).toBe('是的')
    expect(Object.keys(result.translations)).toEqual(['zh-CN'])
  })

  it('forces each variant into its own script', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'en',
      sourceText: 'We are here',
      translations: { 'zh-CN': '我們在這裡', 'zh-TW': '我们在这里' },
      targetLanguages: ['zh-CN', 'zh-TW'],
    })
    expect(result.translations['zh-CN']).toBe('我们在这里')
    expect(result.translations['zh-TW']).toBe('我們在這裡')
  })

  it('replaces an untranslated copy of a non-Chinese source with the other variant', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'ko',
      sourceText: '고마워요',
      translations: { 'zh-CN': '谢谢', 'zh-TW': '고마워요' },
      targetLanguages: ['zh-CN', 'zh-TW'],
    })
    expect(result.translations['zh-TW']).toBe('謝謝')
  })

  it('canonicalizes non-Chinese keys and keeps unknown source languages', () => {
    const result = normalizeChineseContent({
      sourceLanguage: 'unknown',
      sourceText: 'hi',
      translations: { 'ko-KR': '안녕', en_US: 'hi' },
      targetLanguages: ['KO'],
    })
    expect(result.sourceLanguage).toBe('unknown')
    expect(result.translations).toEqual({ ko: '안녕', en: 'hi' })
    expect(result.targetLanguages).toEqual(['ko', 'en'])
  })
})
