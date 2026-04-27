import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetServerSession,
  mockUserFindUnique,
  mockAppEventLogFindFirst,
  mockAppMessageFindFirst,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockAppEventLogFindFirst: vi.fn(),
  mockAppMessageFindFirst: vi.fn(),
}))

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn((config?: unknown) => {
  void config
  return {
    generateContent: mockGenerateContent,
  }
})
const ensureTrackingContextMock = vi.fn()

vi.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}))

vi.mock('@/lib/auth-options', () => ({
  getAuthOptions: () => ({}),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
    },
    appEventLog: {
      findFirst: mockAppEventLogFindFirst,
    },
    appMessage: {
      findFirst: mockAppMessageFindFirst,
    },
  },
}))

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

  return {
    ensureTrackingContext: ensureTrackingContextMock,
    sanitizeNonNegativeInt,
  }
})

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

function buildBase64Audio(prefix: 'mpeg' | 'wav' = 'mpeg'): string {
  const bytes = prefix === 'mpeg'
    ? Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00])
    : Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00])
  return bytes.toString('base64')
}

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

function setGeminiTranslateEnv() {
  clearTranslationEnv()
  process.env.TRANSLATE_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
}

function setQwenTranslateEnv(args?: {
  baseUrl?: string
  apiKey?: string
  model?: string
  extraBody?: Record<string, unknown>
}) {
  clearTranslationEnv()
  process.env.TRANSLATE_PROVIDER = 'qwen'
  if (args?.baseUrl) process.env.TRANSLATE_BASE_URL = args.baseUrl
  if (args?.apiKey) process.env.TRANSLATE_API_KEY = args.apiKey
  if (args?.model) process.env.TRANSLATE_MODEL = args.model
  if (args?.extraBody) process.env.TRANSLATE_EXTRA_BODY = JSON.stringify(args.extraBody)
}

async function importRouteWithEnv() {
  vi.resetModules()
  setGeminiTranslateEnv()
  process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
  process.env.INWORLD_TTS_DEFAULT_VOICE_ID = 'Ashley'
  process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-mini'

  const mod = await import('@/app/api/translate/finalize/route')
  return mod.POST
}

async function importRouteWithQwenEnv(args?: {
  baseUrl?: string
  apiKey?: string
  model?: string
  extraBody?: Record<string, unknown>
}) {
  vi.resetModules()
  setQwenTranslateEnv({
    baseUrl: args?.baseUrl ?? 'https://openrouter.ai/api/v1',
    apiKey: args?.apiKey ?? 'test-qwen-key',
    model: args?.model,
    extraBody: args?.extraBody,
  })
  process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
  process.env.INWORLD_TTS_DEFAULT_VOICE_ID = 'Ashley'
  process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-mini'

  const mod = await import('@/app/api/translate/finalize/route')
  return mod.POST
}

function makeJsonRequest(
  body: unknown,
  headers?: Record<string, string>,
  url = 'http://localhost:3000/api/translate/finalize',
): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  })
}

function setAuthenticatedTranslationModel(model: string | null) {
  mockGetServerSession.mockResolvedValue({
    user: {
      id: 'user_123',
      email: 'user@example.com',
    },
  })
  mockUserFindUnique.mockResolvedValue({
    translationModel: model,
  })
}

describe('/api/translate/finalize route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureTrackingContextMock.mockReturnValue({
      sessionKey: 'sess_test',
    })
    mockGetServerSession.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue(null)
    mockAppEventLogFindFirst.mockResolvedValue(null)
    mockAppMessageFindFirst.mockResolvedValue(null)
  })

  afterEach(() => {
    clearTranslationEnv()
    vi.unstubAllGlobals()
  })

  it('returns translations and inline TTS audio when finalize succeeds', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"안녕하세요"}',
        usageMetadata: {
          promptTokenCount: 11,
          candidatesTokenCount: 22,
          totalTokenCount: 33,
        },
      },
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ voices: [{ voiceId: 'KoVoice' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          audioContent: `data:audio/mpeg;base64,${buildBase64Audio('mpeg')}`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      tts: {
        enabled: true,
        language: 'ko',
      },
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.translations).toEqual({ ko: '안녕하세요' })
    expect(json.provider).toBe('gemini')
    expect(json.ttsLanguage).toBe('ko')
    expect(json.ttsVoiceId).toBe('KoVoice')
    expect(typeof json.ttsAudioBase64).toBe('string')
    expect(json.ttsAudioMime).toBe('audio/mpeg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses previous-state fallback when provider returns empty response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ voices: [{ voiceId: 'KoVoice' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          audioContent: `data:audio/mpeg;base64,${buildBase64Audio('mpeg')}`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: false,
      currentTurnPreviousState: {
        sourceLanguage: 'en',
        sourceText: 'hello',
        translations: {
          ko: '이전 번역',
        },
      },
      tts: {
        enabled: true,
        language: 'ko',
      },
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.usedFallbackFromPreviousState).toBe(true)
    expect(json.translations).toEqual({ ko: '이전 번역' })
    expect(typeof json.ttsAudioBase64).toBe('string')
    expect(json.ttsAudioMime).toBe('audio/mpeg')
  })

  it('uses previous-state fallback for blank interim Gemini JSON while keeping diagnostic logs', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"en":" ","ko":" "}',
        usageMetadata: {},
      },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    try {
      const res = await POST(makeJsonRequest({
        text: 'これは',
        sourceLanguage: 'ja',
        targetLanguages: ['en', 'ko'],
        isFinal: false,
        currentTurnPreviousState: {
          sourceLanguage: 'ja',
          sourceText: 'これは',
          translations: {
            en: 'previous English',
            ko: '이전 한국어',
          },
        },
      }) as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.usedFallbackFromPreviousState).toBe(true)
      expect(json.translations).toEqual({
        en: 'previous English',
        ko: '이전 한국어',
      })
      expect(json.provider).toBe('gemini')
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] gemini_blank_translations',
      ))
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] gemini_unparseable_json',
      ))
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] provider_empty_response',
      ))
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[translate/finalize] fallback_from_current_turn_previous_state',
        expect.objectContaining({
          fallbackLanguages: ['en', 'ko'],
          reason: 'blank_translations',
        }),
      )
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
      consoleWarnSpy.mockRestore()
    }
  })

  it('returns partial interim provider translations while logging missing targets', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ja":"こんにちは"}',
        usageMetadata: {},
      },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    try {
      const res = await POST(makeJsonRequest({
        text: '今日は長めの途中テキスト',
        sourceLanguage: 'ko',
        targetLanguages: ['en', 'ja'],
        isFinal: false,
      }) as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.translations).toEqual({
        ja: 'こんにちは',
      })
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] missing_target_languages',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"missingTargetLanguages":["en"]',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"returnedLanguages":["ja"]',
      ))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('fills missing interim target languages from previous state without discarding returned translations', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ja":"こんにちは"}',
        usageMetadata: {},
      },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    try {
      const res = await POST(makeJsonRequest({
        text: '今日は長めの途中テキスト',
        sourceLanguage: 'ko',
        targetLanguages: ['en', 'ja'],
        isFinal: false,
        currentTurnPreviousState: {
          sourceLanguage: 'ko',
          sourceText: '今日は長めの途中テキスト',
          translations: {
            en: 'previous English',
            ja: '前の日本語',
          },
        },
      }) as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.usedFallbackFromPreviousState).toBe(true)
      expect(json.translations).toEqual({
        en: 'previous English',
        ja: 'こんにちは',
      })
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] missing_target_languages',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"missingTargetLanguages":["en"]',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"returnedLanguages":["ja"]',
      ))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('does not mark missing interim targets as fallback when previous state cannot fill them', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ja":"こんにちは"}',
        usageMetadata: {},
      },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    try {
      const res = await POST(makeJsonRequest({
        text: '今日は長めの途中テキスト',
        sourceLanguage: 'ko',
        targetLanguages: ['en', 'ja'],
        isFinal: false,
        currentTurnPreviousState: {
          sourceLanguage: 'ko',
          sourceText: '今日は長めの途中テキスト',
          translations: {
            ja: '前の日本語',
          },
        },
      }) as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.usedFallbackFromPreviousState).toBeUndefined()
      expect(json.translations).toEqual({
        ja: 'こんにちは',
      })
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] missing_target_languages',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"missingTargetLanguages":["en"]',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"returnedLanguages":["ja"]',
      ))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('does not issue a second provider request for missing final target languages', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ja":"こんにちは"}',
        usageMetadata: {},
      },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    try {
      const res = await POST(makeJsonRequest({
        text: 'こんにちは',
        sourceLanguage: 'ko',
        targetLanguages: ['en', 'ja'],
        isFinal: true,
      }) as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.translations).toEqual({
        ja: 'こんにちは',
      })
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] missing_target_languages',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"missingTargetLanguages":["en"]',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"returnedLanguages":["ja"]',
      ))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('keeps blank final Gemini JSON as a 502 response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"th":" "}',
        usageMetadata: {},
      },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    try {
      const res = await POST(makeJsonRequest({
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguages: ['th'],
        isFinal: true,
      }) as never)
      const json = await res.json()

      expect(res.status).toBe(502)
      expect(json).toEqual({ error: 'empty_translation_response' })
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] gemini_blank_translations',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] provider_empty_response',
      ))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('retries once on transient provider errors before succeeding', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error(
        '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
      ))
      .mockResolvedValueOnce({
        response: {
          text: () => '{"ko":"안녕하세요"}',
          usageMetadata: {
            promptTokenCount: 11,
            candidatesTokenCount: 22,
            totalTokenCount: 33,
          },
        },
      })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.translations).toEqual({ ko: '안녕하세요' })
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not immediately retry gemini rate-limit errors when the provider asks for a long retry delay', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error(
      '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent: [429 Too Many Requests] You exceeded your current quota, please check your plan and billing details. Please retry in 23.05747353s. [{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"23s"}]',
    ))

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
      translationModel: 'gemma-4-31b-it',
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(502)
    expect(json).toEqual({ error: 'empty_translation_response' })
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an error for repeated gemma requests while a long provider retry delay is still active', async () => {
    setAuthenticatedTranslationModel('gemma-4-31b-it')
    let nowMs = 1_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => nowMs)

    mockGenerateContent.mockRejectedValueOnce(new Error(
      '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent: [429 Too Many Requests] You exceeded your current quota, please check your plan and billing details. Please retry in 59.616803365s. [{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"59s"}]',
    ))

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    try {
      const firstResponse = await POST(makeJsonRequest({
        text: 'Like that.',
        sourceLanguage: 'en',
        targetLanguages: ['ko', 'ja'],
        isFinal: false,
      }) as never)
      const firstJson = await firstResponse.json()

      expect(firstResponse.status).toBe(502)
      expect(firstJson).toEqual({ error: 'empty_translation_response' })
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)

      nowMs += 1_000

      const secondResponse = await POST(makeJsonRequest({
        text: 'Like that.',
        sourceLanguage: 'en',
        targetLanguages: ['ko', 'ja'],
        isFinal: false,
        currentTurnPreviousState: {
          sourceLanguage: 'en',
          sourceText: 'Like that.',
          translations: {
            ko: '그렇게.',
            ja: 'そんなふうに。',
          },
        },
      }) as never)
      const secondJson = await secondResponse.json()

      expect(secondResponse.status).toBe(502)
      expect(secondJson).toEqual({ error: 'empty_translation_response' })
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('does not retry openai-compatible 429 errors when no retry delay is provided', async () => {
    setAuthenticatedTranslationModel('qwen/qwen3.5-9b')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          error: {
            message: 'Provider returned error',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithQwenEnv({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'qwen/qwen3.5-9b',
    })

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(502)
    expect(json).toEqual({ error: 'empty_translation_response' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('returns provider translations as-is even when they match the source text', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"en":"Ek","ko":"Ek","ja":"Ek"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'Ek',
      sourceLanguage: 'af',
      targetLanguages: ['en', 'ko', 'ja'],
      isFinal: false,
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.translations).toEqual({
      en: 'Ek',
      ko: 'Ek',
      ja: 'Ek',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('supports qwen via an OpenAI-compatible endpoint and strips think blocks', async () => {
    setAuthenticatedTranslationModel('qwen/qwen3.5-9b')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '<think>\ninternal reasoning\n</think>\n```json\n{"ko":"안녕하세요"}\n```',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 14,
            completion_tokens: 9,
            total_tokens: 23,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithQwenEnv({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'qwen/qwen3.5-9b',
    })

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('qwen')
    expect(json.infrastructureProvider).toBe('openrouter')
    expect(json.model).toBe('qwen/qwen3.5-9b')
    expect(json.translationPromptTokens).toBe(14)
    expect(json.translationCompletionTokens).toBe(9)
    expect(json.translationTotalTokens).toBe(23)
    expect(json.translations).toEqual({ ko: '안녕하세요' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    )

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(requestInit.body)) as {
      model?: string
      messages?: Array<{ role?: string, content?: string }>
      extra_body?: Record<string, unknown>
      response_format?: Record<string, unknown>
      reasoning?: Record<string, unknown>
    }
    const headers = requestInit.headers as Record<string, string>

    expect(headers.Authorization).toBe('Bearer test-qwen-key')
    expect(headers['X-Title']).toBe('mingle-app')
    expect(body.model).toBe('qwen/qwen3.5-9b')
    expect(body.extra_body).toBeUndefined()
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'translate_finalize_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            ko: {
              type: 'string',
              description: 'Translated text for ko.',
            },
          },
          required: ['ko'],
          additionalProperties: false,
        },
      },
    })
    expect(body.reasoning).toEqual({
      effort: 'none',
      exclude: true,
    })
    expect(body.messages?.[0]?.role).toBe('system')
    expect(body.messages?.[1]?.role).toBe('user')
  })

  it('uses a longer timeout for non-final qwen openrouter requests', async () => {
    setAuthenticatedTranslationModel('qwen/qwen3.5-9b')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"en":"no","ja":"いいえ"}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController()
      ;(controller.signal as AbortSignal & { __timeoutMs?: number }).__timeoutMs = ms
      return controller.signal
    })

    try {
      const POST = await importRouteWithQwenEnv({
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'qwen/qwen3.5-9b',
      })

      const res = await POST(makeJsonRequest({
        text: '아니',
        sourceLanguage: 'ko',
        targetLanguages: ['en', 'ja'],
        isFinal: false,
      }) as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.translations).toEqual({ en: 'no', ja: 'いいえ' })
      const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(timeoutSpy).toHaveBeenCalledWith(4_000)
      expect((requestInit.signal as AbortSignal & { __timeoutMs?: number }).__timeoutMs).toBe(4_000)
    } finally {
      timeoutSpy.mockRestore()
    }
  })

  it('supports gemma 4 via the Google Generative AI SDK when selected in account preferences', async () => {
    setAuthenticatedTranslationModel('gemma-4-31b-it')
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"안녕하세요"}',
        usageMetadata: {
          promptTokenCount: 11,
          candidatesTokenCount: 22,
          totalTokenCount: 33,
        },
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('gemma')
    expect(json.infrastructureProvider).toBe('google')
    expect(json.model).toBe('gemma-4-31b-it')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()

    const modelConfig = mockGetGenerativeModel.mock.calls[0]?.[0] as unknown as { model?: string }
    expect(modelConfig.model).toBe('gemma-4-31b-it')
  })

  it('uses the request translation model before falling back to the DB preference lookup', async () => {
    setAuthenticatedTranslationModel('qwen/qwen3.5-9b')
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"안녕하세요"}',
        usageMetadata: {},
      },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"ko":"안녕하세요"}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setGeminiTranslateEnv()
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
    process.env.INWORLD_TTS_DEFAULT_VOICE_ID = 'Ashley'
    process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-mini'

    const { POST } = await import('@/app/api/translate/finalize/route')

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
      translationModel: 'gemini-2.5-flash-lite',
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('gemini')
    expect(json.infrastructureProvider).toBe('google')
    expect(json.model).toBe('gemini-2.5-flash-lite')
    expect(mockGetServerSession).not.toHaveBeenCalled()
    expect(mockUserFindUnique).not.toHaveBeenCalled()
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the authenticated user gemini translation model from DB even when env prefers qwen', async () => {
    setAuthenticatedTranslationModel('gemini-2.5-flash-lite')
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"안녕하세요"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setQwenTranslateEnv({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-qwen-key',
      model: 'qwen/qwen3.5-9b',
    })
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
    process.env.INWORLD_TTS_DEFAULT_VOICE_ID = 'Ashley'
    process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-mini'

    const { POST } = await import('@/app/api/translate/finalize/route')

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('gemini')
    expect(json.infrastructureProvider).toBe('google')
    expect(json.model).toBe('gemini-2.5-flash-lite')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the tracking user translation model from DB for non-final requests without an auth session', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockUserFindUnique.mockImplementation(async (args: { where?: Record<string, string> }) => {
      if (args.where?.externalUserId === 'anon_test_user') {
        return { translationModel: 'qwen/qwen3.5-9b' }
      }
      return null
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"ko":"안녕하세요"}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setGeminiTranslateEnv()
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
    process.env.INWORLD_TTS_DEFAULT_VOICE_ID = 'Ashley'
    process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-mini'

    const { POST } = await import('@/app/api/translate/finalize/route')

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: false,
    }, {
      'x-mingle-user-id': 'anon_test_user',
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('qwen')
    expect(json.infrastructureProvider).toBe('openrouter')
    expect(json.model).toBe('qwen/qwen3.5-9b')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('uses the session-linked tracking user translation model for non-final requests when user id cookies are unavailable', async () => {
    mockGetServerSession.mockResolvedValue(null)
    mockAppEventLogFindFirst.mockResolvedValue({ userId: 'user_from_session' })
    mockUserFindUnique.mockImplementation(async (args: { where?: Record<string, string> }) => {
      if (args.where?.id === 'user_from_session') {
        return { translationModel: 'qwen/qwen3.5-9b' }
      }
      return null
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"ko":"안녕하세요"}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setGeminiTranslateEnv()
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
    process.env.INWORLD_TTS_DEFAULT_VOICE_ID = 'Ashley'
    process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-mini'

    const { POST } = await import('@/app/api/translate/finalize/route')

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: false,
      sessionKey: 'sess_test_user',
    }, {
      'x-mingle-session-key': 'sess_test_user',
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('qwen')
    expect(json.infrastructureProvider).toBe('openrouter')
    expect(json.model).toBe('qwen/qwen3.5-9b')
    expect(mockAppEventLogFindFirst).toHaveBeenCalledWith({
      where: {
        sessionKey: 'sess_test_user',
        userId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { userId: true },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('defaults qwen to OpenRouter when only TRANSLATE_API_KEY is set', async () => {
    setAuthenticatedTranslationModel('qwen/qwen3.5-9b')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"ko":"안녕하세요"}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setQwenTranslateEnv({
      apiKey: 'test-qwen-key',
      model: 'qwen/qwen3.5-9b',
    })
    delete process.env.TRANSLATE_BASE_URL
    process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
    process.env.INWORLD_TTS_DEFAULT_VOICE_ID = 'Ashley'
    process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-mini'
    const { POST } = await import('@/app/api/translate/finalize/route')

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('qwen')
    expect(json.model).toBe('qwen/qwen3.5-9b')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/v1/chat/completions')

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(requestInit.body)) as {
      response_format?: Record<string, unknown>
      reasoning?: Record<string, unknown>
    }
    const headers = requestInit.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-qwen-key')
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'translate_finalize_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            ko: {
              type: 'string',
              description: 'Translated text for ko.',
            },
          },
          required: ['ko'],
          additionalProperties: false,
        },
      },
    })
    expect(body.reasoning).toEqual({
      effort: 'none',
      exclude: true,
    })
  })

  it('uses a redetect json schema for qwen OpenRouter requests on versioned routes', async () => {
    setAuthenticatedTranslationModel('qwen/qwen3.5-9b')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"sourceLanguage":"ko","sourceLanguagesMixed":false,"sourceTextHasForeignScript":false,"en":"Hello","ja":"こんにちは","ko":"안녕하세요"}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setQwenTranslateEnv({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-qwen-key',
      model: 'qwen/qwen3.5-9b',
    })
    process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
    process.env.INWORLD_TTS_DEFAULT_VOICE_ID = 'Ashley'
    process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-1.5-mini'

    const { POST } = await import('@/app/api/ios/v1.0.6/translate/finalize/route')

    const res = await POST(makeJsonRequest({
      text: '그래도 느리네.',
      sourceLanguage: 'ko',
      targetLanguages: ['en', 'ja', 'ko'],
      isFinal: true,
    }, undefined, 'http://localhost:3000/api/ios/v1.0.6/translate/finalize') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('qwen')
    expect(json.sourceLanguage).toBe('ko')
    expect(json.sourceLanguagesMixed).toBe(false)
    expect(json.sourceTextHasForeignScript).toBe(false)
    expect(json.translations).toEqual({
      en: 'Hello',
      ja: 'こんにちは',
      ko: '안녕하세요',
    })

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(requestInit.body)) as {
      response_format?: Record<string, unknown>
    }
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'translate_finalize_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            sourceLanguage: {
              type: 'string',
              description: 'Detected source language code.',
            },
            sourceLanguagesMixed: {
              type: 'boolean',
              description: 'Whether the current utterance meaningfully mixes multiple source languages.',
            },
            sourceTextHasForeignScript: {
              type: 'boolean',
              description: 'Whether the current utterance contains substantive foreign script for the detected source language.',
            },
            en: {
              type: 'string',
              description: 'Translated text for en.',
            },
            ja: {
              type: 'string',
              description: 'Translated text for ja.',
            },
            ko: {
              type: 'string',
              description: 'Translated text for ko.',
            },
          },
          required: [
            'sourceLanguage',
            'sourceLanguagesMixed',
            'sourceTextHasForeignScript',
            'en',
            'ja',
            'ko',
          ],
          additionalProperties: false,
        },
      },
    })
  })

  it('falls back to previous-state translations for non-final qwen provider errors', async () => {
    setAuthenticatedTranslationModel('qwen/qwen3.5-9b')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          error: {
            message: 'Provider returned error',
            code: 503,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithQwenEnv({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'qwen/qwen3.5-9b',
    })

    const res = await POST(makeJsonRequest({
      text: '응',
      sourceLanguage: 'ko',
      targetLanguages: ['en', 'ja'],
      isFinal: false,
      currentTurnPreviousState: {
        sourceLanguage: 'ko',
        sourceText: '응',
        translations: {
          en: 'Yeah.',
          ja: 'うん。',
        },
      },
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.usedFallbackFromPreviousState).toBe(true)
    expect(json.translations).toEqual({
      en: 'Yeah.',
      ja: 'うん。',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the default model when the user has no stored translation model', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user_123',
        email: 'user@example.com',
      },
    })
    mockUserFindUnique.mockResolvedValue({
      translationModel: null,
    })
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"안녕하세요"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.provider).toBe('gemini')
    expect(json.model).toBe('gemini-2.5-flash-lite')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when text is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: '   ',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json).toEqual({ error: 'text is required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('supports provider_empty fault mode for e2e fallback checks', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"정상 번역"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: false,
      __testFaultMode: 'provider_empty',
      currentTurnPreviousState: {
        sourceLanguage: 'en',
        sourceText: 'hello',
        translations: {
          ko: 'fallback-value',
        },
      },
    }, {
      'x-mingle-live-test': '1',
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.usedFallbackFromPreviousState).toBe(true)
    expect(json.translations).toEqual({ ko: 'fallback-value' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('supports target_miss fault mode for e2e fallback checks', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"정상 번역"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko', 'ja'],
      isFinal: false,
      __testFaultMode: 'target_miss',
      currentTurnPreviousState: {
        sourceLanguage: 'en',
        sourceText: 'hello',
        translations: {
          ko: 'fallback-ko',
          ja: 'fallback-ja',
        },
      },
    }, {
      'x-mingle-live-test': '1',
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.usedFallbackFromPreviousState).toBe(true)
    expect(json.translations).toEqual({
      ko: 'fallback-ko',
      ja: 'fallback-ja',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not reuse previous-state fallback for final requests', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      isFinal: true,
      currentTurnPreviousState: {
        sourceLanguage: 'en',
        sourceText: 'hello',
        translations: {
          ko: 'partial fallback...',
        },
      },
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(502)
    expect(json).toEqual({ error: 'empty_translation_response' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('logs versioned route context when returning 502', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '',
        usageMetadata: {},
      },
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setGeminiTranslateEnv()
    const { POST } = await import('@/app/api/ios/v1.0.2/translate/finalize/route')

    try {
      const res = await POST(makeJsonRequest({
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguages: ['ko'],
        isFinal: true,
      }, undefined, 'http://localhost:3000/api/ios/v1.0.2/translate/finalize') as never)
      const json = await res.json()

      expect(res.status).toBe(502)
      expect(json).toEqual({ error: 'empty_translation_response' })
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '[translate/finalize] provider_empty_response',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(
        '"path":"/api/ios/v1.0.2/translate/finalize"',
      ))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"method":"POST"'))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"sourceLanguage":"en"'))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"targetLanguages":["ko"]'))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"isFinal":true'))
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"responseStatus":502'))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('accepts canonicalized target language aliases in requests and model responses', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"fil":"Kamusta","iw":"שלום","zh-tw":"你好"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en-US',
      targetLanguages: ['fil-PH', 'iw-IL', 'zh-TW'],
    }) as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.translations).toEqual({
      tl: 'Kamusta',
      he: 'שלום',
      'zh-TW': '你好',
    })

    const modelConfig = mockGetGenerativeModel.mock.calls[0]?.[0] as unknown as {
      generationConfig?: { responseSchema?: { required?: string[] } }
    }
    expect(modelConfig.generationConfig?.responseSchema?.required).toEqual(['tl', 'he', 'zh-TW'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'iOS v1.0.4',
      loadRoute: () => import('@/app/api/ios/v1.0.4/translate/finalize/route'),
      url: 'http://localhost:3000/api/ios/v1.0.4/translate/finalize',
    },
    {
      label: 'Android v1.0.5',
      loadRoute: () => import('@/app/api/android/v1.0.5/translate/finalize/route'),
      url: 'http://localhost:3000/api/android/v1.0.5/translate/finalize',
    },
    {
      label: 'Android v1.0.6',
      loadRoute: () => import('@/app/api/android/v1.0.6/translate/finalize/route'),
      url: 'http://localhost:3000/api/android/v1.0.6/translate/finalize',
    },
    {
      label: 'Android v1.0.7',
      loadRoute: () => import('@/app/api/android/v1.0.7/translate/finalize/route'),
      url: 'http://localhost:3000/api/android/v1.0.7/translate/finalize',
    },
    {
      label: 'Android v1.0.8',
      loadRoute: () => import('@/app/api/android/v1.0.8/translate/finalize/route'),
      url: 'http://localhost:3000/api/android/v1.0.8/translate/finalize',
    },
    {
      label: 'Android v1.0.9',
      loadRoute: () => import('@/app/api/android/v1.0.9/translate/finalize/route'),
      url: 'http://localhost:3000/api/android/v1.0.9/translate/finalize',
    },
    {
      label: 'Android v1.0.11',
      loadRoute: () => import('@/app/api/android/v1.0.11/translate/finalize/route'),
      url: 'http://localhost:3000/api/android/v1.0.11/translate/finalize',
    },
    {
      label: 'iOS v1.0.6',
      loadRoute: () => import('@/app/api/ios/v1.0.6/translate/finalize/route'),
      url: 'http://localhost:3000/api/ios/v1.0.6/translate/finalize',
    },
    {
      label: 'iOS v1.0.7',
      loadRoute: () => import('@/app/api/ios/v1.0.7/translate/finalize/route'),
      url: 'http://localhost:3000/api/ios/v1.0.7/translate/finalize',
    },
    {
      label: 'iOS v1.0.8',
      loadRoute: () => import('@/app/api/ios/v1.0.8/translate/finalize/route'),
      url: 'http://localhost:3000/api/ios/v1.0.8/translate/finalize',
    },
    {
      label: 'iOS v1.0.9',
      loadRoute: () => import('@/app/api/ios/v1.0.9/translate/finalize/route'),
      url: 'http://localhost:3000/api/ios/v1.0.9/translate/finalize',
    },
    {
      label: 'iOS v1.0.11',
      loadRoute: () => import('@/app/api/ios/v1.0.11/translate/finalize/route'),
      url: 'http://localhost:3000/api/ios/v1.0.11/translate/finalize',
    },
  ])('redetects final source language on $label routes and returns all selected languages', async ({ loadRoute, url }) => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"sourceLanguage":"ko","sourceLanguagesMixed":false,"sourceTextHasForeignScript":false,"ko":"안녕하세요","ja":"こんにちは","en":"Hello"}',
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 18,
          totalTokenCount: 30,
        },
      },
    })

    const fetchMock = vi.fn()
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setGeminiTranslateEnv()
    const { POST } = await loadRoute()

    try {
      const res = await POST(makeJsonRequest({
        text: '안녕하세요',
        sourceLanguage: 'ja',
        targetLanguages: ['en', 'ja', 'ko'],
        isFinal: true,
      }, undefined, url) as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.sourceLanguage).toBe('ko')
      expect(json.sourceLanguagesMixed).toBe(false)
      expect(json.sourceTextHasForeignScript).toBe(false)
      expect(json.translations).toEqual({
        en: 'Hello',
        ja: 'こんにちは',
        ko: '안녕하세요',
      })

      const userPrompt = String(mockGenerateContent.mock.calls[0]?.[0] ?? '')
      expect(userPrompt).toContain('language_hints=en, ja, ko')
      expect(userPrompt).toContain('sourceLanguage=ja')
      expect(userPrompt).not.toContain('detect_source_language=')
      expect(userPrompt).not.toContain('is_final=')
      expect(userPrompt).not.toContain('If is_final=no')

      const modelConfig = mockGetGenerativeModel.mock.calls[0]?.[0] as unknown as {
        systemInstruction?: string
        generationConfig?: { responseSchema?: { required?: string[] } }
      }
      expect(modelConfig.systemInstruction).toContain(
        'Treat language_hints as reference-only hints, not a constraint. If the current text clearly indicates a different source language, choose that language even when it is not included in language_hints.',
      )
      expect(modelConfig.systemInstruction).toContain(
        'Only if the provided sourceLanguage clearly seems wrong for the current text, replace it with the source language that best matches the current text.',
      )
      expect(modelConfig.systemInstruction).toContain(
        'choose that language even when it is not included in language_hints.',
      )
      expect(modelConfig.systemInstruction).toContain(
        'For example, if "료카이데스" is given sourceLanguage=ko, it should be corrected to Japanese because it is Korean script that phonetically represents Japanese speech.',
      )
      expect(modelConfig.systemInstruction).toContain(
        'Set sourceLanguagesMixed=true only when the current text itself meaningfully mixes two or more languages within the same utterance; otherwise set it to false. For example, in "そんな답답해서 죽겠다고 내가 진짜로.", sourceLanguagesMixed should be true.',
      )
      expect(modelConfig.systemInstruction).toContain(
        'Set sourceTextHasForeignScript=true only when the current text contains substantive non-source-language characters or script for the chosen sourceLanguage; otherwise set it to false. Ignore spaces, punctuation, and digits.',
      )
      expect(modelConfig.systemInstruction).toContain(
        'For example, in "そんな답답해서 죽겠다고 내가 진짜로.", sourceTextHasForeignScript should be true, and if sourceLanguage is Japanese, "료카이데스" should also set sourceTextHasForeignScript=true because it is written in Hangul rather than Japanese script.',
      )
      expect(modelConfig.systemInstruction).not.toContain(
        'Because is_final=yes in this mode, translate the full final text from scratch.',
      )
      expect(modelConfig.generationConfig?.responseSchema?.required).toEqual([
        'sourceLanguage',
        'sourceLanguagesMixed',
        'sourceTextHasForeignScript',
        'en',
        'ja',
        'ko',
      ])
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[translate/finalize] prompt',
        expect.objectContaining({
          sourceLanguage: 'ja',
          shouldRedetectSourceLanguage: true,
          targetLanguages: ['en', 'ja', 'ko'],
          systemPrompt: expect.not.stringContaining('\n'),
          userPrompt: expect.not.stringContaining('\n'),
        }),
      )
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[translate/finalize] gemini_response',
        expect.objectContaining({
          shouldRedetectSourceLanguage: true,
          provider: 'gemini',
          model: 'gemini-2.5-flash-lite',
          rawResponse: '{"sourceLanguage":"ko","sourceLanguagesMixed":false,"sourceTextHasForeignScript":false,"ko":"안녕하세요","ja":"こんにちは","en":"Hello"}',
          usage: {
            input_tokens: 12,
            output_tokens: 18,
            total_tokens: 30,
          },
        }),
      )
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      consoleInfoSpy.mockRestore()
    }
  })

  it('accepts declared redetected source language without retry when source text is lightly rewritten', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{\n  "sourceLanguage": "ko",\n  "ko": "먼저 14년이 지났다는 것을",\n  "ja": "まず14年が経ったことを",\n  "en": "First, that 14 years have passed"\n}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.resetModules()
    setGeminiTranslateEnv()
    const { POST } = await import('@/app/api/ios/v1.0.4/translate/finalize/route')

    try {
      const res = await POST(makeJsonRequest({
        text: '先に14年経ったことを',
        targetLanguages: ['ko', 'ja', 'en'],
        isFinal: true,
      }, undefined, 'http://localhost:3000/api/ios/v1.0.4/translate/finalize') as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.sourceLanguage).toBe('ko')
      expect(json.translations).toEqual({
        ko: '먼저 14년이 지났다는 것을',
        ja: 'まず14年が経ったことを',
        en: 'First, that 14 years have passed',
      })
      expect(mockGenerateContent).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('builds compact prompt with previous state first and no recent-turns section', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"안녕하세요"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      currentTurnPreviousState: {
        sourceLanguage: 'en',
        sourceText: 'hello-before',
        translations: {
          ko: '이전 번역',
        },
      },
      immediatePreviousTurn: {
        sourceLanguage: 'en',
        sourceText: 'just before this',
        translations: {
          ko: '직전 번역',
        },
        ageMs: 3000,
      },
      recentTurns: [
        {
          sourceLanguage: 'en',
          sourceText: 'old recent context should be ignored',
          translations: { ko: '무시됨' },
          ageMs: 2000,
        },
      ],
    }) as never)

    expect(res.status).toBe(200)

    const userPrompt = String(mockGenerateContent.mock.calls[0]?.[0] ?? '')
    const immediateIndex = userPrompt.indexOf('Immediate previous turn (~3s ago):')

    expect(immediateIndex).toBeGreaterThanOrEqual(0)
    expect(userPrompt).not.toContain('Previous state of current turn:')
    expect(userPrompt).not.toContain('hello-before')
    expect(userPrompt).not.toContain('이전 번역')
    expect(userPrompt).not.toContain('Recent turns (last 10s):')
    expect(userPrompt).not.toContain('Context reliability:')
    expect(userPrompt).toContain('  Translations:')
    expect(userPrompt).not.toContain('old recent context should be ignored')

    const modelConfig = mockGetGenerativeModel.mock.calls[0]?.[0] as unknown as { systemInstruction?: string }
    expect(modelConfig.systemInstruction).toBe([
      'You are an expert live-conversation translator.',
      'Return ONLY strict JSON with keys exactly matching target language codes.',
      'No explanations, no markdown, no extra keys.',
      'Always translate the ENTIRE current text as a standalone translation for each target language.',
      'Never return only a suffix, delta, patch, completion fragment, or continuation.',
      'If is_final=yes, translate the full final text from scratch, not an incremental update.',
    ].join('\n'))
  })

  it('omits immediate previous turn when age exceeds 5 seconds', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"안녕하세요"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      immediatePreviousTurn: {
        sourceLanguage: 'en',
        sourceText: 'too old turn',
        translations: {
          ko: '오래된 턴',
        },
        ageMs: 6001,
      },
    }) as never)

    expect(res.status).toBe(200)

    const userPrompt = String(mockGenerateContent.mock.calls[0]?.[0] ?? '')
    expect(userPrompt).not.toContain('Immediate previous turn')
  })

  it('omits immediate previous turn when ageMs is missing', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ko":"안녕하세요"}',
        usageMetadata: {},
      },
    })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const POST = await importRouteWithEnv()

    const res = await POST(makeJsonRequest({
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguages: ['ko'],
      immediatePreviousTurn: {
        sourceLanguage: 'en',
        sourceText: 'turn without age',
        translations: {
          ko: 'age 없는 턴',
        },
      },
    }) as never)

    expect(res.status).toBe(200)

    const userPrompt = String(mockGenerateContent.mock.calls[0]?.[0] ?? '')
    expect(userPrompt).not.toContain('Immediate previous turn')
    expect(userPrompt).not.toContain('turn without age')
  })
})
