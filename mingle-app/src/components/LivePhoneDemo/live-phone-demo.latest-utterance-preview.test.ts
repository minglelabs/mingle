import { describe, expect, it } from 'vitest'
import { buildLatestUtterancePayload } from './LivePhoneDemo'
import type { Utterance } from './ChatBubble'

function buildUtterance(overrides: Partial<Utterance> = {}): Utterance {
  return {
    id: 'u-1',
    originalText: 'Ciao',
    originalLang: 'it',
    translations: {},
    ...overrides,
  }
}

describe('buildLatestUtterancePayload', () => {
  it("shows the viewer's own display-language translation for a message in another language", () => {
    const utterance = buildUtterance({
      translations: { ko: '안녕' },
    })

    const payload = buildLatestUtterancePayload(utterance, 'ko', ['ko'], null, ['it', 'ko'])

    expect(payload?.preview).toBe('안녕')
  })

  it("keeps the original text for the viewer's own message (no translation into their own language)", () => {
    const utterance = buildUtterance({
      originalText: '안녕',
      originalLang: 'ko',
      translations: { it: 'Ciao' },
    })

    const payload = buildLatestUtterancePayload(utterance, 'ko', ['ko'], null, ['it', 'ko'])

    expect(payload?.preview).toBe('안녕')
  })

  it('falls back to the original text when no translation has finalized yet for the viewer language', () => {
    const utterance = buildUtterance({
      translations: {},
    })

    const payload = buildLatestUtterancePayload(utterance, 'ko', ['ko'], null, ['it', 'ko'])

    expect(payload?.preview).toBe('Ciao')
  })

  it('falls back to the original text when the viewer has no preferred display language', () => {
    const utterance = buildUtterance({
      translations: { ko: '안녕' },
    })

    const payload = buildLatestUtterancePayload(utterance, null, undefined, null, ['it', 'ko'])

    expect(payload?.preview).toBe('Ciao')
  })
})
