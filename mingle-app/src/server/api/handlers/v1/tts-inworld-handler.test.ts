import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TtsStreamFrameParser } from '@/lib/tts-stream-format'

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
  'GEMINI_TTS_SPEED',
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

function loudPcm(samples: number, level = 12000): Buffer {
  const pcm = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(i % 2 === 0 ? level : -level, i * 2)
  return pcm
}

function geminiStreamResponse(pieces: Buffer[]): Response {
  const events = pieces.map((piece) => ({
    event_type: 'step.delta',
    delta: { type: 'audio', mime_type: 'audio/l16', sample_rate: 24000, data: piece.toString('base64') },
  }))
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
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
  it('serves Gemini audio/wav from the one model and logs it', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiWavResponse())
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', language: 'en', clientMessageId: 'm1' }) as never)
    await flushAsync()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/wav')
    expect(res.headers.get('X-TTS-Provider')).toBe('gemini')
    expect(res.headers.get('X-TTS-Voice-Id')).toBe('Kore')
    expect(res.headers.get('X-TTS-Fallback-From')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOfCall(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-lite-tts')
    expect(createTrackedEventLogMock).toHaveBeenCalledTimes(1)
    expect(createTrackedEventLogMock.mock.calls[0][0]).toMatchObject({
      eventType: 'tts_generated',
      metadata: {
        language: 'en',
        voiceId: 'Kore',
        modelId: 'gemini-3.8-flash-lite-tts',
        textLength: 5,
        clientMessageId: 'm1',
        provider: 'gemini',
      },
    })
    expect(createTrackedEventLogMock.mock.calls[0][0].metadata).not.toHaveProperty('fallbackFrom')
  })

  it.each([
    'inworld-tts-1.5-mini',
    'gemini-3.8-flash-tts',
    'azure',
  ])('ignores an older client\'s ttsModel (%s) and voiceId', async (ttsModel) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiWavResponse())
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', language: 'en', voiceId: 'Ashley', ttsModel }) as never)

    expect(res.status).toBe(200)
    expect(res.headers.get('X-TTS-Provider')).toBe('gemini')
    expect(res.headers.get('X-TTS-Voice-Id')).toBe('Kore')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com')
    expect(bodyOfCall(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-lite-tts')
  })

  it('returns the upstream error and a tts_failed event when Gemini fails: there is no fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('quota', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello' }) as never)
    await flushAsync()

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'tts_failed', status: 429, detail: 'quota' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(createTrackedEventLogMock.mock.calls[0][0]).toMatchObject({
      eventType: 'tts_failed',
      metadata: { status: 429, modelId: 'gemini-3.8-flash-lite-tts', provider: 'gemini' },
    })
  })

  it('answers 500 without calling Gemini when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello' }) as never)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('GEMINI_API_KEY')
  })

  it('answers 400 when the text is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: '  ' }) as never)

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('streams PCM frames and an end frame when the client asks for a stream', async () => {
    // 100 ms of silence, 200 ms of speech, 300 ms of silence at 24 kHz.
    const pieces = [Buffer.alloc(2400 * 2), loudPcm(4800), Buffer.alloc(7200 * 2)]
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiStreamResponse(pieces))
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', language: 'en', stream: true, clientMessageId: 'm1' }) as never)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/x-mingle-tts-stream')
    expect(res.headers.get('X-TTS-Sample-Rate')).toBe('24000')
    expect(bodyOfCall(fetchMock.mock.calls[0]).stream).toBe(true)
    const frames = new TtsStreamFrameParser().push(new Uint8Array(await res.arrayBuffer()))
    await flushAsync()

    expect(frames.at(-1)).toEqual({ type: 'end', end: {} })
    const audio = Buffer.concat(frames.flatMap((frame) => (frame.type === 'audio' ? [Buffer.from(frame.pcm)] : [])))
    // 80 ms of padding is kept on each side of the 200 ms of speech.
    expect(audio.length).toBe((1920 + 4800 + 1920) * 2)
    expect(audio.subarray(1920 * 2, (1920 + 4800) * 2).equals(loudPcm(4800))).toBe(true)
    expect(createTrackedEventLogMock.mock.calls[0][0]).toMatchObject({
      eventType: 'tts_generated',
      metadata: { streamed: true, audioBytes: audio.length, modelId: 'gemini-3.8-flash-lite-tts', clientMessageId: 'm1' },
    })
  })

  it('reports a failed stream like a failed whole answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('quota', { status: 429 })))
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', stream: true }) as never)

    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'tts_failed', status: 429, detail: 'quota' })
  })

  it('answers whole when a tempo change rules streaming out', async () => {
    process.env.GEMINI_TTS_SPEED = '1.2'
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiWavResponse())
    vi.stubGlobal('fetch', fetchMock)
    const handler = await loadHandler()

    const res = await handler(makeRequest({ text: 'hello', language: 'en', stream: true }) as never)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/wav')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
