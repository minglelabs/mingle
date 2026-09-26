import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockTranslateTexts } = vi.hoisted(() => ({ mockTranslateTexts: vi.fn() }))

vi.mock('./translate-texts', () => ({
  translateTexts: mockTranslateTexts,
}))

import { detectSourceLanguage, isUndetectableText } from './detect-source-language'

describe('isUndetectableText', () => {
  it('is true for empty / whitespace / emoji / punctuation / digits only', () => {
    expect(isUndetectableText('')).toBe(true)
    expect(isUndetectableText('   ')).toBe(true)
    expect(isUndetectableText('🎉🎉🎉')).toBe(true)
    expect(isUndetectableText('!?!? ... 123 456')).toBe(true)
  })

  it('is false when any letter is present in any script', () => {
    expect(isUndetectableText('hello')).toBe(false)
    expect(isUndetectableText('안녕')).toBe(false)
    expect(isUndetectableText('日本語')).toBe(false)
    expect(isUndetectableText('123 abc')).toBe(false)
  })
})

describe('detectSourceLanguage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('returns null for undetectable text WITHOUT calling the provider', async () => {
    const result = await detectSourceLanguage({ text: '🎉🎉' })
    expect(result).toBeNull()
    expect(mockTranslateTexts).not.toHaveBeenCalled()
  })

  it('returns the canonicalized detected language on success', async () => {
    mockTranslateTexts.mockResolvedValue({ detectedSourceLanguage: 'ko', translations: { en: 'Hi' } })
    const result = await detectSourceLanguage({ text: '안녕하세요' })
    expect(result).toBe('ko')
    expect(mockTranslateTexts).toHaveBeenCalledWith(
      expect.objectContaining({ redetectSourceLanguage: true, isFinal: true }),
    )
  })

  it('falls back to a valid client hint when detection yields nothing', async () => {
    mockTranslateTexts.mockResolvedValue({ detectedSourceLanguage: '', translations: {} })
    const result = await detectSourceLanguage({ text: 'ambiguous', clientHint: 'ja' })
    expect(result).toBe('ja')
  })

  it('falls back to the client hint when the provider throws', async () => {
    mockTranslateTexts.mockRejectedValue(new Error('provider down'))
    const result = await detectSourceLanguage({ text: 'text', clientHint: 'fr' })
    expect(result).toBe('fr')
  })

  it('returns null when detection fails and there is no usable hint', async () => {
    mockTranslateTexts.mockRejectedValue(new Error('provider down'))
    const result = await detectSourceLanguage({ text: 'text', clientHint: 'not-a-language' })
    expect(result).toBeNull()
  })

  it('prefers server detection over the client hint', async () => {
    // Client claims 'en' (display language) but the text is Japanese.
    mockTranslateTexts.mockResolvedValue({ detectedSourceLanguage: 'ja', translations: { en: 'Hi' } })
    const result = await detectSourceLanguage({ text: '料理ができた', clientHint: 'en' })
    expect(result).toBe('ja')
  })
})
