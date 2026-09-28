import { describe, expect, it } from 'vitest'
import { toUtterance } from './use-conversation-spectate'

describe('spectate utterance mapping', () => {
  it('maps originalDisplayText only when it differs from the original', () => {
    expect(toUtterance({
      id: 'a', originalText: '这是中文', originalDisplayText: '這是中文', originalLang: 'zh-TW', translations: {},
    })?.originalDisplayText).toBe('這是中文')
    expect(toUtterance({
      id: 'b', originalText: '这是中文', originalDisplayText: '这是中文', originalLang: 'zh-CN', translations: {},
    })).not.toHaveProperty('originalDisplayText')
  })

  it('resolves legacy generic zh keys to a Chinese variant', () => {
    const utterance = toUtterance({
      id: 'c', originalText: '안녕하세요', originalLang: 'ko',
      targetLanguages: ['zh-TW', 'zh'], translations: { zh: '你好嗎' }, translationFinalized: { zh: true },
    })
    expect(utterance?.targetLanguages).toEqual(['zh-TW'])
    expect(utterance?.translations).toEqual({ 'zh-TW': '你好嗎' })
    expect(utterance?.translationFinalized).toEqual({ 'zh-TW': true })
    expect(toUtterance({ id: 'd', originalText: '这是中文', originalLang: 'zh', translations: {} })?.originalLang).toBe('zh-CN')
  })
})
