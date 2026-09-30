import { describe, expect, it } from 'vitest'
import {
  decodeOperatorInboxActorLabel,
  encodeOperatorInboxActorLabel,
  OPERATOR_INBOX_PUSH_PREVIEW_MAX_CHARS,
  resolveOperatorInboxPushCopy,
} from './push-copy'

function copyFor(
  recipientLanguage: string,
  subject: Parameters<typeof encodeOperatorInboxActorLabel>[0],
  messagePreview?: string,
) {
  return resolveOperatorInboxPushCopy({
    recipientLanguage,
    actorLabel: encodeOperatorInboxActorLabel(subject),
    messagePreview,
  })
}

describe('resolveOperatorInboxPushCopy', () => {
  it('names the operator account in the title and the sender in the body (Korean staff)', () => {
    expect(copyFor('ko', { operatorNames: ['루카'], senderLabel: 'Mina', kind: 'text' }, 'Olá, tudo bem?'))
      .toEqual({ title: '루카에게 새 메시지', body: 'Mina: Olá, tudo bem?' })
    expect(copyFor('ko-KR', { operatorNames: ['루카'], senderLabel: 'Mina', kind: 'text' }, 'hi').title)
      .toBe('루카에게 새 메시지')
  })

  it('uses English for every other locale', () => {
    for (const language of ['en', 'ja', 'pt-BR', 'zh-TW', 'xx', '']) {
      expect(copyFor(language, { operatorNames: ['Luca'], senderLabel: 'Mina', kind: 'text' }, 'hi'))
        .toEqual({ title: 'New message for Luca', body: 'Mina: hi' })
    }
  })

  it('shows a photo as a sentence instead of a preview', () => {
    expect(copyFor('ko', { operatorNames: ['루카'], senderLabel: 'Mina', kind: 'photo' }, '📷 Photo'))
      .toEqual({ title: '루카에게 새 메시지', body: 'Mina: 사진을 보냈습니다' })
    expect(copyFor('en', { operatorNames: ['Luca'], senderLabel: 'Mina', kind: 'photo' }))
      .toEqual({ title: 'New message for Luca', body: 'Mina: Sent a photo' })
  })

  it('clips the preview to 100 characters, counting emoji as one', () => {
    const long = `${'가'.repeat(99)}😀끝까지`
    const { body } = copyFor('ko', { operatorNames: ['루카'], senderLabel: 'Mina', kind: 'text' }, long)
    const preview = body.slice('Mina: '.length)
    expect(Array.from(preview)).toHaveLength(OPERATOR_INBOX_PUSH_PREVIEW_MAX_CHARS + 1)
    expect(preview.endsWith('가😀…')).toBe(true)
    expect(copyFor('en', { operatorNames: ['Luca'], senderLabel: 'Mina', kind: 'text' }, '  many \n\n lines  ').body)
      .toBe('Mina: many lines')
  })

  it('lists two operator names and counts the rest', () => {
    const subject = { operatorNames: ['루카', 'Mina', 'Sol', 'Jun'], senderLabel: 'Ana', kind: 'text' as const }
    expect(copyFor('ko', subject, 'hi').title).toBe('루카, Mina 외 2명에게 새 메시지')
    expect(copyFor('en', subject, 'hi').title).toBe('New message for 루카, Mina and 2 more')
    expect(copyFor('en', { ...subject, operatorNames: ['Luca', 'Mina'] }, 'hi').title).toBe('New message for Luca, Mina')
  })

  it('falls back to generic words for a missing sender, operator or preview', () => {
    expect(copyFor('ko', { operatorNames: [], senderLabel: '', kind: 'text' }))
      .toEqual({ title: '운영 계정 새 메시지', body: '알 수 없는 사용자: …' })
    expect(copyFor('en', { operatorNames: ['  '], senderLabel: ' ', kind: 'text' }, ' '))
      .toEqual({ title: 'New message for a Mingle-run account', body: 'Someone: …' })
  })

  it('still accepts a plain actor label (generic title)', () => {
    expect(resolveOperatorInboxPushCopy({ recipientLanguage: 'ko', actorLabel: 'Ada', messagePreview: 'hello' }))
      .toEqual({ title: '운영 계정 새 메시지', body: 'Ada: hello' })
    expect(resolveOperatorInboxPushCopy({ recipientLanguage: 'ja', actorLabel: 'Ada', messagePreview: 'hello' }))
      .toEqual({ title: 'New message for a Mingle-run account', body: 'Ada: hello' })
  })
})

describe('operator inbox actor label', () => {
  it('round-trips the subject and strips control characters from names', () => {
    const label = encodeOperatorInboxActorLabel({ operatorNames: ['루\u0000카', ' Mina '], senderLabel: 'An\u001ea\n', kind: 'photo' })
    expect(decodeOperatorInboxActorLabel(label)).toEqual({ operatorNames: ['루 카', 'Mina'], senderLabel: 'An a', kind: 'photo' })
  })

  it('never decodes a plain or malformed label', () => {
    expect(decodeOperatorInboxActorLabel('Mina')).toBeNull()
    expect(decodeOperatorInboxActorLabel('{"senderLabel":"x"}')).toBeNull()
    expect(decodeOperatorInboxActorLabel('\u001enot json')).toBeNull()
    expect(decodeOperatorInboxActorLabel('\u001enull')).toBeNull()
  })
})
