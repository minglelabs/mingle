import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createTrackedEventLogMock, resolveUserIdMock } = vi.hoisted(() => ({
  createTrackedEventLogMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
}))

vi.mock('next-auth', () => ({
  getServerSession: () => Promise.resolve(null),
}))

vi.mock('@/lib/auth-options', () => ({
  getAuthOptions: () => ({}),
}))

vi.mock('@/lib/request-user-identity', () => ({
  resolveUserIdForTrackedWrite: resolveUserIdMock,
}))

vi.mock('@/lib/app-analytics', () => ({
  createTrackedEventLog: createTrackedEventLogMock,
  ensureTrackingContext: () => ({ sessionKey: 'sess-1' }),
  fireAndForgetDbWrite: (_label: string, fn: () => Promise<void>) => { void fn() },
  parseClientContext: () => null,
}))

const ENV_KEYS = [
  'GEMINI_API_KEY',
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
] as const
const savedEnv: Record<string, string | undefined> = {}

const MP3_BYTES = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00])

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function geminiWavResponse(): Response {
  const wav = Buffer.alloc(48)
  wav.write('RIFF', 0, 'ascii')
  wav.write('WAVE', 8, 'ascii')
  return jsonResponse({
    steps: [{ type: 'model_output', content: [{ type: 'audio', data: wav.toString('base64'), mime_type: 'audio/wav' }] }],
  })
}

function bodyOfCall(call: unknown[]): Record<string, unknown> {
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/tts/inworld', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function loadHandler() {
  vi.resetModules()
  const mod = await import('@/server/api/handlers/v1/tts-inworld-handler')
  return mod.handleTtsInworldV1
}

async function flushAsync() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL = 'ZmFrZTpmYWtl'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  resolveUserIdMock.mockResolvedValue('user-1')
  createTrackedEventLogMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  createTrackedEventLogMock.mockReset()
})

describe('handleTtsInworldV1', () => {
  it('keeps the Inworld response and event log shape when Inworld is chosen', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ audioContent: MP3_BYTES.toString('base64') }))
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({
      text: 'hello',
      voiceId: 'Ashley',
      clientMessageId: 'm1',
      ttsModel: 'inworld-tts-1.5-mini',
    }) as never)
    await flushAsync()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(res.headers.get('X-TTS-Provider')).toBe('inworld')
    expect(res.headers.get('X-TTS-Voice-Id')).toBe('Ashley')
    expect(res.headers.get('X-TTS-Fallback-From')).toBeNull()
    expect(Buffer.from(await res.arrayBuffer()).equals(MP3_BYTES)).toBe(true)
    expect(createTrackedEventLogMock).toHaveBeenCalledTimes(1)
    expect(createTrackedEventLogMock.mock.calls[0][0]).toMatchObject({
      eventType: 'tts_generated',
      metadata: {
        language: null,
        voiceId: 'Ashley',
        modelId: 'inworld-tts-1.5-mini',
        textLength: 5,
        audioBytes: MP3_BYTES.length,
        clientMessageId: 'm1',
        provider: 'inworld',
      },
    })
    expect(createTrackedEventLogMock.mock.calls[0][0].metadata).not.toHaveProperty('fallbackFrom')
  })

  it('keeps the existing 500 when Inworld credentials are missing on the Inworld path', async () => {
    delete process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', ttsModel: 'inworld-tts-1.5-mini' }) as never)
    expect(fetchMock).not.toHaveBeenCalled()

    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('INWORLD_BASIC')
  })

  it('keeps the existing upstream error response and tts_failed event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad voice', { status: 400 })))
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', voiceId: 'Nope', ttsModel: 'inworld-tts-1.5-mini' }) as never)
    await flushAsync()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'inworld_tts_failed', status: 400, detail: 'bad voice' })
    expect(createTrackedEventLogMock.mock.calls[0][0]).toMatchObject({
      eventType: 'tts_failed',
      metadata: { status: 400, voiceId: 'Nope', modelId: 'inworld-tts-1.5-mini', provider: 'inworld' },
    })
  })

  it('serves Gemini audio/wav when ttsModel=gemini-3.8-flash-tts', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiWavResponse())
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({
      text: 'hello',
      voiceId: 'Ashley',
      language: 'en',
      ttsModel: 'gemini-3.8-flash-tts',
    }) as never)
    await flushAsync()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/wav')
    expect(res.headers.get('X-TTS-Provider')).toBe('gemini')
    expect(res.headers.get('X-TTS-Voice-Id')).toBe('Kore')
    expect(res.headers.get('X-TTS-Fallback-From')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(createTrackedEventLogMock.mock.calls[0][0].metadata).toMatchObject({
      provider: 'gemini',
      modelId: 'gemini-3.8-flash-tts',
      voiceId: 'Kore',
    })
  })

  it('uses the lite Gemini model from body ttsModel and marks the Inworld fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ audioContent: MP3_BYTES.toString('base64') }))
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', voiceId: 'Ashley', ttsModel: 'gemini-3.8-flash-lite-tts' }) as never)
    await flushAsync()

    expect(res.status).toBe(200)
    expect(bodyOfCall(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-lite-tts')
    expect(res.headers.get('X-TTS-Provider')).toBe('inworld')
    expect(res.headers.get('X-TTS-Fallback-From')).toBe('gemini')
    expect(createTrackedEventLogMock.mock.calls[0][0].metadata).toMatchObject({
      provider: 'inworld',
      modelId: 'inworld-tts-1.5-mini',
      fallbackFrom: 'gemini',
    })
  })

  it('serves the gemini-3.8-flash-lite-tts default when the body has no ttsModel', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiWavResponse())
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', voiceId: 'Ashley', language: 'en' }) as never)
    await flushAsync()

    expect(res.status).toBe(200)
    expect(res.headers.get('X-TTS-Provider')).toBe('gemini')
    expect(res.headers.get('X-TTS-Fallback-From')).toBeNull()
    expect(bodyOfCall(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-lite-tts')
    expect(createTrackedEventLogMock.mock.calls[0][0].metadata).toMatchObject({
      provider: 'gemini',
      modelId: 'gemini-3.8-flash-lite-tts',
    })
  })

  it('resolves an invalid body ttsModel (and the removed provider field) to the Gemini default with Inworld fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ audioContent: MP3_BYTES.toString('base64') }))
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', voiceId: 'Ashley', ttsModel: 'azure', provider: 'inworld' }) as never)

    expect(res.status).toBe(200)
    expect(bodyOfCall(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-lite-tts')
    expect(res.headers.get('X-TTS-Provider')).toBe('inworld')
    expect(res.headers.get('X-TTS-Fallback-From')).toBe('gemini')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://api.inworld.ai/tts/v1/voice')
  })

  it('returns the existing 500 when Gemini fails and Inworld has no credentials', async () => {
    delete process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({}, 500)))
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', ttsModel: 'gemini-3.8-flash-tts' }) as never)

    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('INWORLD_BASIC')
  })
})
