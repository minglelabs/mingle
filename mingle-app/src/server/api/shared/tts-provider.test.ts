import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TTS_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_TTS_VOICE',
  'GEMINI_TTS_VOICE_KO',
  'GEMINI_TTS_VOICE_JA',
  'GEMINI_TTS_SPEED',
  'GEMINI_TTS_STYLE',
  'GEMINI_TTS_STYLE_KO',
  'GEMINI_TTS_STYLE_JA',
  'GEMINI_TTS_TIMEOUT_MS',
] as const

const savedEnv: Record<string, string | undefined> = {}

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

describe('synthesizeSpeech — the one model', () => {
  it('always uses gemini-3.8-flash-lite-tts', async () => {
    const wav = wavBytes()
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech, TTS_MODEL } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en' })

    expect(TTS_MODEL).toBe('gemini-3.8-flash-lite-tts')
    expect(result).toMatchObject({ ok: true, provider: 'gemini' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(fetchMock.mock.calls[0]).model).toBe('gemini-3.8-flash-lite-tts')
  })
})

describe('synthesizeSpeech — gemini', () => {
  it('uses the male Korean voice and passes non-PCM WAV through', async () => {
    const wav = wavBytes()
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: '빠른 답장 감사합니다.', language: 'ko' })

    expect(result).toMatchObject({
      ok: true,
      provider: 'gemini',
      mime: 'audio/wav',
      voiceId: 'ko-kr-csagent-8',
      modelId: 'gemini-3.8-flash-lite-tts',
    })
    if (!result.ok) throw new Error('expected success')
    // The fake WAV has no fmt chunk, so post-processing leaves it untouched.
    expect(result.audio.equals(wav)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key')
    const body = bodyOf(fetchMock.mock.calls[0])
    expect(body.model).toBe('gemini-3.8-flash-lite-tts')
    expect(body.response_format).toEqual({ type: 'audio' })
    expect(body.generation_config).toEqual({ speech_config: [{ voice: 'ko-kr-csagent-8' }] })
    // Text is verbatim; pace rides in the structured (never spoken) style annotation.
    expect(body.input).toEqual([{
      type: 'user_input',
      content: [{
        type: 'text',
        text: '빠른 답장 감사합니다.',
        annotations: [{ type: 'speech_metadata', style: 'speaking rapidly' }],
      }],
    }])
  })

  it('sends the text without any annotation when GEMINI_TTS_STYLE=none', async () => {
    process.env.GEMINI_TTS_STYLE = 'none'
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wavBytes(), 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: 'en' })

    expect(result).toMatchObject({ ok: true, provider: 'gemini', voiceId: 'Kore' })
    expect(bodyOf(fetchMock.mock.calls[0]).input).toEqual([
      { type: 'user_input', content: [{ type: 'text', text: 'hello' }] },
    ])
  })

  it('sends the milder built-in style for Japanese', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wavBytes(), 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    await synthesizeSpeech({ text: '明日の会議は何時からですか？', language: 'ja-JP' })

    expect(bodyOf(fetchMock.mock.calls[0]).input).toEqual([{
      type: 'user_input',
      content: [{
        type: 'text',
        text: '明日の会議は何時からですか？',
        annotations: [{ type: 'speech_metadata', style: 'slightly faster than normal pace' }],
      }],
    }])
  })

  it('wraps raw PCM (audio/l16) in a 44-byte WAV header using the declared rate', async () => {
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

    const result = await synthesizeSpeech({ text: 'hello', language: 'en' })

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

  it('returns the failure of a non-2xx Gemini response: there is no fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: { message: 'quota' } }, 429))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null })

    expect(result).toMatchObject({ ok: false, provider: 'gemini', reason: 'upstream_error', status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock.mock.calls[0])).toContain('generativelanguage.googleapis.com')
  })

  it('returns a timeout failure when Gemini does not answer in time', async () => {
    process.env.GEMINI_TTS_TIMEOUT_MS = '20'
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null })

    expect(result).toMatchObject({ ok: false, provider: 'gemini', reason: 'timeout' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns invalid_audio when Gemini returns no audio', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'hi' }] }] }))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null })

    expect(result).toMatchObject({ ok: false, provider: 'gemini', reason: 'invalid_audio' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns an exception failure on a Gemini fetch exception', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null })

    expect(result).toMatchObject({ ok: false, provider: 'gemini', reason: 'exception' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports missing credentials without calling fetch when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: 'hello', language: null })

    expect(result).toMatchObject({ ok: false, provider: 'gemini', reason: 'missing_credentials' })
    expect(fetchMock).not.toHaveBeenCalled()
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
    expect(getGeminiTtsVoice('ko')).toBe('ko-kr-csagent-8')
    expect(getGeminiTtsVoice('ko-KR')).toBe('ko-kr-csagent-8')
    expect(getGeminiTtsVoice('KO_kr')).toBe('ko-kr-csagent-8')
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
    expect(getGeminiTtsVoice('ko')).toBe('ko-kr-csagent-8')
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
  it('defaults to 1 (no time-stretch) for every language', async () => {
    const { getGeminiTtsSpeed } = await loadModule()
    expect(getGeminiTtsSpeed('ko')).toBe(1)
    expect(getGeminiTtsSpeed('ko-KR')).toBe(1)
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
    expect(mod.getGeminiTtsSpeed('ko')).toBe(1)
  })

  it('accepts a per-language list with a * default', async () => {
    process.env.GEMINI_TTS_SPEED = 'ja=1.1, *=1.05, en=bad'
    const { getGeminiTtsSpeed } = await loadModule()
    expect(getGeminiTtsSpeed('ja')).toBe(1.1)
    // Invalid or unlisted -> *.
    expect(getGeminiTtsSpeed('en')).toBe(1.05)
    expect(getGeminiTtsSpeed('ko')).toBe(1.05)
    expect(getGeminiTtsSpeed(null)).toBe(1.05)
  })

  it('uses 1 for unlisted languages when the list has no *', async () => {
    process.env.GEMINI_TTS_SPEED = 'ko=1.1'
    const { getGeminiTtsSpeed } = await loadModule()
    expect(getGeminiTtsSpeed('ko-KR')).toBe(1.1)
    expect(getGeminiTtsSpeed('en')).toBe(1)
  })
})

describe('getGeminiTtsStyle', () => {
  it('asks every language to speak fast, Japanese with a milder wording', async () => {
    const { getGeminiTtsStyle } = await loadModule()
    expect(getGeminiTtsStyle('ko')).toBe('speaking rapidly')
    expect(getGeminiTtsStyle('en-US')).toBe('speaking rapidly')
    expect(getGeminiTtsStyle('zh-CN')).toBe('speaking rapidly')
    expect(getGeminiTtsStyle(null)).toBe('speaking rapidly')
    expect(getGeminiTtsStyle()).toBe('speaking rapidly')
    expect(getGeminiTtsStyle('ja')).toBe('slightly faster than normal pace')
    expect(getGeminiTtsStyle('JA_jp')).toBe('slightly faster than normal pace')
  })

  it('GEMINI_TTS_STYLE replaces the built-in style for every language', async () => {
    process.env.GEMINI_TTS_STYLE = '  speaking very fast  '
    const { getGeminiTtsStyle } = await loadModule()
    expect(getGeminiTtsStyle('ko')).toBe('speaking very fast')
    expect(getGeminiTtsStyle('ja')).toBe('speaking very fast')
    expect(getGeminiTtsStyle(null)).toBe('speaking very fast')
  })

  it('GEMINI_TTS_STYLE=none (any case) turns the style off everywhere', async () => {
    process.env.GEMINI_TTS_STYLE = 'NONE'
    const { getGeminiTtsStyle } = await loadModule()
    expect(getGeminiTtsStyle('ko')).toBeNull()
    expect(getGeminiTtsStyle('ja')).toBeNull()
    expect(getGeminiTtsStyle(null)).toBeNull()
  })

  it('GEMINI_TTS_STYLE_<LANG> overrides or disables one language', async () => {
    process.env.GEMINI_TTS_STYLE = 'none'
    process.env.GEMINI_TTS_STYLE_KO = 'speaking very fast'
    process.env.GEMINI_TTS_STYLE_JA = ' '
    let mod = await loadModule()
    expect(mod.getGeminiTtsStyle('ko-KR')).toBe('speaking very fast')
    // Blank per-language value falls through to the global setting.
    expect(mod.getGeminiTtsStyle('ja')).toBeNull()
    expect(mod.getGeminiTtsStyle('en')).toBeNull()

    delete process.env.GEMINI_TTS_STYLE
    delete process.env.GEMINI_TTS_STYLE_JA
    process.env.GEMINI_TTS_STYLE_KO = 'none'
    mod = await loadModule()
    expect(mod.getGeminiTtsStyle('ko')).toBeNull()
    expect(mod.getGeminiTtsStyle('en')).toBe('speaking rapidly')
  })
})

describe('synthesizeSpeech — gemini post-processing', () => {
  it('only trims silence for Korean by default and keeps the samples bit-exact', async () => {
    // 300 ms silence + 2.8 s tone + 300 ms silence.
    const wav = toneWav(24000, 2800, 300)
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: '안녕하세요', language: 'ko' })

    if (!result.ok) throw new Error('expected success')
    expect(result).toMatchObject({ provider: 'gemini', mime: 'audio/wav', voiceId: 'ko-kr-csagent-8' })
    // 2.8 s tone + 2 x 80 ms padding: no time-stretch.
    expect(wavSeconds(result.audio)).toBeCloseTo(2.96, 1)
    // The kept span is a byte-for-byte slice of the input PCM.
    const out = result.audio.subarray(44)
    const start = (300 - 80) * 24 * 2
    expect(out.equals(wav.subarray(44 + start, 44 + start + out.length))).toBe(true)
    expect(bodyOf(fetchMock.mock.calls[0]).generation_config).toEqual({
      speech_config: [{ voice: 'ko-kr-csagent-8' }],
    })
  })

  it('time-stretches only when GEMINI_TTS_SPEED asks for it', async () => {
    process.env.GEMINI_TTS_SPEED = 'ko=1.4'
    const wav = toneWav(24000, 2800, 300)
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiAudioResponse(wav, 'audio/wav'))
    vi.stubGlobal('fetch', fetchMock)
    const { synthesizeSpeech } = await loadModule()

    const result = await synthesizeSpeech({ text: '안녕하세요', language: 'ko' })

    if (!result.ok) throw new Error('expected success')
    // (2.8 s + 2 x 80 ms padding) / 1.4 = ~2.11 s.
    expect(wavSeconds(result.audio)).toBeGreaterThan(2.0)
    expect(wavSeconds(result.audio)).toBeLessThan(2.2)
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
    // 1.4 s tone + 2 x 80 ms padding.
    expect(wavSeconds(result.audio)).toBeCloseTo(1.56, 1)
  })
})
