import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TTS_ENV_KEYS = [
  'TTS_PROVIDER',
  'GEMINI_API_KEY',
  'GEMINI_TTS_MODEL',
  'GEMINI_TTS_VOICE',
  'GEMINI_TTS_TIMEOUT_MS',
  'INWORLD_JWT',
  'INWORLD_BASIC',
  'INWORLD_BASIC_KEY',
  'INWORLD_RUNTIME_BASE64_CREDENTIAL',
  'INWORLD_BASIC_CREDENTIAL',
  'INWORLD_API_KEY',
  'INWORLD_API_SECRET',
  'INWORLD_TTS_MODEL_ID',
  'INWORLD_TTS_SPEAKING_RATE',
  'INWORLD_TTS_DEFAULT_VOICE_ID',
] as const

const savedEnv: Record<string, string | undefined> = {}

const MP3_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00])

function wavBytes(): Buffer {
  const b = Buffer.alloc(48)
  b.write('RIFF', 0, 'ascii')
  b.write('WAVE', 8, 'ascii')
  return b
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function inworldAudioResponse(): Response {
  return jsonResponse({ audioContent: MP3_BYTES.toString('base64') })
}

function geminiAudioResponse(audio: Buffer, mimeType?: string): Response {
  return jsonResponse({
    id: 'interaction-1',
    steps: [
      {
        type: 'model_output',
        content: [{ type: 'audio', data: audio.toString('base64'), ...(mimeType ? { mime_type: mimeType } : {}) }],
      },
    ],
  })
}

function urlOf(call: unknown[]): string {
  return String(call[0])
}

function bodyOf(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

async function loadModule() {
  vi.resetModules()
  return await import('@/server/api/shared/tts-provider')
}

beforeEach(() => {
  for (const key of TTS_ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of TTS_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('resolveTtsProvider', () => {
  it('defaults to inworld when TTS_PROVIDER is unset or invalid', async () => {
    const { resolveTtsProvider } = await loadModule()
    expect(resolveTtsProvider()).toBe('inworld')
    process.env.TTS_PROVIDER = 'elevenlabs'
    expect(resolveTtsProvider()).toBe('inworld')
  })

  it('uses TTS_PROVIDER env and lets a valid override win', async () => {
    const { resolveTtsProvider } = await loadModule()
    process.env.TTS_PROVIDER = 'gemini'
    expect(resolveTtsProvider()).toBe('gemini')
    expect(resolveTtsProvider('inworld')).toBe('inworld')
    expect(resolveTtsProvider(' Gemini ')).toBe('gemini')
  })

  it('ignores invalid overrides', async () => {
    const { resolveTtsProvider } = await loadModule()
    expect(resolveTtsProvider('openai')).toBe('inworld')
    expect(resolveTtsProvider(123)).toBe('inworld')
    process.env.TTS_PROVIDER = 'gemini'
    expect(resolveTtsProvider({ provider: 'inworld' })).toBe('gemini')
  })
})

describe('synthesizeSpeech — inworld (default)', () => {
  it('sends the same Inworld request as before the refactor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ voices: [{ voiceId: 'KoVoice' }] }))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: '안녕하세요', language: 'ko' })

    expect(result).toMatchObject({
      ok: true,
      provider: 'inworld',
      mime: 'audio/mpeg',
      voiceId: 'KoVoice',
      modelId: 'inworld-tts-1.5-mini',
    })
    expect(result.fallbackFrom).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(urlOf(fetchMock.mock.calls[0])).toContain('https://api.inworld.ai/tts/v1/voices?filter=')
    expect(urlOf(fetchMock.mock.calls[1])).toBe('https://api.inworld.ai/tts/v1/voice')
    const init = fetchMock.mock.calls[1][1] as RequestInit
    expect(init.headers).toEqual({ Authorization: 'Basic ZmFrZTpmYWtl', 'Content-Type': 'application/json' })
    expect(bodyOf(fetchMock.mock.calls[1])).toEqual({
      text: '안녕하세요',
      voiceId: 'KoVoice',
      modelId: 'inworld-tts-1.5-mini',
      audioConfig: { speakingRate: 1.3 },
    })
  })

  it('ignores an invalid override and stays on inworld', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({
      text: 'hello',
      language: null,
      requestedVoiceId: 'Ashley',
      providerOverride: 'polly',
    })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', voiceId: 'Ashley' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toBe('https://api.inworld.ai/tts/v1/voice')
  })

  it('reports missing Inworld credentials without calling fetch', async () => {
    delete process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en' })

    expect(result).toMatchObject({ ok: false, provider: 'inworld', reason: 'missing_credentials' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('synthesizeSpeech — gemini', () => {
  it('returns WAV as-is from the Interactions API and ignores the client Inworld voiceId', async () => {
    process.env.TTS_PROVIDER = 'gemini'
    const wav = wavBytes()
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: '빠른 답장 감사합니다.', language: 'ko', requestedVoiceId: 'KoVoice' })

    expect(result).toMatchObject({
      ok: true,
      provider: 'gemini',
      mime: 'audio/wav',
      voiceId: 'Kore',
      modelId: 'gemini-3.8-flash-tts',
    })
    if (!result.ok) throw new Error('expected success')
    expect(result.audio.equals(wav)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key')
    const body = bodyOf(fetchMock.mock.calls[0])
    expect(body.model).toBe('gemini-3.8-flash-tts')
    expect(body.response_format).toEqual({ type: 'audio' })
    expect(body.generation_config).toEqual({ speech_config: [{ voice: 'Kore' }] })
    // Text is verbatim — no style prefix, no speech_metadata annotation.
    expect(body.input).toEqual([
      { type: 'user_input', content: [{ type: 'text', text: '빠른 답장 감사합니다.' }] },
    ])
  })

  it('wraps raw PCM (audio/l16) in a 44-byte WAV header using the declared rate', async () => {
    process.env.TTS_PROVIDER = 'gemini'
    process.env.GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts'
    process.env.GEMINI_TTS_VOICE = 'Puck'
    const pcm = Buffer.alloc(4800, 1)
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(pcm, 'audio/l16;codec=pcm;rate=16000'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en' })

    if (!result.ok) throw new Error('expected success')
    expect(result.mime).toBe('audio/wav')
    expect(result.voiceId).toBe('Puck')
    expect(result.modelId).toBe('gemini-3.8-flash-lite-tts')
    expect(result.audio.length).toBe(44 + pcm.length)
    expect(result.audio.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(result.audio.subarray(8, 12).toString('ascii')).toBe('WAVE')
    expect(result.audio.readUInt16LE(22)).toBe(1)
    expect(result.audio.readUInt32LE(24)).toBe(16000)
    expect(result.audio.readUInt16LE(34)).toBe(16)
    expect(result.audio.readUInt32LE(40)).toBe(pcm.length)
    expect(bodyOf(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-lite-tts')
  })

  it('defaults headerless PCM without a rate to 24 kHz', async () => {
    const { normalizeGeminiAudio } = await loadModule()
    const out = normalizeGeminiAudio(Buffer.alloc(100), '')
    expect(out.mime).toBe('audio/wav')
    expect(out.audio.readUInt32LE(24)).toBe(24000)
  })

  it('falls back to Inworld on a non-2xx Gemini response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'quota' } }, 429))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({
      text: 'hello',
      language: null,
      requestedVoiceId: 'Ashley',
      providerOverride: 'gemini',
    })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini', voiceId: 'Ashley' })
    expect(urlOf(fetchMock.mock.calls[0])).toContain('generativelanguage.googleapis.com')
    expect(urlOf(fetchMock.mock.calls[1])).toBe('https://api.inworld.ai/tts/v1/voice')
  })

  it('falls back to Inworld when Gemini times out', async () => {
    process.env.TTS_PROVIDER = 'gemini'
    process.env.GEMINI_TTS_TIMEOUT_MS = '20'
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech, synthesizeWithGemini } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley' })
    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })

    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const direct = await synthesizeWithGemini({ text: 'hello', language: null })
    expect(direct).toMatchObject({ ok: false, reason: 'timeout' })
  })

  it('falls back to Inworld when Gemini returns no audio', async () => {
    process.env.TTS_PROVIDER = 'gemini'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'hi' }] }] }))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley' })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })
  })

  it('falls back to Inworld on a Gemini fetch exception', async () => {
    process.env.TTS_PROVIDER = 'gemini'
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley' })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })
  })

  it('falls back without calling Gemini when GEMINI_API_KEY is missing', async () => {
    process.env.TTS_PROVIDER = 'gemini'
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn().mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley' })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toBe('https://api.inworld.ai/tts/v1/voice')
  })

  it('returns the Inworld failure (with fallbackFrom) when Gemini fails and Inworld has no credentials', async () => {
    process.env.TTS_PROVIDER = 'gemini'
    delete process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 500))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en' })

    expect(result).toMatchObject({
      ok: false,
      provider: 'inworld',
      reason: 'missing_credentials',
      fallbackFrom: 'gemini',
    })
  })
})
