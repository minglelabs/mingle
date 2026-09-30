import { describe, expect, it } from 'vitest'
import {
  normalizeLang,
  sanitizeJsonObject,
  sanitizeTargetLanguages,
  sanitizeText,
  sanitizeTranslations,
} from './sanitize'

describe('client-event sanitize utils', () => {
  it('sanitizes text with trim and max length', () => {
    expect(sanitizeText('  hello  ', 5)).toBe('hello')
    expect(sanitizeText('   ')).toBeNull()
    expect(sanitizeText(123)).toBeNull()
  })

  it('normalizes language to a canonical code with unknown fallback', () => {
    expect(normalizeLang(' KO-KR ')).toBe('ko')
    expect(normalizeLang('en_US')).toBe('en')
    expect(normalizeLang('XX-YY')).toBe('xx')
    expect(normalizeLang(123)).toBe('unknown')
    expect(normalizeLang('')).toBe('unknown')
    expect(normalizeLang('<script>')).toBe('unknown')
  })

  it('keeps Chinese variants distinct and never returns a bare zh', () => {
    expect(normalizeLang('zh-CN')).toBe('zh-CN')
    expect(normalizeLang('zh-TW')).toBe('zh-TW')
    expect(normalizeLang('zh_hant')).toBe('zh-TW')
    expect(normalizeLang('zh')).toBe('zh-CN')
    expect(normalizeLang('zh', { candidates: ['zh-TW', 'ko'] })).toBe('zh-TW')
  })

  it('keeps both Chinese translations instead of collapsing them to zh', () => {
    expect(sanitizeTranslations({ 'zh-CN': '头发', 'zh-TW': '頭髮', 'ko-KR': '머리' })).toEqual({
      'zh-CN': '头发',
      'zh-TW': '頭髮',
      ko: '머리',
    })
    expect(sanitizeTranslations({ zh: '头发' }, { keepGenericChinese: true })).toEqual({ zh: '头发' })
  })

  it('sanitizes translations and strips marker tokens', () => {
    const longText = `x${'a'.repeat(22000)}`
    const sanitized = sanitizeTranslations({
      'ko-KR': ' 안녕하세요 <fin> ',
      en: '<end>Hello',
      xx: 'custom',
      invalid: 123,
      ja: longText,
    })

    expect(sanitized.ko).toBe('안녕하세요')
    expect(sanitized.en).toBe('Hello')
    expect(sanitized.xx).toBe('custom')
    expect(sanitized.ja.length).toBe(20000)
  })

  it('keeps a bounded, deduplicated list of valid translation targets', () => {
    expect(sanitizeTargetLanguages([
      'ko', 'ja', 'ko', null, '<script>', 'zh-TW', 'en', 'fr', 'de', 'es', 'it', 'pt', 'vi',
    ])).toEqual(['ko', 'ja', 'zh-TW', 'en', 'fr', 'de', 'es', 'it', 'pt', 'vi'])
  })

  it('canonicalizes and de-duplicates translation targets', () => {
    expect(sanitizeTargetLanguages(['ko-KR', 'ko', 'zh-tw', 'zh-TW', 'zh-CN'])).toEqual(['ko', 'zh-TW', 'zh-CN'])
    // A legacy collapsed `zh` beside its explicit variant is that variant.
    expect(sanitizeTargetLanguages(['zh-TW', 'ko', 'zh'])).toEqual(['zh-TW', 'ko'])
  })

  it('returns serializable json object and rejects invalid inputs', () => {
    expect(sanitizeJsonObject({ a: 1, b: { c: true } })).toEqual({ a: 1, b: { c: true } })
    expect(sanitizeJsonObject(['array'])).toBeNull()
    expect(sanitizeJsonObject({ value: BigInt(1) })).toBeNull()
  })
})
