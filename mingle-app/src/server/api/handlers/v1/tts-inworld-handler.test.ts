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
  'INWORLD_RUNTIME_BASE64_CREDENTIAL',
] as const
const savedEnv: Record<string, string | undefined> = {}

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
  it('keeps the upstream error response and tts_failed event when both Gemini models fail', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('overloaded', { status: 503 }))
      .mockResolvedValueOnce(new Response('bad request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', language: 'en' }) as never)
    await flushAsync()

    expect(res.status).toBe(400)
    // The error code stays the same for installed apps.
    expect(await res.json()).toEqual({ error: 'inworld_tts_failed', status: 400, detail: 'bad request' })
    expect(res.headers.get('X-TTS-Fallback-From')).toBe('gemini-3.8-flash-lite-tts')
    expect(createTrackedEventLogMock.mock.calls[0][0]).toMatchObject({
      eventType: 'tts_failed',
      metadata: {
        status: 400,
        voiceId: 'Kore',
        modelId: 'gemini-3.8-flash-tts',
        provider: 'gemini',
        fallbackFrom: 'gemini-3.8-flash-lite-tts',
      },
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

  it('retries a failed gemini-3.8-flash-lite-tts with gemini-3.8-flash-tts and marks the fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(geminiWavResponse())
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', voiceId: 'Ashley', ttsModel: 'gemini-3.8-flash-lite-tts' }) as never)
    await flushAsync()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/wav')
    expect(bodyOfCall(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-lite-tts')
    expect(bodyOfCall(fetchMock.mock.calls[1]).model).toBe('gemini-3.8-flash-tts')
    expect(res.headers.get('X-TTS-Provider')).toBe('gemini')
    expect(res.headers.get('X-TTS-Fallback-From')).toBe('gemini-3.8-flash-lite-tts')
    expect(createTrackedEventLogMock.mock.calls[0][0].metadata).toMatchObject({
      provider: 'gemini',
      modelId: 'gemini-3.8-flash-tts',
      fallbackFrom: 'gemini-3.8-flash-lite-tts',
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

  it('resolves an invalid or removed ttsModel (and the removed provider field) to the Gemini default', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(geminiWavResponse()))
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    for (const body of [
      { text: 'hello', ttsModel: 'azure', provider: 'inworld' },
      { text: 'hello', voiceId: 'Ashley', ttsModel: 'inworld-tts-1.5-mini' },
    ]) {
      const res = await handler(makeRequest(body) as never)
      expect(res.status).toBe(200)
      expect(res.headers.get('X-TTS-Provider')).toBe('gemini')
      expect(res.headers.get('X-TTS-Fallback-From')).toBeNull()
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
      expect(bodyOfCall(call).model).toBe('gemini-3.8-flash-lite-tts')
    }
  })

  it('returns a 500 without calling Gemini when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello' }) as never)

    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('GEMINI_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
