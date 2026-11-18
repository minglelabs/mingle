/**
 * TTS synthesis — shared by tts-inworld-handler (standalone TTS; the route
 * keeps its old `/tts/inworld` path for installed apps) and
 * translate-finalize-handler (inline TTS).
 *
 * - The client sends the user's selected TTS model per request (`ttsModel` /
 *   `tts.ttsModel`). Missing or invalid values resolve to the default
 *   (gemini-3.8-flash-lite-tts) via `@/lib/tts-models`. No DB lookup on the TTS path.
 * - A failed synthesis (non-2xx, timeout, missing audio, exception) is retried
 *   once with the other Gemini model. Inworld is no longer used.
 *
 * Gemini TTS uses the Interactions API (POST /v1beta/interactions, `stream: true`)
 * via fetch; the streamed PCM chunks are joined into one clip on the server:
 * https://ai.google.dev/gemini-api/docs/speech-generation
 */

import { decodeAudioContent, detectAudioMime, wrapPcm16AsWav } from '@/server/api/shared/audio-utils'
import {
  floatToPcm16Buffer,
  parsePcm16Wav,
  pcm16ToMonoFloat,
  timeStretchWsola,
  trimSilence,
} from '@/server/api/shared/audio-dsp'
import {
  getFallbackTtsModel,
  resolveTtsRuntimeSelection,
  type TtsProviderId,
} from '@/lib/tts-models'

export type { TtsProviderId }
export { resolveTtsRuntimeSelection }

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const DEFAULT_GEMINI_TTS_VOICE = 'Kore'
/**
 * Built-in per-language Gemini voices. Korean uses a male Seoul-Korean voice
 * from the Extended Voice Library (median F0 ~137 Hz measured with the fast
 * default style below); every other language keeps the default voice.
 */
const GEMINI_TTS_LANGUAGE_VOICES: Readonly<Record<string, string>> = {
  ko: 'ko-kr-csagent-8',
}
/**
 * Delivery style sent as a `speech_metadata.style` annotation. Gemini 3.8 TTS
 * treats it as a turn-level direction and never reads it aloud. The default
 * makes every language speak fast; Japanese gets a milder wording because
 * "speaking rapidly" pushed short Japanese lines past the point where they
 * stayed intelligible.
 */
const DEFAULT_GEMINI_TTS_STYLE = 'speaking rapidly'
const GEMINI_TTS_LANGUAGE_STYLES: Readonly<Record<string, string>> = {
  ja: 'slightly faster than normal pace',
}
/** Env value that turns the style annotation off. */
const GEMINI_TTS_STYLE_DISABLED = 'none'
const MIN_GEMINI_TTS_SPEED = 0.5
const MAX_GEMINI_TTS_SPEED = 2
const DEFAULT_GEMINI_TTS_TIMEOUT_MS = 8000
const DEFAULT_PCM_SAMPLE_RATE = 24000

function baseLanguage(language: string | null | undefined): string | null {
  const normalized = (language || '').trim().replace(/_/g, '-').toLowerCase().split('-')[0]
  return normalized || null
}

/**
 * Gemini voice for a language, first match wins:
 * 1. `GEMINI_TTS_VOICE_<LANG>` (e.g. `GEMINI_TTS_VOICE_KO`) — per-language override.
 * 2. The built-in per-language voice (Korean -> a male voice).
 * 3. `GEMINI_TTS_VOICE` — default for every language without a per-language voice.
 * 4. `Kore`.
 */
export function getGeminiTtsVoice(language?: string | null): string {
  const lang = baseLanguage(language)
  if (lang) {
    const override = (process.env[`GEMINI_TTS_VOICE_${lang.toUpperCase()}`] || '').trim()
    if (override) return override
    const builtIn = GEMINI_TTS_LANGUAGE_VOICES[lang]
    if (builtIn) return builtIn
  }
  return (process.env.GEMINI_TTS_VOICE || '').trim() || DEFAULT_GEMINI_TTS_VOICE
}

function clampSpeed(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.min(MAX_GEMINI_TTS_SPEED, Math.max(MIN_GEMINI_TTS_SPEED, value))
}

/**
 * Optional pitch-preserving tempo factor applied to Gemini audio after
 * synthesis (1 = unchanged, 1.2 = 20% faster). Off by default for every
 * language: pace comes from the style annotation (`getGeminiTtsStyle`).
 * `GEMINI_TTS_SPEED` is either one number for every language (`1.1`) or a
 * per-language list (`ko=1.1,*=1`, where `*` covers unlisted languages).
 * Values are clamped to [0.5, 2]; invalid entries are ignored.
 */
export function getGeminiTtsSpeed(language?: string | null): number {
  const lang = baseLanguage(language)
  const raw = (process.env.GEMINI_TTS_SPEED || '').trim()
  if (!raw) return 1
  if (!raw.includes('=')) return clampSpeed(Number(raw)) ?? 1

  const entries = new Map<string, number>()
  for (const part of raw.split(',')) {
    const [key, value] = part.split('=').map((token) => token.trim().toLowerCase())
    const speed = clampSpeed(Number(value))
    if (key && speed !== null) entries.set(key, speed)
  }
  if (lang && entries.has(lang)) return entries.get(lang) as number
  return entries.get('*') ?? 1
}

/** Style env value: undefined when unset/blank, null when set to `none`. */
function readStyleEnv(name: string): string | null | undefined {
  const value = (process.env[name] || '').trim()
  if (!value) return undefined
  return value.toLowerCase() === GEMINI_TTS_STYLE_DISABLED ? null : value
}

/**
 * Delivery style for a language (null = send no style), first match wins:
 * 1. `GEMINI_TTS_STYLE_<LANG>` (e.g. `GEMINI_TTS_STYLE_JA`) — one language.
 * 2. `GEMINI_TTS_STYLE` — every language.
 * 3. The built-in per-language style (Japanese -> a milder wording).
 * 4. `speaking rapidly`.
 * Either env var set to `none` sends no style for the languages it covers.
 */
export function getGeminiTtsStyle(language?: string | null): string | null {
  const lang = baseLanguage(language)
  if (lang) {
    const override = readStyleEnv(`GEMINI_TTS_STYLE_${lang.toUpperCase()}`)
    if (override !== undefined) return override
  }
  const globalStyle = readStyleEnv('GEMINI_TTS_STYLE')
  if (globalStyle !== undefined) return globalStyle
  return (lang && GEMINI_TTS_LANGUAGE_STYLES[lang]) || DEFAULT_GEMINI_TTS_STYLE
}

/**
 * `GEMINI_TTS_STREAM=off` (or `0` / `false`) asks for one unary answer instead
 * of a stream, for A/B checks and as a kill switch. Default: stream.
 */
function isGeminiTtsStreamEnabled(): boolean {
  const value = (process.env.GEMINI_TTS_STREAM || '').trim().toLowerCase()
  return !['off', '0', 'false'].includes(value)
}

function getGeminiTtsTimeoutMs(): number {
  const value = Number(process.env.GEMINI_TTS_TIMEOUT_MS || '')
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_GEMINI_TTS_TIMEOUT_MS
}

export type TtsSynthesisSuccess = {
  ok: true
  provider: TtsProviderId
  audio: Buffer
  mime: string
  voiceId: string
  modelId: string
  /** Model whose failure this result replaces (a retry with the other model). */
  fallbackFrom?: string
}

export type TtsSynthesisFailure = {
  ok: false
  provider: TtsProviderId
  reason:
    | 'missing_credentials'
    | 'upstream_error'
    | 'timeout'
    | 'invalid_audio'
    | 'exception'
  modelId: string
  voiceId?: string
  status?: number
  detail?: string
  error?: unknown
  /** Model whose failure this result replaces (a retry with the other model). */
  fallbackFrom?: string
}

export type TtsSynthesisResult = TtsSynthesisSuccess | TtsSynthesisFailure

export type TtsSynthesisInput = {
  text: string
  /** Normalized base language code (e.g. "ko"), or null. */
  language: string | null
}

type GeminiAudioContent = {
  type?: string
  data?: string
  mime_type?: string
  mimeType?: string
  sample_rate?: number
}

type GeminiInteractionResponse = {
  steps?: Array<{ type?: string, content?: GeminiAudioContent[] }>
}

/** One SSE `data:` payload of a streamed interaction (only the fields read here). */
type GeminiStreamEvent = {
  event_type?: string
  delta?: GeminiAudioContent
  error?: { code?: number, message?: string }
}

type GeminiStreamAudio =
  | { ok: true, audio: GeminiAudioContent & { buffer: Buffer } }
  | { ok: false, detail: string }

type GeminiAudioDelta = { audio: Buffer, mimeType?: string, sampleRate?: number }

/** An `error` event inside a streamed interaction. */
class GeminiStreamError extends Error {}

/**
 * Yields the `step.delta` audio chunks of a `stream: true` interaction (SSE)
 * in order. Chunks are headerless 16-bit PCM (24 kHz by default). Every
 * network read calls `onData`, which the caller uses to reset its idle
 * timeout. An `error` event throws GeminiStreamError.
 */
async function* iterateGeminiAudioDeltas(
  body: ReadableStream<Uint8Array>,
  onData: () => void,
): AsyncGenerator<GeminiAudioDelta, void, void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''

  const parseBlock = (block: string): GeminiAudioDelta | null => {
    const data = block.split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('')
    if (!data || data === '[DONE]') return null
    let event: GeminiStreamEvent
    try { event = JSON.parse(data) as GeminiStreamEvent } catch { return null }
    if (event.event_type === 'error' || event.error) {
      throw new GeminiStreamError(JSON.stringify(event.error ?? event).slice(0, 300))
    }
    const delta = event.delta
    if (event.event_type !== 'step.delta' || delta?.type !== 'audio') return null
    const audio = decodeAudioContent(delta.data)
    if (!audio || audio.length === 0) return null
    return { audio, mimeType: delta.mime_type ?? delta.mimeType, sampleRate: delta.sample_rate }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      onData()
      pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let boundary: number
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const delta = parseBlock(pending.slice(0, boundary))
        pending = pending.slice(boundary + 2)
        if (delta) yield delta
      }
    }
    const tail = pending.trim() ? parseBlock(pending) : null
    if (tail) yield tail
  } finally {
    await reader.cancel().catch(() => {})
  }
}

/** Joins every audio chunk of a streamed interaction into one clip. */
async function readGeminiAudioStream(body: ReadableStream<Uint8Array>, onData: () => void): Promise<GeminiStreamAudio> {
  const chunks: Buffer[] = []
  let format: GeminiAudioContent = {}
  try {
    for await (const delta of iterateGeminiAudioDeltas(body, onData)) {
      if (chunks.length === 0) format = { mime_type: delta.mimeType, sample_rate: delta.sampleRate }
      chunks.push(delta.audio)
    }
  } catch (error) {
    if (error instanceof GeminiStreamError) return { ok: false, detail: error.message }
    throw error
  }
  return {
    ok: true,
    audio: {
      type: 'audio',
      mime_type: format.mime_type || `audio/l16;rate=${format.sample_rate || DEFAULT_PCM_SAMPLE_RATE}`,
      sample_rate: format.sample_rate,
      buffer: Buffer.concat(chunks),
    },
  }
}

/** Last audio block of the model_output steps (as documented for REST). */
function extractGeminiAudio(data: GeminiInteractionResponse): GeminiAudioContent | null {
  const steps = Array.isArray(data?.steps) ? data.steps : []
  let last: GeminiAudioContent | null = null
  for (const step of steps) {
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue
    for (const item of step.content) {
      if (item?.type === 'audio' && typeof item.data === 'string' && item.data) last = item
    }
  }
  return last
}

function parseSampleRate(mime: string, explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit
  const match = /rate=(\d+)/i.exec(mime)
  const rate = match ? Number(match[1]) : NaN
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_PCM_SAMPLE_RATE
}

const PCM_MIME_TYPES = new Set(['audio/l16', 'audio/pcm'])
const MP3_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3'])

/** Lowercased MIME type without parameters ("audio/L16;rate=24000" -> "audio/l16"). */
function baseMimeType(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase()
}

/**
 * Container formats (WAV/MP3/OGG) pass through. Headerless PCM
 * (audio/l16, audio/pcm, or unknown bytes) is wrapped in a 44-byte WAV header.
 *
 * A declared PCM MIME wins over byte sniffing, and a bare MP3 frame sync is
 * trusted only when the declared MIME is MP3: 16-bit PCM whose first sample is
 * -1 starts with ff ff, which detectAudioMime reads as an MP3 frame header.
 */
export function normalizeGeminiAudio(audio: Buffer, mimeHint: string, sampleRate?: number): { audio: Buffer, mime: string } {
  const declared = baseMimeType(mimeHint)
  if (!PCM_MIME_TYPES.has(declared)) {
    const detected = detectAudioMime(audio)
    const bareFrameSync = detected === 'audio/mpeg' && audio[0] === 0xff
    if (detected !== 'application/octet-stream' && (!bareFrameSync || MP3_MIME_TYPES.has(declared))) {
      return { audio, mime: detected }
    }
  }
  const wav = wrapPcm16AsWav(audio, parseSampleRate(mimeHint, sampleRate), 1)
  return { audio: wav, mime: 'audio/wav' }
}

/**
 * Trim leading/trailing silence (keeping ~80 ms) and, when the tempo factor
 * is not 1, time-stretch with pitch-preserving WSOLA. Only 16-bit PCM WAV is
 * processed; anything else (MP3/OGG, other bit depths) is returned
 * unchanged. Output is mono WAV.
 */
export function postProcessGeminiAudio(audio: Buffer, speed: number): Buffer {
  const wav = parsePcm16Wav(audio)
  if (!wav || wav.samples.length === 0) return audio
  const mono = pcm16ToMonoFloat(wav.samples, wav.channels)
  const trimmed = trimSilence(mono, wav.sampleRate)
  const stretched = timeStretchWsola(trimmed, wav.sampleRate, speed)
  return wrapPcm16AsWav(floatToPcm16Buffer(stretched), wav.sampleRate, 1)
}

/**
 * Interactions API request body. The text is sent verbatim; pace rides in the
 * structured (never spoken) style annotation.
 */
function buildGeminiTtsRequestBody(input: {
  text: string
  modelId: string
  voiceId: string
  style: string | null
  stream: boolean
}): string {
  return JSON.stringify({
    model: input.modelId,
    input: [{
      type: 'user_input',
      content: [{
        type: 'text',
        text: input.text,
        ...(input.style ? { annotations: [{ type: 'speech_metadata', style: input.style }] } : {}),
      }],
    }],
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: [{ voice: input.voiceId }],
    },
    // Do not retain user utterances server-side (default is store=true).
    store: false,
    // Streamed audio arrives as it is synthesized: for a short line the
    // whole clip is in about 1.5 s instead of 2.5 s unary.
    ...(input.stream ? { stream: true } : {}),
  })
}

/**
 * Gemini synthesis. The text is sent verbatim (Gemini 3.8 TTS treats `text`
 * as a verbatim transcript and may read inline directions aloud). Pace is
 * set by the structured `speech_metadata.style` annotation, which the model
 * follows but never speaks; `system_instruction` is refused by TTS models.
 */
export async function synthesizeWithGemini(
  input: TtsSynthesisInput & { modelId: string },
): Promise<TtsSynthesisResult> {
  const modelId = input.modelId
  const voiceId = getGeminiTtsVoice(input.language)
  const style = getGeminiTtsStyle(input.language)
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    return { ok: false, provider: 'gemini', reason: 'missing_credentials', modelId, voiceId }
  }

  // Idle timeout: aborts when Gemini sends nothing for GEMINI_TTS_TIMEOUT_MS
  // (before the first byte or between stream chunks), so a long text that
  // keeps streaming is never cut off just for being long.
  const controller = new AbortController()
  const timeoutMs = getGeminiTtsTimeoutMs()
  let timer = setTimeout(() => controller.abort(), timeoutMs)
  const resetTimer = () => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }
  try {
    const response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: buildGeminiTtsRequestBody({ text: input.text, modelId, voiceId, style, stream: isGeminiTtsStreamEnabled() }),
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return {
        ok: false,
        provider: 'gemini',
        reason: 'upstream_error',
        status: response.status,
        detail: detail.slice(0, 300),
        voiceId,
        modelId,
      }
    }

    resetTimer()
    let audioItem: GeminiAudioContent | null
    let raw: Buffer | null
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('text/event-stream') && response.body) {
      const streamed = await readGeminiAudioStream(response.body, resetTimer)
      if (!streamed.ok) {
        return { ok: false, provider: 'gemini', reason: 'upstream_error', detail: streamed.detail, voiceId, modelId }
      }
      audioItem = streamed.audio
      raw = streamed.audio.buffer
    } else {
      // Unary JSON (an interaction that answered without streaming).
      const data = await response.json() as GeminiInteractionResponse
      audioItem = extractGeminiAudio(data)
      raw = decodeAudioContent(audioItem?.data)
    }
    if (!audioItem || !raw || raw.length === 0) {
      return { ok: false, provider: 'gemini', reason: 'invalid_audio', voiceId, modelId }
    }

    const normalized = normalizeGeminiAudio(
      raw,
      audioItem.mime_type || audioItem.mimeType || '',
      audioItem.sample_rate,
    )
    const audio = normalized.mime === 'audio/wav'
      ? postProcessGeminiAudio(normalized.audio, getGeminiTtsSpeed(input.language))
      : normalized.audio
    return { ok: true, provider: 'gemini', audio, mime: normalized.mime, voiceId, modelId }
  } catch (error) {
    const aborted = controller.signal.aborted
    return { ok: false, provider: 'gemini', reason: aborted ? 'timeout' : 'exception', error, voiceId, modelId }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Synthesize with the model the user selected (`ttsModel`, default gemini-3.8-flash-lite-tts).
 * A failure is retried once with the other Gemini model, whose result
 * (success or failure) is returned with `fallbackFrom` set to the first model.
 * A missing API key is not retried: the other model needs the same key.
 */
export async function synthesizeSpeech(
  input: TtsSynthesisInput & { ttsModel?: unknown },
): Promise<TtsSynthesisResult> {
  const selection = resolveTtsRuntimeSelection(input.ttsModel)
  const first = await synthesizeWithGemini({ ...input, modelId: selection.runtimeModel })
  if (first.ok || first.reason === 'missing_credentials') return first

  const retryModel = getFallbackTtsModel(selection.value)
  console.warn('[tts] gemini failed, retrying with the other model', {
    reason: first.reason,
    status: first.status,
    detail: first.detail,
    modelId: first.modelId,
    retryModel,
  })
  const retry = await synthesizeWithGemini({ ...input, modelId: retryModel })
  return { ...retry, fallbackFrom: first.modelId }
}

// ── Streamed speech (audio handed on while it is still being synthesized) ───

export type TtsSpeechStream = {
  ok: true
  provider: TtsProviderId
  modelId: string
  voiceId: string
  sampleRate: number
  /**
   * Headerless 16-bit mono PCM in playback order. Leading silence is trimmed
   * and every chunk holds whole samples. A failure after the first chunk
   * throws from the iterator.
   */
  chunks: AsyncGenerator<Buffer, void, void>
  fallbackFrom?: string
}

const STREAM_TRIM_THRESHOLD_DB = -40
const STREAM_TRIM_PADDING_MS = 80
const STREAM_TRIM_FRAME_MS = 10
// Audio held back while looking for the first sound; after this much silence
// everything is passed on untouched.
const STREAM_TRIM_MAX_HOLD_MS = 1000

/**
 * Streaming counterpart of the leading half of `trimSilence`: drops silence
 * before the first sound (keeping ~80 ms) and re-chunks so that no chunk ends
 * in the middle of a 16-bit sample. Trailing silence is left in.
 */
export async function* trimLeadingSilencePcm16(
  chunks: AsyncIterable<Buffer>,
  sampleRate: number,
): AsyncGenerator<Buffer, void, void> {
  const frameBytes = Math.max(1, Math.round(sampleRate * STREAM_TRIM_FRAME_MS / 1000)) * 2
  const padBytes = Math.round(sampleRate * STREAM_TRIM_PADDING_MS / 1000) * 2
  const maxHoldBytes = Math.round(sampleRate * STREAM_TRIM_MAX_HOLD_MS / 1000) * 2
  const threshold = Math.pow(10, STREAM_TRIM_THRESHOLD_DB / 20) * 32768
  let held: Buffer = Buffer.alloc(0)
  let scanned = 0
  let started = false
  let carry: Buffer | null = null

  for await (const incoming of chunks) {
    let chunk: Buffer = carry ? Buffer.concat([carry, incoming]) : incoming
    carry = null
    if (chunk.length % 2 === 1) {
      carry = Buffer.from(chunk.subarray(chunk.length - 1))
      chunk = chunk.subarray(0, chunk.length - 1)
    }
    if (chunk.length === 0) continue
    if (started) {
      yield chunk
      continue
    }
    held = held.length > 0 ? Buffer.concat([held, chunk]) : chunk
    let loudAt = -1
    while (scanned + frameBytes <= held.length) {
      let sum = 0
      for (let offset = scanned; offset < scanned + frameBytes; offset += 2) {
        const sample = held.readInt16LE(offset)
        sum += sample * sample
      }
      if (Math.sqrt(sum / (frameBytes / 2)) > threshold) {
        loudAt = scanned
        break
      }
      scanned += frameBytes
    }
    if (loudAt >= 0) {
      started = true
      yield held.subarray(Math.max(0, loudAt - padBytes))
      held = Buffer.alloc(0)
    } else if (held.length >= maxHoldBytes) {
      started = true
      yield held
      held = Buffer.alloc(0)
    }
  }
  // Quiet from start to end: handed on unchanged, like `trimSilence`.
  if (!started && held.length > 0) yield held
}

/**
 * Whether speech for this language can be handed on as a stream: streaming is
 * on and no time-stretch is configured (WSOLA needs the whole clip).
 */
export function canStreamSpeech(language?: string | null): boolean {
  return isGeminiTtsStreamEnabled() && getGeminiTtsSpeed(language) === 1
}

/**
 * Starts a Gemini synthesis and resolves once the first audio chunk is in, so
 * a failure before any audio can still be retried or reported as an error.
 */
export async function openGeminiSpeechStream(
  input: TtsSynthesisInput & { modelId: string },
): Promise<TtsSpeechStream | TtsSynthesisFailure> {
  const modelId = input.modelId
  const voiceId = getGeminiTtsVoice(input.language)
  const style = getGeminiTtsStyle(input.language)
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    return { ok: false, provider: 'gemini', reason: 'missing_credentials', modelId, voiceId }
  }

  // Same idle timeout as the unary path; it keeps running while the caller reads.
  const controller = new AbortController()
  const timeoutMs = getGeminiTtsTimeoutMs()
  let timer = setTimeout(() => controller.abort(), timeoutMs)
  const resetTimer = () => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }
  const close = () => {
    clearTimeout(timer)
    controller.abort()
  }
  const failure = (
    reason: TtsSynthesisFailure['reason'],
    extra: Partial<TtsSynthesisFailure> = {},
  ): TtsSynthesisFailure => {
    close()
    return { ok: false, provider: 'gemini', reason, voiceId, modelId, ...extra }
  }

  try {
    const response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: buildGeminiTtsRequestBody({ text: input.text, modelId, voiceId, style, stream: true }),
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return failure('upstream_error', { status: response.status, detail: detail.slice(0, 300) })
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('text/event-stream') || !response.body) {
      return failure('invalid_audio')
    }

    resetTimer()
    const deltas = iterateGeminiAudioDeltas(response.body, resetTimer)
    const first = await deltas.next()
    if (first.done) return failure('invalid_audio')
    const sampleRate = parseSampleRate(first.value.mimeType || '', first.value.sampleRate)

    const raw = async function* (): AsyncGenerator<Buffer, void, void> {
      try {
        yield first.value.audio
        for await (const delta of deltas) yield delta.audio
      } finally {
        await deltas.return().catch(() => {})
        close()
      }
    }
    return {
      ok: true,
      provider: 'gemini',
      modelId,
      voiceId,
      sampleRate,
      chunks: trimLeadingSilencePcm16(raw(), sampleRate),
    }
  } catch (error) {
    if (error instanceof GeminiStreamError) return failure('upstream_error', { detail: error.message })
    const aborted = controller.signal.aborted
    return failure(aborted ? 'timeout' : 'exception', { error })
  }
}

/**
 * Streamed counterpart of `synthesizeSpeech`: the selected model, retried once
 * with the other Gemini model when it fails before any audio arrives.
 */
export async function synthesizeSpeechStream(
  input: TtsSynthesisInput & { ttsModel?: unknown },
): Promise<TtsSpeechStream | TtsSynthesisFailure> {
  const selection = resolveTtsRuntimeSelection(input.ttsModel)
  const first = await openGeminiSpeechStream({ ...input, modelId: selection.runtimeModel })
  if (first.ok || first.reason === 'missing_credentials') return first

  const retryModel = getFallbackTtsModel(selection.value)
  console.warn('[tts] gemini stream failed, retrying with the other model', {
    reason: first.reason,
    status: first.status,
    detail: first.detail,
    modelId: first.modelId,
    retryModel,
  })
  const retry = await openGeminiSpeechStream({ ...input, modelId: retryModel })
  return { ...retry, fallbackFrom: first.modelId }
}
