import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ userFindFirst: vi.fn(), translateTexts: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: m.userFindFirst } } }))
vi.mock('@/server/translation/translate-texts', () => ({ translateTexts: m.translateTexts }))

import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import {
  convertToPersonaLanguage,
  normalizePersonaLanguage,
  PersonaConversionFailedError,
  PersonaLanguageMissingError,
} from './convert'

function operator(primaryLanguages: string[]) {
  return {
    id: 'op_1',
    handle: 'lucas',
    name: 'Lucas',
    image: null,
    primaryLanguages,
    defaultConversationLanguages: primaryLanguages,
    defaultDisplayLanguage: primaryLanguages[0] ?? null,
    isActive: true,
  }
}

function engine(result: { detected?: string; mixed?: boolean; translations?: Record<string, string> }) {
  m.translateTexts.mockResolvedValue({
    translations: result.translations ?? {},
    ...(result.detected ? { detectedSourceLanguage: result.detected } : {}),
    sourceLanguagesMixed: result.mixed ?? false,
    provider: 'gemini',
    model: 'test',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  m.userFindFirst.mockResolvedValue(operator(['pt']))
})

describe('convertToPersonaLanguage', () => {
  it('renders staff text in the persona language with one detect+translate call', async () => {
    engine({ detected: 'ko', translations: { pt: 'Hoje o café estava ótimo!\n\nRecomendo.' } })
    await expect(convertToPersonaLanguage({ operatorUserId: 'op_1', text: '오늘 카페 최고였어!\n\n추천해.' })).resolves.toEqual({
      text: 'Hoje o café estava ótimo!\n\nRecomendo.',
      language: 'pt',
      converted: true,
      sourceLanguage: 'ko',
    })
    expect(m.translateTexts).toHaveBeenCalledOnce()
    const input = m.translateTexts.mock.calls[0][0]
    expect(input).toMatchObject({ targetLanguages: ['pt'], redetectSourceLanguage: true, isFinal: true })
    // The staff text reaches the model only as a JSON string literal, never raw.
    expect(input.userPromptOverride).toContain(`text=${JSON.stringify('오늘 카페 최고였어!\n\n추천해.')}`)
    expect(input.systemPromptOverride).toContain('line breaks')
  })

  it('is a no-op when the text already is in the persona language', async () => {
    engine({ detected: 'pt', translations: { pt: 'Olá, tudo bem? (reworded)' } })
    await expect(convertToPersonaLanguage({ operatorUserId: 'op_1', text: 'Olá, tudo bem?' })).resolves.toEqual({
      text: 'Olá, tudo bem?',
      language: 'pt',
      converted: false,
      sourceLanguage: 'pt',
    })
  })

  it('still converts persona-language text that is mixed with another language', async () => {
    engine({ detected: 'pt', mixed: true, translations: { pt: 'Olá, que dia bonito!' } })
    await expect(convertToPersonaLanguage({ operatorUserId: 'op_1', text: 'Olá, 오늘 날씨 좋다!' })).resolves.toMatchObject({
      text: 'Olá, que dia bonito!',
      converted: true,
    })
  })

  it('converts persona-language words written in another script', async () => {
    m.userFindFirst.mockResolvedValue(operator(['ja']))
    m.translateTexts.mockResolvedValue({
      translations: { ja: 'りょうかいです' },
      detectedSourceLanguage: 'ja',
      sourceLanguagesMixed: false,
      sourceTextHasForeignScript: true,
      provider: 'gemini',
      model: 'test',
    })
    await expect(convertToPersonaLanguage({ operatorUserId: 'op_1', text: '료카이데스' })).resolves.toMatchObject({
      text: 'りょうかいです',
      language: 'ja',
      converted: true,
    })
  })

  it('skips the engine for blank or emoji-only text', async () => {
    await expect(convertToPersonaLanguage({ operatorUserId: 'op_1', text: '🎉🎉 2026!' })).resolves.toEqual({
      text: '🎉🎉 2026!',
      language: 'pt',
      converted: false,
      sourceLanguage: null,
    })
    expect(m.translateTexts).not.toHaveBeenCalled()
  })

  it('puts Chinese into the persona script and converts the other variant', async () => {
    m.userFindFirst.mockResolvedValue(operator(['zh-TW']))
    // Simplified input for a Traditional persona: detected zh-CN, not a no-op.
    engine({ detected: 'zh', translations: { 'zh-TW': '今天的咖啡很好喝' } })
    const result = await convertToPersonaLanguage({ operatorUserId: 'op_1', text: '今天的咖啡很好喝，推荐这家店' })
    expect(result.language).toBe('zh-TW')
    expect(result.sourceLanguage).toBe('zh-CN')
    expect(result.converted).toBe(true)
    expect(result.text).not.toMatch(/这|推荐/)
  })

  it('resolves a bare zh persona to a variant', () => {
    expect(normalizePersonaLanguage('zh')).toBe('zh-CN')
    expect(normalizePersonaLanguage('pt-BR')).toBe('pt')
    expect(normalizePersonaLanguage('klingon')).toBeNull()
    expect(normalizePersonaLanguage(null)).toBeNull()
  })

  it('refuses a user who is not an operator', async () => {
    m.userFindFirst.mockResolvedValue(null)
    await expect(convertToPersonaLanguage({ operatorUserId: 'user_1', text: 'hi' })).rejects.toBeInstanceOf(
      OperatorAccountRequiredError,
    )
    expect(m.translateTexts).not.toHaveBeenCalled()
  })

  it('refuses an operator without a persona language', async () => {
    m.userFindFirst.mockResolvedValue(operator([]))
    await expect(convertToPersonaLanguage({ operatorUserId: 'op_1', text: 'hi' })).rejects.toBeInstanceOf(
      PersonaLanguageMissingError,
    )
  })

  it('fails retryably when the engine throws or returns no persona text', async () => {
    m.translateTexts.mockRejectedValue(new Error('provider down'))
    await expect(convertToPersonaLanguage({ operatorUserId: 'op_1', text: '안녕' })).rejects.toBeInstanceOf(
      PersonaConversionFailedError,
    )
    engine({ detected: 'ko', translations: { pt: '   ' } })
    await expect(convertToPersonaLanguage({ operatorUserId: 'op_1', text: '안녕' })).rejects.toBeInstanceOf(
      PersonaConversionFailedError,
    )
  })
})
