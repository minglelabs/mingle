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
      })

      expect(result.translations).toEqual({ ko: '안녕하세요', ja: 'こんにちは' })
      expect(result.provider).toBe('gemini')
      expect(result.model).toBe('gemini-3.5-flash-lite')
      expect(result.usage?.promptTokens).toBe(10)
      expect(result.usage?.completionTokens).toBe(20)
      // Not live translation: no Priority tier.
      const request = mockGenerateContent.mock.calls[0]?.[0] as { serviceTier?: string }
      expect(request.serviceTier).toBeUndefined()
    })

    it('runs GPT-6 Luna on the standard tier (no Fast mode) outside live translation', async () => {
      clearTranslationEnv()
      process.env.OPENAI_API_KEY = 'test-openai-key'
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ko":"안녕하세요"}' }, finish_reason: 'stop' }], usage: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))
      vi.stubGlobal('fetch', fetchMock)
      try {
        const { translateTexts } = await import('./translate-texts')
        const result = await translateTexts({
          text: 'Hello',
          sourceLanguage: 'en',
          targetLanguages: ['ko'],
          modelSelection: 'gpt-6-luna',
        })
        expect(result.translations).toEqual({ ko: '안녕하세요' })
        const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
        expect(payload.model).toBe('gpt-6-luna')
        expect(payload.service_tier).toBeUndefined()
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('returns empty translations for empty targetLanguages', async () => {
      const { translateTexts } = await import('./translate-texts')
      const result = await translateTexts({
        text: 'Hello',
        sourceLanguage: 'en',
        targetLanguages: [],
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
        redetectSourceLanguage: true,
      })

      expect(result.detectedSourceLanguage).toBe('ko')
      expect(result.sourceLanguagesMixed).toBe(false)
      expect(result.translations.en).toBe('Hello')
    })
  })

  describe('resolveTranslationProviderConfig()', () => {
    it('maps the retired gemini-2.5-flash-lite selection to GPT-6 Luna', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key'
      const { resolveTranslationProviderConfig } = await import('./translate-texts')
      const result = resolveTranslationProviderConfig('gemini-2.5-flash-lite')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.config.provider).toBe('openai')
        expect(result.config.model).toBe('gpt-6-luna')
      }
    })

    it('defaults to GPT-6 Luna when TRANSLATE_PROVIDER is unset', async () => {
      clearTranslationEnv()
      process.env.OPENAI_API_KEY = 'test-openai-key'
      const { resolveTranslationProviderConfig } = await import('./translate-texts')
      const result = resolveTranslationProviderConfig()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.config.provider).toBe('openai')
        expect(result.config.model).toBe('gpt-6-luna')
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

describe('streamed OpenAI translation', () => {
  it('streams an interim answer, reporting the text so far, and returns the whole answer', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const encoder = new TextEncoder()
    const sse = [
      'data: {"model":"gpt-6-luna","service_tier":"priority","choices":[{"delta":{"content":"{\\"translatedSource\\":\\"Hi.\\","}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\"ko\\":\\"안녕"}}]}\n\ndata: {"choices":[{"delta":{"content":".\\"}"},"finish_reason":"stop"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}}\n\ndata: [DONE]\n\n',
    ]
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of sse) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { resolveTranslationProviderConfig, translateWithOpenAICompatible } = await import('./translate-texts')
      const resolution = resolveTranslationProviderConfig('gpt-6-luna')
      if (!resolution.ok || resolution.config.provider !== 'openai') throw new Error('expected openai config')
      const partials: string[] = []
      const result = await translateWithOpenAICompatible({
        text: 'Hi. How',
        sourceLanguage: 'en',
        targetLanguages: ['ko'],
        provider: 'openai',
        shouldRedetectSourceLanguage: false,
        immediatePreviousTurn: null,
        isFinal: false,
        fast: true,
        bubbleTail: { fixedSource: '', fixedTranslations: {} },
        onPartialContent: (content) => partials.push(content),
      }, resolution.config)
      const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
      expect(payload.stream).toBe(true)
      expect(payload.stream_options).toEqual({ include_usage: true })
      expect(partials.at(-1)).toBe('{"translatedSource":"Hi.","ko":"안녕."}')
      expect(partials.length).toBe(3)
      expect(result?.translations).toEqual({ ko: '안녕.' })
      expect(result?.tailTranslatedSource).toBe('Hi.')
      expect(result?.usage?.totalTokens).toBe(12)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
