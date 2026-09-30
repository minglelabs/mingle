import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TTS_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_TTS_VOICE',
  'GEMINI_TTS_VOICE_KO',
  'GEMINI_TTS_VOICE_JA',
  'GEMINI_TTS_SPEED',
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

describe('resolveTtsRuntimeSelection (re-exported from @/lib/tts-models)', () => {
  it('maps Inworld to the INWORLD_TTS_MODEL_ID runtime model and Gemini to its own id', async () => {
    const { resolveTtsRuntimeSelection } = await loadModule()
    expect(resolveTtsRuntimeSelection(undefined)).toEqual({
      value: 'gemini-3.8-flash-tts', provider: 'gemini', runtimeModel: 'gemini-3.8-flash-tts',
    })
    expect(resolveTtsRuntimeSelection('inworld-tts-1.5-mini')).toEqual({
      value: 'inworld-tts-1.5-mini', provider: 'inworld', runtimeModel: 'inworld-tts-1.5-mini',
    })
    process.env.INWORLD_TTS_MODEL_ID = 'inworld-tts-2'
    expect(resolveTtsRuntimeSelection('inworld-tts-1.5-mini').runtimeModel).toBe('inworld-tts-2')
    expect(resolveTtsRuntimeSelection('gemini-3.8-flash-lite-tts')).toEqual({
      value: 'gemini-3.8-flash-lite-tts', provider: 'gemini', runtimeModel: 'gemini-3.8-flash-lite-tts',
    })
  })

  it('resolves invalid values to the gemini-3.8-flash-tts default', async () => {
    const { resolveTtsRuntimeSelection } = await loadModule()
    expect(resolveTtsRuntimeSelection('gemini').value).toBe('gemini-3.8-flash-tts')
    expect(resolveTtsRuntimeSelection(123).value).toBe('gemini-3.8-flash-tts')
    expect(resolveTtsRuntimeSelection({ ttsModel: 'inworld-tts-1.5-mini' }).value).toBe('gemini-3.8-flash-tts')
  })
})

describe('synthesizeSpeech — default (no ttsModel)', () => {
  it('uses gemini-3.8-flash-tts when ttsModel is missing', async () => {
    const wav = wavBytes()
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en' })

    expect(result).toMatchObject({ ok: true, provider: 'gemini', modelId: 'gemini-3.8-flash-tts' })
    expect(result.fallbackFrom).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-tts')
  })

  it('resolves an invalid ttsModel to Gemini and falls back to Inworld when Gemini fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'quota' } }, 429))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({
      text: 'hello',
      language: null,
      requestedVoiceId: 'Ashley',
      ttsModel: 'polly',
    })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini', voiceId: 'Ashley' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodyOf(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-tts')
    expect(urlOf(fetchMock.mock.calls[1])).toBe('https://api.inworld.ai/tts/v1/voice')
  })

  it('falls back to Inworld without calling Gemini when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn().mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley' })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toBe('https://api.inworld.ai/tts/v1/voice')
  })
})

describe('synthesizeSpeech — inworld (explicit choice)', () => {
  it('sends the same Inworld request as before the refactor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ voices: [{ voiceId: 'KoVoice' }] }))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: '안녕하세요', language: 'ko', ttsModel: 'inworld-tts-1.5-mini' })

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

  it('uses the requested Inworld voice without a voice lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({
      text: 'hello',
      language: null,
      requestedVoiceId: 'Ashley',
      ttsModel: 'inworld-tts-1.5-mini',
    })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', voiceId: 'Ashley' })
    expect(result.fallbackFrom).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toBe('https://api.inworld.ai/tts/v1/voice')
  })

  it('reports missing Inworld credentials without calling fetch', async () => {
    delete process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en', ttsModel: 'inworld-tts-1.5-mini' })

    expect(result).toMatchObject({ ok: false, provider: 'inworld', reason: 'missing_credentials' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('synthesizeSpeech — gemini', () => {
  it('uses the male Korean voice, passes non-PCM WAV through and ignores the client Inworld voiceId', async () => {
    const wav = wavBytes()
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({
      text: '빠른 답장 감사합니다.',
      language: 'ko',
      requestedVoiceId: 'KoVoice',
      ttsModel: 'gemini-3.8-flash-tts',
    })

    expect(result).toMatchObject({
      ok: true,
      provider: 'gemini',
      mime: 'audio/wav',
      voiceId: 'ko-kr-csagent-11',
      modelId: 'gemini-3.8-flash-tts',
    })
    if (!result.ok) throw new Error('expected success')
    // The fake WAV has no fmt chunk, so post-processing leaves it untouched.
    expect(result.audio.equals(wav)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key')
    const body = bodyOf(fetchMock.mock.calls[0])
    expect(body.model).toBe('gemini-3.8-flash-tts')
    expect(body.response_format).toEqual({ type: 'audio' })
    expect(body.generation_config).toEqual({ speech_config: [{ voice: 'ko-kr-csagent-11' }] })
    // Text is verbatim — no style prefix, no speech_metadata annotation.
    expect(body.input).toEqual([
      { type: 'user_input', content: [{ type: 'text', text: '빠른 답장 감사합니다.' }] },
    ])
  })

  it('wraps raw PCM (audio/l16) in a 44-byte WAV header using the declared rate', async () => {
    process.env.GEMINI_TTS_VOICE = 'Puck'
    const pcm = Buffer.alloc(4800, 1)
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(pcm, 'audio/l16;codec=pcm;rate=16000'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en', ttsModel: 'gemini-3.8-flash-lite-tts' })

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

  // A first sample of -1 is ff ff, which byte sniffing reads as an MP3 frame sync.
  function pcmStartingWithMinusOne(samples = 2400): Buffer {
    const pcm = Buffer.alloc(samples * 2, 0)
    pcm.writeInt16LE(-1, 0)
    return pcm
  }

  it('wraps declared L16 PCM whose first sample is -1 instead of labelling it MP3', async () => {
    const pcm = pcmStartingWithMinusOne()
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(pcm, 'audio/L16;codec=pcm;rate=24000'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en', ttsModel: 'gemini-3.8-flash-tts' })

    if (!result.ok) throw new Error('expected success')
    expect(result.provider).toBe('gemini')
    expect(result.mime).toBe('audio/wav')
    expect(result.audio.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(result.audio.readUInt32LE(24)).toBe(24000)
    expect(result.audio.subarray(44).equals(pcm)).toBe(true)
  })

  it('wraps undeclared PCM whose first sample is -1 instead of labelling it MP3', async () => {
    const { normalizeGeminiAudio } = await loadModule()
    const pcm = pcmStartingWithMinusOne()
    const out = normalizeGeminiAudio(pcm, '')
    expect(out.mime).toBe('audio/wav')
    expect(out.audio.subarray(44).equals(pcm)).toBe(true)
  })

  it('still passes real containers through unchanged', async () => {
    const { normalizeGeminiAudio } = await loadModule()
    const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00])
    expect(normalizeGeminiAudio(mp3, 'audio/mpeg')).toEqual({ audio: mp3, mime: 'audio/mpeg' })
    const id3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00])
    expect(normalizeGeminiAudio(id3, '')).toEqual({ audio: id3, mime: 'audio/mpeg' })
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])
    expect(normalizeGeminiAudio(wav, '')).toEqual({ audio: wav, mime: 'audio/wav' })
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
      ttsModel: 'gemini-3.8-flash-tts',
    })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini', voiceId: 'Ashley' })
    expect(urlOf(fetchMock.mock.calls[0])).toContain('generativelanguage.googleapis.com')
    expect(urlOf(fetchMock.mock.calls[1])).toBe('https://api.inworld.ai/tts/v1/voice')
  })

  it('falls back to Inworld when Gemini times out', async () => {
    process.env.GEMINI_TTS_TIMEOUT_MS = '20'
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech, synthesizeWithGemini } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley', ttsModel: 'gemini-3.8-flash-tts' })
    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })

    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const direct = await synthesizeWithGemini({ text: 'hello', language: null, modelId: 'gemini-3.8-flash-tts' })
    expect(direct).toMatchObject({ ok: false, reason: 'timeout' })
  })

  it('falls back to Inworld when Gemini returns no audio', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'hi' }] }] }))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley', ttsModel: 'gemini-3.8-flash-tts' })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })
  })

  it('falls back to Inworld on a Gemini fetch exception', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley', ttsModel: 'gemini-3.8-flash-tts' })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })
  })

  it('falls back without calling Gemini when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn().mockResolvedValueOnce(inworldAudioResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null, requestedVoiceId: 'Ashley', ttsModel: 'gemini-3.8-flash-tts' })

    expect(result).toMatchObject({ ok: true, provider: 'inworld', fallbackFrom: 'gemini' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toBe('https://api.inworld.ai/tts/v1/voice')
  })

  it('returns the Inworld failure (with fallbackFrom) when Gemini fails and Inworld has no credentials', async () => {
    delete process.env.INWORLD_RUNTIME_BASE64_CREDENTIAL
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, 500))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en', ttsModel: 'gemini-3.8-flash-tts' })

    expect(result).toMatchObject({
      ok: false,
      provider: 'inworld',
      reason: 'missing_credentials',
      fallbackFrom: 'gemini',
    })
  })
})

/** Real 16-bit mono PCM WAV: `silenceMs` of silence, a tone, then silence again. */
function toneWav(sampleRate: number, toneMs: number, silenceMs: number, frequency = 200): Buffer {
  const silence = Math.round(sampleRate * silenceMs / 1000)
  const tone = Math.round(sampleRate * toneMs / 1000)
  const pcm = Buffer.alloc((2 * silence + tone) * 2)
  for (let i = 0; i < tone; i++) {
    const value = Math.round(0.5 * 32767 * Math.sin((2 * Math.PI * frequency * i) / sampleRate))
    pcm.writeInt16LE(value, (silence + i) * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function wavSeconds(wav: Buffer): number {
  return wav.readUInt32LE(40) / 2 / wav.readUInt32LE(24)
}

describe('getGeminiTtsVoice — per-language voice', () => {
  it('uses the male Korean voice for ko (any region/case) and Kore elsewhere', async () => {
    const { getGeminiTtsVoice } = await loadModule()
    expect(getGeminiTtsVoice('ko')).toBe('ko-kr-csagent-11')
    expect(getGeminiTtsVoice('ko-KR')).toBe('ko-kr-csagent-11')
    expect(getGeminiTtsVoice('KO_kr')).toBe('ko-kr-csagent-11')
    expect(getGeminiTtsVoice('en')).toBe('Kore')
    expect(getGeminiTtsVoice('ja')).toBe('Kore')
    expect(getGeminiTtsVoice(null)).toBe('Kore')
    expect(getGeminiTtsVoice()).toBe('Kore')
  })

  it('GEMINI_TTS_VOICE changes only languages without a per-language voice', async () => {
    process.env.GEMINI_TTS_VOICE = 'Puck'
    const { getGeminiTtsVoice } = await loadModule()
    expect(getGeminiTtsVoice('en')).toBe('Puck')
    expect(getGeminiTtsVoice(null)).toBe('Puck')
    expect(getGeminiTtsVoice('ko')).toBe('ko-kr-csagent-11')
  })

  it('GEMINI_TTS_VOICE_<LANG> overrides one language', async () => {
    process.env.GEMINI_TTS_VOICE_KO = 'Charon'
    process.env.GEMINI_TTS_VOICE_JA = 'Puck'
    const { getGeminiTtsVoice } = await loadModule()
    expect(getGeminiTtsVoice('ko')).toBe('Charon')
    expect(getGeminiTtsVoice('ja-JP')).toBe('Puck')
    expect(getGeminiTtsVoice('en')).toBe('Kore')
  })
})

describe('getGeminiTtsSpeed', () => {
  it('defaults to 1.4 for Korean and 1 for other languages', async () => {
    const { getGeminiTtsSpeed } = await loadModule()
    expect(getGeminiTtsSpeed('ko')).toBe(1.4)
    expect(getGeminiTtsSpeed('ko-KR')).toBe(1.4)
    expect(getGeminiTtsSpeed('en')).toBe(1)
    expect(getGeminiTtsSpeed('ja')).toBe(1)
    expect(getGeminiTtsSpeed(null)).toBe(1)
  })

  it('accepts a single number for every language, clamped to [0.5, 2]', async () => {
    process.env.GEMINI_TTS_SPEED = '1.2'
    let mod = await loadModule()
    expect(mod.getGeminiTtsSpeed('ko')).toBe(1.2)
    expect(mod.getGeminiTtsSpeed('en')).toBe(1.2)
    process.env.GEMINI_TTS_SPEED = '9'
    mod = await loadModule()
    expect(mod.getGeminiTtsSpeed('en')).toBe(2)
    process.env.GEMINI_TTS_SPEED = 'fast'
    mod = await loadModule()
    expect(mod.getGeminiTtsSpeed('ko')).toBe(1.4)
  })

  it('accepts a per-language list with a * default', async () => {
    process.env.GEMINI_TTS_SPEED = 'ja=1.1, *=1.05, en=bad'
    const { getGeminiTtsSpeed } = await loadModule()
    expect(getGeminiTtsSpeed('ja')).toBe(1.1)
    expect(getGeminiTtsSpeed('en')).toBe(1.05)
    // Not mentioned -> built-in table first, then *.
    expect(getGeminiTtsSpeed('ko')).toBe(1.4)
    expect(getGeminiTtsSpeed('fr')).toBe(1.05)
  })
})

describe('synthesizeSpeech — gemini post-processing', () => {
  it('trims silence and speeds Korean up 1.4x, reporting the voice it used', async () => {
    // 300 ms silence + 2.8 s tone + 300 ms silence.
    const wav = toneWav(24000, 2800, 300)
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: '안녕하세요', language: 'ko' })

    if (!result.ok) throw new Error('expected success')
    expect(result).toMatchObject({ provider: 'gemini', mime: 'audio/wav', voiceId: 'ko-kr-csagent-11' })
    // (2.8 s + 2 x 80 ms padding) / 1.4 = ~2.11 s.
    expect(wavSeconds(result.audio)).toBeGreaterThan(2.0)
    expect(wavSeconds(result.audio)).toBeLessThan(2.2)
    expect(bodyOf(fetchMock.mock.calls[0]).generation_config).toEqual({
      speech_config: [{ voice: 'ko-kr-csagent-11' }],
    })
  })

  it('only trims silence for English (speed 1) and keeps the default voice', async () => {
    const wav = toneWav(24000, 1000, 400)
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en' })

    if (!result.ok) throw new Error('expected success')
    expect(result.voiceId).toBe('Kore')
    // 1.0 s tone + 2 x 80 ms padding (10 ms frame granularity).
    expect(wavSeconds(result.audio)).toBeCloseTo(1.16, 1)
    expect(bodyOf(fetchMock.mock.calls[0]).generation_config).toEqual({ speech_config: [{ voice: 'Kore' }] })
  })

  it('post-processes raw L16 PCM after wrapping it', async () => {
    const pcm = toneWav(24000, 1400, 200).subarray(44)
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(pcm, 'audio/l16;rate=24000'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: '네', language: 'ko' })

    if (!result.ok) throw new Error('expected success')
    expect(result.mime).toBe('audio/wav')
    // (1.4 s + 0.16 s) / 1.4 = ~1.11 s.
    expect(wavSeconds(result.audio)).toBeGreaterThan(1.05)
    expect(wavSeconds(result.audio)).toBeLessThan(1.17)
  })
})
