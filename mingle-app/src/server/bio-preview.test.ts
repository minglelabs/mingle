import { describe, expect, it } from 'vitest'
import { BIO_PREVIEW_MODEL, parseBioPreviewRequest, takeBioPreviewSlot, validateBioPreview } from './bio-preview'

describe('onboarding self-introduction preview', () => {
  it('runs on Haiku', () => {
    expect(BIO_PREVIEW_MODEL).toBe('claude-haiku-5-5')
  })

  it('takes a short text and up to six known languages', () => {
    expect(parseBioPreviewRequest({ text: ' 안녕하세요 ', languages: ['ko', 'en', 'en', 'zh-CN'] }))
      .toEqual({ text: '안녕하세요', languages: ['ko', 'en', 'zh-CN'] })
    expect(parseBioPreviewRequest({ text: '', languages: ['en'] })).toBeNull()
    expect(parseBioPreviewRequest({ text: 'a'.repeat(161), languages: ['en'] })).toBeNull()
    expect(parseBioPreviewRequest({ text: 'hi', languages: ['en', 'ko', 'ja', 'zh-CN', 'zh-TW', 'fr', 'de'] })).toBeNull()
    expect(parseBioPreviewRequest({ text: 'hi', languages: ['xx'] })).toBeNull()
  })

  it('keeps only the asked languages from the answer', () => {
    expect(validateBioPreview({ translations: [{ language: 'en', text: 'Hi' }, { language: 'fr', text: 'Salut' }] }, ['en', 'ja']))
      .toEqual({ en: 'Hi' })
    expect(() => validateBioPreview({ translations: [] }, ['en'])).toThrow()
  })

  it('limits how often one address may ask', () => {
    const key = `test-${Math.random()}`
    for (let index = 0; index < 20; index += 1) expect(takeBioPreviewSlot(key, 1_000)).toBe(true)
    expect(takeBioPreviewSlot(key, 1_000)).toBe(false)
    expect(takeBioPreviewSlot(key, 1_000 + 11 * 60_000)).toBe(true)
  })
})
