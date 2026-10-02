import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn((_config?: unknown) => ({
  generateContent: mockGenerateContent,
}))

vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    getGenerativeModel(config?: unknown) {
      return mockGetGenerativeModel(config)
    }
  }
  return {
    GoogleGenerativeAI,
    SchemaType: {
      BOOLEAN: 'BOOLEAN',
      STRING: 'STRING',
      OBJECT: 'OBJECT',
    },
  }
})

vi.mock('@/lib/app-analytics', () => {
  const sanitizeNonNegativeInt = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const floored = Math.floor(value)
      return floored >= 0 ? floored : null
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed)) return null
      return parsed >= 0 ? parsed : null
    }
    return null
  }
  return { sanitizeNonNegativeInt }
})

function clearTranslationEnv() {
  delete process.env.TRANSLATE_PROVIDER
  delete process.env.TRANSLATE_MODEL
  delete process.env.TRANSLATE_BASE_URL
  delete process.env.TRANSLATE_API_KEY
  delete process.env.TRANSLATE_EXTRA_BODY
  delete process.env.DEMO_TRANSLATE_PROVIDER
  delete process.env.DEMO_TRANSLATE_MODEL
  delete process.env.DEMO_TRANSLATE_BASE_URL
  delete process.env.DEMO_TRANSLATE_API_KEY
  delete process.env.DEMO_TRANSLATE_EXTRA_BODY
  delete process.env.OPENROUTER_API_KEY
  delete process.env.TOGETHER_API_KEY
  delete process.env.DASHSCOPE_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_BASE_URL
  delete process.env.GEMINI_API_KEY
}

function setGeminiEnv() {
  clearTranslationEnv()
  process.env.TRANSLATE_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
}

describe('translate-texts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setGeminiEnv()
  })

  afterEach(() => {
    clearTranslationEnv()
  })

  describe('translateTexts()', () => {
    it('returns translations from gemini provider', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ ko: '안녕하세요', ja: 'こんにちは' }),
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
          candidates: [],
        },
      })

      const { translateTexts } = await import('./translate-texts')
      const result = await translateTexts({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['ko', 'ja'],
        modelSelection: 'gemini-2.5-flash-lite',
      })

      expect(result.translations).toEqual({ ko: '안녕하세요', ja: 'こんにちは' })
      expect(result.provider).toBe('gemini')
      expect(result.model).toBe('gemini-2.5-flash-lite')
      expect(result.usage?.promptTokens).toBe(10)
      expect(result.usage?.completionTokens).toBe(20)
    })

    it('returns empty translations for empty targetLanguages', async () => {
      const { translateTexts } = await import('./translate-texts')
      const result = await translateTexts({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: [],
        modelSelection: 'gemini-2.5-flash-lite',
      })

      expect(result.translations).toEqual({})
      expect(mockGenerateContent).not.toHaveBeenCalled()
    })

    it('throws when provider returns empty response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => '',
          usageMetadata: {},
          candidates: [],
        },
      })

      const { translateTexts } = await import('./translate-texts')
      await expect(translateTexts({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['ko'],
        modelSelection: 'gemini-2.5-flash-lite',
      })).rejects.toThrow()
    })

    it('returns emptyReason blank_translations when provider returns blanks', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ ko: '' }),
          usageMetadata: {},
          candidates: [],
        },
      })

      const { translateTexts } = await import('./translate-texts')
      const result = await translateTexts({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['ko'],
        modelSelection: 'gemini-2.5-flash-lite',
        isFinal: false,
      })

      expect(result.emptyReason).toBe('blank_translations')
      expect(result.translations).toEqual({})
    })

    it('detects source language when redetectSourceLanguage is true', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            sourceLanguage: 'ko',
            sourceLanguagesMixed: false,
            sourceTextHasForeignScript: false,
            en: 'Hello',
            ja: 'こんにちは',
          }),
          usageMetadata: {},
          candidates: [],
        },
      })

      const { translateTexts } = await import('./translate-texts')
      const result = await translateTexts({
        text: '안녕하세요',
        sourceLanguage: 'ko',
        targetLanguages: ['en', 'ja'],
        modelSelection: 'gemini-2.5-flash-lite',
        redetectSourceLanguage: true,
      })

      expect(result.detectedSourceLanguage).toBe('ko')
      expect(result.sourceLanguagesMixed).toBe(false)
      expect(result.translations.en).toBe('Hello')
    })
  })

  describe('resolveTranslationProviderConfig()', () => {
    it('resolves gemini provider from model selection', async () => {
      const { resolveTranslationProviderConfig } = await import('./translate-texts')
      const result = resolveTranslationProviderConfig('gemini-2.5-flash-lite')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.config.provider).toBe('gemini')
        expect(result.config.model).toBe('gemini-2.5-flash-lite')
      }
    })

    it('returns error for unsupported model', async () => {
      const { resolveTranslationProviderConfig } = await import('./translate-texts')
      const result = resolveTranslationProviderConfig('unknown-model-xyz')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('unsupported_model')
      }
    })

    it('resolves from env when no model selection', async () => {
      const { resolveTranslationProviderConfig } = await import('./translate-texts')
      const result = resolveTranslationProviderConfig()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.config.provider).toBe('gemini')
      }
    })

    it('returns missing_api_key when GEMINI_API_KEY is absent', async () => {
      clearTranslationEnv()
      process.env.TRANSLATE_PROVIDER = 'gemini'

      vi.resetModules()
      const { resolveTranslationProviderConfig } = await import('./translate-texts')
      const result = resolveTranslationProviderConfig()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('missing_api_key')
      }
    })
  })

  describe('buildPrompt()', () => {
    it('builds conversation-style prompt without redetection', async () => {
      const { buildPrompt } = await import('./translate-texts')
      const result = buildPrompt({
        text: 'Hello world',
        sourceLanguage: 'en',
        targetLanguages: ['ko', 'ja'],
        provider: 'gemini',
        shouldRedetectSourceLanguage: false,
        immediatePreviousTurn: null,
        isFinal: true,
      })

      expect(result.systemPrompt).toContain('expert live-conversation translator')
      expect(result.userPrompt).toContain('source=en')
      expect(result.userPrompt).toContain('targets=ko, ja')
      expect(result.userPrompt).toContain('is_final=yes')
    })

    it('builds redetection prompt when enabled', async () => {
      const { buildPrompt } = await import('./translate-texts')
      const result = buildPrompt({
        text: '안녕하세요',
        sourceLanguage: 'ko',
        targetLanguages: ['en', 'ja'],
        provider: 'gemini',
        shouldRedetectSourceLanguage: true,
        immediatePreviousTurn: null,
        isFinal: true,
      })

      expect(result.systemPrompt).toContain('sourceLanguagesMixed')
      expect(result.userPrompt).toContain('language_hints=en, ja')
    })

    it('uses systemPromptOverride and userPromptOverride when provided', async () => {
      const { buildPrompt } = await import('./translate-texts')
      const result = buildPrompt({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: ['ko'],
        provider: 'gemini',
        shouldRedetectSourceLanguage: false,
        immediatePreviousTurn: null,
        isFinal: true,
        systemPromptOverride: 'Custom system prompt',
        userPromptOverride: 'Custom user prompt',
      })

      expect(result.systemPrompt).toBe('Custom system prompt')
      expect(result.userPrompt).toBe('Custom user prompt')
    })
  })

  describe('rate limit cooldown', () => {
    it('remembers and resolves cooldowns', async () => {
      const {
        rememberProviderRateLimitCooldown,
        resolveActiveProviderRateLimitCooldownMs,
        providerRateLimitCooldowns,
      } = await import('./translate-texts')

      providerRateLimitCooldowns.clear()

      const config = { provider: 'gemini' as const, infrastructureProvider: 'google', model: 'gemini-2.5-flash-lite' }
      const error429 = new Error('[429] Too many requests. retryDelay":"10s"')

      const delayMs = rememberProviderRateLimitCooldown(config, error429)
      expect(delayMs).toBe(10_000)

      const cooldownMs = resolveActiveProviderRateLimitCooldownMs(config)
      expect(cooldownMs).not.toBeNull()
      expect(cooldownMs).toBeGreaterThan(0)

      providerRateLimitCooldowns.clear()
    })

    it('does not remember non-rate-limit errors', async () => {
      const { rememberProviderRateLimitCooldown, providerRateLimitCooldowns } = await import('./translate-texts')
      providerRateLimitCooldowns.clear()

      const config = { provider: 'gemini' as const, infrastructureProvider: 'google', model: 'gemini-2.5-flash-lite' }
      const result = rememberProviderRateLimitCooldown(config, new Error('some other error'))
      expect(result).toBeNull()

      providerRateLimitCooldowns.clear()
    })
  })
})
