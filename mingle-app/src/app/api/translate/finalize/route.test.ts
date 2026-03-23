import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGenerateContent = vi.fn()
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}))
const ensureTrackingContextMock = vi.fn()

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
    getGenerativeModel(config: unknown) {
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

async function importRouteWithEnv() {
  vi.resetModules()
  process.env.GEMINI_API_KEY = 'test-gemini-key'
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

describe('/api/translate/finalize route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureTrackingContextMock.mockReturnValue({
      sessionKey: 'sess_test',
    })
  })

  afterEach(() => {
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
    process.env.GEMINI_API_KEY = 'test-gemini-key'
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
        text: () => '{"fil":"Kamusta","iw":"שלום","zh-cn":"你好"}',
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
      zh: '你好',
    })

    const modelConfig = mockGetGenerativeModel.mock.calls[0]?.[0] as unknown as {
      generationConfig?: { responseSchema?: { required?: string[] } }
    }
    expect(modelConfig.generationConfig?.responseSchema?.required).toEqual(['tl', 'he', 'zh'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('redetects final source language on v1.0.4 routes and returns all selected languages', async () => {
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
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    const { POST } = await import('@/app/api/ios/v1.0.4/translate/finalize/route')

    try {
      const res = await POST(makeJsonRequest({
        text: '안녕하세요',
        sourceLanguage: 'ja',
        targetLanguages: ['en', 'ja', 'ko'],
        isFinal: true,
      }, undefined, 'http://localhost:3000/api/ios/v1.0.4/translate/finalize') as never)
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
    process.env.GEMINI_API_KEY = 'test-gemini-key'
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
