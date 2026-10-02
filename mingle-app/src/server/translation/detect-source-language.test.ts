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

describe('detectSourceLanguage — Chinese is always zh-CN or zh-TW', () => {
  const TRADITIONAL = '這個軟體很好用'
  const SIMPLIFIED = '这个软件很好用'
  const AMBIGUOUS = '你好，我在家。' // shared characters only

  const detects = (detectedSourceLanguage: string) =>
    mockTranslateTexts.mockResolvedValue({ detectedSourceLanguage, translations: { en: 'Hi' } })

  beforeEach(() => vi.clearAllMocks())

  it('resolves a bare zh detection of Traditional text to zh-TW', async () => {
    detects('zh')
    expect(await detectSourceLanguage({ text: TRADITIONAL })).toBe('zh-TW')
  })

  it('lets the typed script beat the model\'s variant guess', async () => {
    detects('zh-CN')
    expect(await detectSourceLanguage({ text: TRADITIONAL })).toBe('zh-TW')
    detects('zh-TW')
    expect(await detectSourceLanguage({ text: SIMPLIFIED })).toBe('zh-CN')
  })

  it('uses the author\'s Chinese display language only when the script is ambiguous', async () => {
    detects('zh-CN')
    expect(await detectSourceLanguage({ text: AMBIGUOUS, clientHint: 'zh-TW' })).toBe('zh-TW')
    // Not a hint that overrides the script.
    detects('zh')
    expect(await detectSourceLanguage({ text: SIMPLIFIED, clientHint: 'zh-TW' })).toBe('zh-CN')
  })

  it('falls back to the model\'s variant, then zh-CN, for ambiguous text', async () => {
    detects('zh-TW')
    expect(await detectSourceLanguage({ text: AMBIGUOUS, clientHint: 'ko' })).toBe('zh-TW')
    detects('zh')
    expect(await detectSourceLanguage({ text: AMBIGUOUS })).toBe('zh-CN')
    detects('Chinese')
    expect(await detectSourceLanguage({ text: AMBIGUOUS })).toBe('zh-CN')
  })

  it('resolves a Chinese client-hint fallback by script as well', async () => {
    mockTranslateTexts.mockRejectedValue(new Error('provider down'))
    expect(await detectSourceLanguage({ text: TRADITIONAL, clientHint: 'zh' })).toBe('zh-TW')
    expect(await detectSourceLanguage({ text: AMBIGUOUS, clientHint: 'zh-TW' })).toBe('zh-TW')
    expect(await detectSourceLanguage({ text: SIMPLIFIED, clientHint: 'zh-Hant' })).toBe('zh-CN')
    mockTranslateTexts.mockResolvedValue({ detectedSourceLanguage: '', translations: {} })
    expect(await detectSourceLanguage({ text: AMBIGUOUS, clientHint: 'zh' })).toBe('zh-CN')
  })

  it('leaves non-Chinese detection unchanged', async () => {
    detects('ja')
    expect(await detectSourceLanguage({ text: '料理ができた', clientHint: 'zh-TW' })).toBe('ja')
    detects('ko')
    expect(await detectSourceLanguage({ text: '안녕하세요', clientHint: 'zh' })).toBe('ko')
  })
})
