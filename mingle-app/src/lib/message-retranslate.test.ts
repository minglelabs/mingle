import { describe, expect, it } from 'vitest'
import { applyRetranslationToUtterance, messageRetranslateCopy } from './message-retranslate'

const utterance = {
  id: 'u-1',
  translations: { en: 'Hello', 'zh-CN': '你好' },
  translationFinalized: { en: true, 'zh-CN': true },
}

describe('applyRetranslationToUtterance', () => {
  it('replaces the translation of the matching message and language', () => {
    const next = applyRetranslationToUtterance(utterance, { messageId: 'u-1', language: 'en', text: ' Hi there ' })
    expect(next.translations).toEqual({ en: 'Hi there', 'zh-CN': '你好' })
    expect(next.translationFinalized).toEqual({ en: true, 'zh-CN': true })
  })

  it('writes to the key the bubble already reads', () => {
    const next = applyRetranslationToUtterance(utterance, { messageId: 'u-1', language: 'zh-cn', text: '您好' })
    expect(next.translations).toEqual({ en: 'Hello', 'zh-CN': '您好' })
  })

  it('leaves other messages, empty texts and unchanged texts as the same object', () => {
    expect(applyRetranslationToUtterance(utterance, { messageId: 'u-2', language: 'en', text: 'x' })).toBe(utterance)
    expect(applyRetranslationToUtterance(utterance, { messageId: 'u-1', language: 'en', text: '  ' })).toBe(utterance)
    expect(applyRetranslationToUtterance(utterance, { messageId: 'u-1', language: 'en', text: 'Hello' })).toBe(utterance)
  })
})

describe('messageRetranslateCopy', () => {
  it('resolves the locale and falls back to the default', () => {
    expect(messageRetranslateCopy('ko').retranslate).toBe('다시 번역')
    expect(messageRetranslateCopy('en-US').retranslate).toBe('Translate again')
    expect(messageRetranslateCopy('xx').retranslate).toBeTruthy()
  })
})
