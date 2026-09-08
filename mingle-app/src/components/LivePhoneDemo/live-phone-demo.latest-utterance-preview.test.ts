import { describe, expect, it } from 'vitest'
import { buildLatestUtterancePayload } from './LivePhoneDemo'
import type { Utterance } from './ChatBubble'
import { resolveLatestUtteranceReport } from './latest-utterance-report'

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
  it('reports delayed translation and final corrections on the same finalized message', () => {
    const utterance = buildUtterance({ createdAtMs: 1_000 })
    const payloadFor = (value: Utterance, language = 'ko') => (
      buildLatestUtterancePayload(value, language, [language], language, ['it', 'ko'])!
    )
    const original = resolveLatestUtteranceReport(null, utterance.id, payloadFor(utterance))!
    expect(original.isNewUtterance).toBe(true)
    expect(original.report.payload.preview).toBe('Ciao')

    const translated = { ...utterance, translations: { ko: '안녕' } }
    const initialTranslation = resolveLatestUtteranceReport(original.report, utterance.id, payloadFor(translated))!
    expect(initialTranslation.isNewUtterance).toBe(false)
    expect(initialTranslation.report.payload.preview).toBe('안녕')

    const corrected = { ...utterance, translations: { ko: '안녕하세요' } }
    const finalTranslation = resolveLatestUtteranceReport(initialTranslation.report, utterance.id, payloadFor(corrected))!
    expect(finalTranslation.isNewUtterance).toBe(false)
    expect(finalTranslation.report.payload.preview).toBe('안녕하세요')
    expect(resolveLatestUtteranceReport(finalTranslation.report, utterance.id, payloadFor(corrected))).toBeNull()

    const languageChange = resolveLatestUtteranceReport(finalTranslation.report, utterance.id, payloadFor(corrected, 'it'))!
    expect(languageChange.isNewUtterance).toBe(false)
    expect(languageChange.report.payload.preview).toBe('Ciao')

    const nextMessage = resolveLatestUtteranceReport(languageChange.report, 'u-2', payloadFor(corrected, 'it'))!
    expect(nextMessage.isNewUtterance).toBe(true)
  })

  it('preserves the original report time when a legacy message has no creation time', () => {
    const original = resolveLatestUtteranceReport(null, 'u-1', {
      preview: 'Ciao', createdAt: '2026-09-08T00:00:00.000Z',
    })!
    const translated = resolveLatestUtteranceReport(original.report, 'u-1', {
      preview: '안녕', createdAt: '2026-09-08T00:00:05.000Z',
    })!
    expect(translated.report.payload.createdAt).toBe(original.report.payload.createdAt)
    expect(resolveLatestUtteranceReport(translated.report, 'u-1', {
      preview: '안녕', createdAt: '2026-09-08T00:00:10.000Z',
    })).toBeNull()
  })

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
