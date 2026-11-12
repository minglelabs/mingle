/**
 * Speech synthesis, used by the TTS route (`/tts/inworld`, a path kept for
 * its callers; nothing behind it is Inworld).
 *
 * One model, Gemini 3.8 Flash-Lite TTS (`@/lib/tts-models`). There is no
 * user choice and no fallback provider: a failed synthesis returns a failure
 * and nothing is played.
 *
 * Gemini TTS uses the Interactions API (POST /v1beta/interactions) via fetch:
 * https://ai.google.dev/gemini-api/docs/speech-generation
 */

import { decodeAudioContent, detectAudioMime, wrapPcm16AsWav } from '@/server/api/shared/audio-utils'
import {
  StreamingSilenceTrimmer,
  floatToPcm16Buffer,
  parsePcm16Wav,
  pcm16ToMonoFloat,
  timeStretchWsola,
  trimSilence,
} from '@/server/api/shared/audio-dsp'
import { TTS_MODEL, type TtsProviderId } from '@/lib/tts-models'

export type { TtsProviderId }
export { TTS_MODEL }

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

type GeminiStreamEvent = {
  event_type?: string
  delta?: GeminiAudioContent
  error?: { message?: string }
}

/** One piece of audio as Gemini sent it. */
export type GeminiAudioPiece = { audio: Buffer, mime: string, sampleRate?: number }

/** `data:` payloads of a server-sent event stream, one parsed JSON value each. */
async function* readSseJson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  const parseLine = (line: string): unknown => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return undefined
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return undefined
    try {
      return JSON.parse(payload)
    } catch {
      return undefined
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffered += decoder.decode(value, { stream: true })
      let newline = buffered.indexOf('\n')
      while (newline >= 0) {
        const parsed = parseLine(buffered.slice(0, newline))
        buffered = buffered.slice(newline + 1)
        if (parsed !== undefined) yield parsed
        newline = buffered.indexOf('\n')
      }
    }
    const parsed = parseLine(buffered)
    if (parsed !== undefined) yield parsed
  } finally {
    reader.releaseLock()
  }
}

export type GeminiTtsOpenResult =
  | {
    ok: true
    voiceId: string
    modelId: string
    /** Audio pieces in playing order. Throws when the stream breaks or times out. */
    pieces: AsyncGenerator<GeminiAudioPiece>
    /** Stops the upstream request; call when the pieces are no longer wanted. */
    cancel: () => void
  }
  | TtsSynthesisFailure

/**
 * Opens a Gemini synthesis. The text is sent verbatim (Gemini 3.8 TTS treats
 * `text` as a verbatim transcript and may read inline directions aloud). Pace
 * is set by the structured `speech_metadata.style` annotation, which the
 * model follows but never speaks; `system_instruction` is refused by TTS
 * models.
 *
 * The request asks for a stream (`stream: true`): Gemini then sends raw
 * 24 kHz PCM as it is generated, the first piece well under a second in and
 * the last one about a second sooner than the same request answered whole.
 * A JSON (non-stream) answer is read as one piece.
 */
export async function openGeminiTts(input: TtsSynthesisInput): Promise<GeminiTtsOpenResult> {
  const modelId = TTS_MODEL
  const voiceId = getGeminiTtsVoice(input.language)
  const style = getGeminiTtsStyle(input.language)
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    return { ok: false, provider: 'gemini', reason: 'missing_credentials', modelId, voiceId }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), getGeminiTtsTimeoutMs())
  const cancel = () => {
    clearTimeout(timer)
    controller.abort()
  }
  let response: Response
  try {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        input: [{
          type: 'user_input',
          content: [{
            type: 'text',
            text: input.text,
            ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}),
          }],
        }],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [{ voice: voiceId }],
        },
        // Do not retain user utterances server-side (default is store=true).
        store: false,
        stream: true,
      }),
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timer)
    const aborted = controller.signal.aborted
    return { ok: false, provider: 'gemini', reason: aborted ? 'timeout' : 'exception', error, voiceId, modelId }
  }

  if (!response.ok) {
    clearTimeout(timer)
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

  const isEventStream = (response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream')
  async function* pieces(): AsyncGenerator<GeminiAudioPiece> {
    try {
      if (!isEventStream || !response.body) {
        const audioItem = extractGeminiAudio(await response.json() as GeminiInteractionResponse)
        const raw = decodeAudioContent(audioItem?.data)
        if (audioItem && raw && raw.length > 0) {
          yield { audio: raw, mime: audioItem.mime_type || audioItem.mimeType || '', sampleRate: audioItem.sample_rate }
        }
        return
      }
      for await (const parsed of readSseJson(response.body)) {
        const event = parsed as GeminiStreamEvent
        if (event?.event_type === 'error') throw new Error(event.error?.message || 'gemini_stream_error')
        const delta = event?.delta
        if (delta?.type !== 'audio' || typeof delta.data !== 'string' || !delta.data) continue
        const raw = decodeAudioContent(delta.data)
        if (!raw || raw.length === 0) continue
        yield { audio: raw, mime: delta.mime_type || delta.mimeType || '', sampleRate: delta.sample_rate }
      }
    } finally {
      cancel()
    }
  }
  return { ok: true, voiceId, modelId, pieces: pieces(), cancel }
}

function isRawPcmMime(mime: string): boolean {
  const base = mime.trim().toLowerCase().split(';')[0]
  return base === 'audio/l16' || base === 'audio/pcm'
}

/** Gemini synthesis, answered whole: every piece of the stream, joined and post-processed. */
export async function synthesizeWithGemini(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
  const opened = await openGeminiTts(input)
  if (!opened.ok) return opened
  const { voiceId, modelId } = opened

  const collected: GeminiAudioPiece[] = []
  let timedOut = false
  const timeoutWatch = setTimeout(() => { timedOut = true }, getGeminiTtsTimeoutMs())
  try {
    for await (const piece of opened.pieces) collected.push(piece)
  } catch (error) {
    return { ok: false, provider: 'gemini', reason: timedOut ? 'timeout' : 'exception', error, voiceId, modelId }
  } finally {
    clearTimeout(timeoutWatch)
  }
  if (collected.length === 0) {
    return { ok: false, provider: 'gemini', reason: 'invalid_audio', voiceId, modelId }
  }

  // Streamed pieces are headerless PCM that only make sense joined; a single
  // piece may be a container (WAV) and is passed to the sniffing below as is.
  const first = collected[0]
  const joined = collected.length === 1 ? first.audio : Buffer.concat(collected.map((piece) => piece.audio))
  const normalized = collected.length > 1 && isRawPcmMime(first.mime)
    ? { audio: wrapPcm16AsWav(joined, parseSampleRate(first.mime, first.sampleRate), 1), mime: 'audio/wav' }
    : normalizeGeminiAudio(joined, first.mime, first.sampleRate)
  const audio = normalized.mime === 'audio/wav'
    ? postProcessGeminiAudio(normalized.audio, getGeminiTtsSpeed(input.language))
    : normalized.audio
  return { ok: true, provider: 'gemini', audio, mime: normalized.mime, voiceId, modelId }
}

export type TtsPcmStream = {
  ok: true
  provider: TtsProviderId
  voiceId: string
  modelId: string
  sampleRate: number
  /**
   * 16-bit little-endian mono PCM in playing order, silence trimmed at both
   * ends like the whole answer. Throws when the upstream stream breaks.
   */
  pcm: AsyncGenerator<Buffer>
  /** Stops the upstream request; call when the audio is no longer wanted. */
  cancel: () => void
}

/**
 * Synthesize and hand the audio over as it is generated. Returns null when
 * this answer cannot be streamed and must be asked for whole instead
 * (`synthesizeSpeech`): a tempo change (`GEMINI_TTS_SPEED`) needs the whole
 * clip, and so does an upstream answer that is not raw PCM.
 * Resolves once the first audio has arrived, or with the failure.
 */
export async function openSpeechPcmStream(input: TtsSynthesisInput): Promise<TtsPcmStream | TtsSynthesisFailure | null> {
  if (getGeminiTtsSpeed(input.language) !== 1) return null
  const opened = await openGeminiTts(input)
  if (!opened.ok) return opened
  const { voiceId, modelId, pieces, cancel } = opened

  let first: IteratorResult<GeminiAudioPiece>
  try {
    first = await pieces.next()
  } catch (error) {
    console.warn('[tts] gemini stream failed before any audio', { modelId })
    return { ok: false, provider: 'gemini', reason: 'exception', error, voiceId, modelId }
  }
  if (first.done) {
    return { ok: false, provider: 'gemini', reason: 'invalid_audio', voiceId, modelId }
  }
  if (!isRawPcmMime(first.value.mime)) {
    cancel()
    return null
  }

  const sampleRate = parseSampleRate(first.value.mime, first.value.sampleRate)
  const trimmer = new StreamingSilenceTrimmer(sampleRate)
  async function* pcm(): AsyncGenerator<Buffer> {
    try {
      const head = trimmer.push(first.value!.audio)
      if (head.length > 0) yield head
      for await (const piece of pieces) {
        const out = trimmer.push(piece.audio)
        if (out.length > 0) yield out
      }
      const tail = trimmer.end()
      if (tail.length > 0) yield tail
    } finally {
      cancel()
    }
  }
  return { ok: true, provider: 'gemini', voiceId, modelId, sampleRate, pcm: pcm(), cancel }
}

/** Synthesize with the one TTS model. A failure is returned as is: there is no fallback. */
export async function synthesizeSpeech(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
  const result = await synthesizeWithGemini(input)
  if (!result.ok) {
    console.warn('[tts] gemini failed', { reason: result.reason, status: result.status, modelId: result.modelId })
  }
  return result
}
