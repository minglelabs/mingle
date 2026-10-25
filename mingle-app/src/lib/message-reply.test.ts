import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import {
  MESSAGE_REPLY_TEXT_LIMIT,
  buildMessageReplyReference,
  normalizeMessageReplyReference,
  resolveMessageReplyCopy,
  resolveMessageReplyPreviewText,
  toRecalledMessageReplyReference,
} from './message-reply'

describe('message reply references', () => {
  it('builds a clipped snapshot from an utterance', () => {
    const reference = buildMessageReplyReference({
      id: 'm1', originalText: `  ${'a'.repeat(400)}  `, translations: { ko: '안녕' },
      speakerName: 'Alice', speakerUserId: 'u1',
    })
    expect(reference?.id).toBe('m1')
    expect(reference?.text.length).toBe(MESSAGE_REPLY_TEXT_LIMIT)
    expect(reference?.translations).toEqual({ ko: '안녕' })
    expect(reference?.speakerName).toBe('Alice')
  })

  it('rejects malformed client metadata', () => {
    expect(normalizeMessageReplyReference(null)).toBeNull()
    expect(normalizeMessageReplyReference({ id: '', text: 'x' })).toBeNull()
    expect(normalizeMessageReplyReference({ id: 'm1', text: '   ' })).toBeNull()
    expect(normalizeMessageReplyReference({ id: 'x'.repeat(300), text: 'x' })).toBeNull()
    expect(normalizeMessageReplyReference({ id: 'm1', text: 'hi', translations: { ko: 5 } })).toEqual({ id: 'm1', text: 'hi' })
  })

  it('drops quoted text once the original is unsent', () => {
    const recalled = toRecalledMessageReplyReference({ id: 'm1', text: 'secret', translations: { ko: '비밀' }, speakerName: 'A' })
    expect(recalled).toEqual({ id: 'm1', text: '', speakerName: 'A', recalled: true })
    expect(normalizeMessageReplyReference({ id: 'm1', text: 'secret', recalled: true })?.text).toBe('')
  })

  it('prefers the viewer display language when the quote has it', () => {
    const reference = { id: 'm1', text: 'hello', translations: { ko: '안녕' } }
    expect(resolveMessageReplyPreviewText(reference, ['ja', 'ko'])).toBe('안녕')
    expect(resolveMessageReplyPreviewText(reference, ['ja'])).toBe('hello')
  })

  it('defines reply copy for all 15 primary UI locales', () => {
    expect(resolveMessageReplyCopy('ko').reply).toBe('답장')
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveMessageReplyCopy(locale)
      for (const value of Object.values(copy)) expect(value.trim(), locale).not.toBe('')
      expect(copy.replyingTo, locale).toContain('{name}')
    }
  })
})
