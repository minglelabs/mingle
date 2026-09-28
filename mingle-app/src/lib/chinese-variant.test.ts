import { Converter } from 'opencc-js'
import { describe, expect, it } from 'vitest'

import { SIMPLIFIED_ONLY_CHARACTERS, TRADITIONAL_ONLY_CHARACTERS } from '@/lib/chinese-script-data'
import {
  canonicalizeLanguageKey,
  classifyChineseLanguage,
  detectChineseScript,
  listChineseVariants,
  resolveChineseVariant,
  toChineseVariant,
} from '@/lib/chinese-variant'

describe('chinese-script-data', () => {
  it('only lists characters OpenCC converts to the other script', () => {
    const toTraditional = Converter({ from: 'cn', to: 'tw' })
    const toSimplified = Converter({ from: 'tw', to: 'cn' })
    for (const character of SIMPLIFIED_ONLY_CHARACTERS) {
      expect(toTraditional(character), character).not.toBe(character)
    }
    for (const character of TRADITIONAL_ONLY_CHARACTERS) {
      expect(toSimplified(character), character).not.toBe(character)
    }
  })

  it('never lists a character in both scripts', () => {
    const traditional = new Set(TRADITIONAL_ONLY_CHARACTERS)
    for (const character of SIMPLIFIED_ONLY_CHARACTERS) expect(traditional.has(character), character).toBe(false)
  })
})

describe('classifyChineseLanguage', () => {
  it('separates generic Chinese, explicit variants and other languages', () => {
    expect(classifyChineseLanguage('zh')).toBe('zh')
    expect(classifyChineseLanguage('Chinese')).toBe('zh')
    expect(classifyChineseLanguage('cmn')).toBe('zh')
    expect(classifyChineseLanguage('zh-cn')).toBe('zh-CN')
    expect(classifyChineseLanguage('zh_Hans')).toBe('zh-CN')
    expect(classifyChineseLanguage('zh-Hant-TW')).toBe('zh-TW')
    expect(classifyChineseLanguage('zh-HK')).toBe('zh-TW')
    expect(classifyChineseLanguage('Traditional Chinese')).toBe('zh-TW')
    expect(classifyChineseLanguage('ja')).toBe('')
    expect(classifyChineseLanguage('')).toBe('')
    expect(toChineseVariant('zh')).toBeNull()
  })

  it('lists explicit variants once, in order', () => {
    expect(listChineseVariants(['ko', 'zh', 'zh-TW', 'zh-tw', 'zh-CN'])).toEqual(['zh-TW', 'zh-CN'])
  })
})

describe('detectChineseScript', () => {
  it('detects Simplified, Traditional and ambiguous text', () => {
    expect(detectChineseScript('我们明天去台湾，这个很好。')).toBe('simplified')
    expect(detectChineseScript('我們明天去台灣，這個很好。')).toBe('traditional')
    expect(detectChineseScript('你好，我是')).toBe('ambiguous')
    expect(detectChineseScript('OK 123')).toBe('ambiguous')
    expect(detectChineseScript('')).toBe('ambiguous')
  })

  it('ignores characters valid in both scripts', () => {
    // 后/里/面/干/台 are written the same way in some Traditional words.
    expect(detectChineseScript('皇后在公里外的台北')).toBe('ambiguous')
  })
})

describe('resolveChineseVariant', () => {
  it('keeps an explicit hint or variant', () => {
    expect(resolveChineseVariant({ hint: 'zh-TW', language: 'zh-CN', text: '我们' })).toBe('zh-TW')
    expect(resolveChineseVariant({ language: 'zh-TW', text: '我们', candidates: ['zh-CN'] })).toBe('zh-TW')
  })

  it('uses the room variant for speech recognition output, whatever its script', () => {
    // The recognizer writes Simplified for a Taiwanese speaker too.
    expect(resolveChineseVariant({ language: 'zh', text: '我们是台湾人', candidates: ['ko', 'zh-TW'] })).toBe('zh-TW')
    expect(resolveChineseVariant({ language: 'zh', text: '我們', candidates: ['ko', 'zh-CN'] })).toBe('zh-CN')
  })

  it('lets typed script outrank the room', () => {
    expect(resolveChineseVariant({
      language: 'zh', text: '我們', candidates: ['ko', 'zh-CN'], preferScript: true,
    })).toBe('zh-TW')
  })

  it('uses the script when the room has both or neither variant', () => {
    expect(resolveChineseVariant({ language: 'zh', text: '這個', candidates: ['zh-CN', 'zh-TW'] })).toBe('zh-TW')
    expect(resolveChineseVariant({ language: 'zh', text: '这个', candidates: ['zh-TW', 'zh-CN'] })).toBe('zh-CN')
    expect(resolveChineseVariant({ language: 'zh', text: '這個', candidates: ['ko', 'en'] })).toBe('zh-TW')
  })

  it('falls back to the tie-breaker, then the room order, then zh-CN', () => {
    expect(resolveChineseVariant({ language: 'zh', text: '你好', candidates: ['zh-CN', 'zh-TW'], fallback: 'zh-TW' })).toBe('zh-TW')
    expect(resolveChineseVariant({ language: 'zh', text: '你好', candidates: ['zh-TW', 'zh-CN'] })).toBe('zh-TW')
    expect(resolveChineseVariant({ language: 'zh', text: '你好' })).toBe('zh-CN')
  })
})

describe('canonicalizeLanguageKey', () => {
  it('never returns a bare zh', () => {
    expect(canonicalizeLanguageKey('zh', { candidates: ['ko', 'zh-TW'] })).toBe('zh-TW')
    expect(canonicalizeLanguageKey('zh')).toBe('zh-CN')
    expect(canonicalizeLanguageKey('zh-tw')).toBe('zh-TW')
  })

  it('canonicalizes other codes and keeps unknown ones', () => {
    expect(canonicalizeLanguageKey(' KO-KR ')).toBe('ko')
    expect(canonicalizeLanguageKey('en_US')).toBe('en')
    expect(canonicalizeLanguageKey('unknown')).toBe('unknown')
    expect(canonicalizeLanguageKey('')).toBe('')
  })
})
