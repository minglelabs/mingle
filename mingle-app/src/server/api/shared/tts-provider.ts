/**
 * TTS provider abstraction — shared by tts-inworld-handler (standalone TTS)
 * and translate-finalize-handler (inline TTS).
 *
 * - The client sends the user's selected TTS model per request (`ttsModel` /
 *   `tts.ttsModel`). Missing or invalid values resolve to the default
 *   (gemini-3.8-flash-tts) via `@/lib/tts-models`. No DB lookup on the TTS path.
 * - Gemini failures (non-2xx, timeout, missing audio, exception, missing key)
 *   fall back to Inworld automatically.
 *
 * Gemini TTS uses the Interactions API (POST /v1beta/interactions) via fetch:
 * https://ai.google.dev/gemini-api/docs/speech-generation
 */

import { getInworldAuthHeaderValue } from '@/server/api/shared/inworld-auth'
import { decodeAudioContent, detectAudioMime, wrapPcm16AsWav } from '@/server/api/shared/audio-utils'
import { resolveVoiceId, INWORLD_API_BASE } from '@/server/api/shared/inworld-voice'
import {
  getInworldTtsModelId,
  resolveTtsRuntimeSelection,
  type TtsProviderId,
} from '@/lib/tts-models'

export type { TtsProviderId }
export { getInworldTtsModelId, resolveTtsRuntimeSelection }

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const DEFAULT_GEMINI_TTS_VOICE = 'Kore'
const DEFAULT_GEMINI_TTS_TIMEOUT_MS = 8000
const DEFAULT_PCM_SAMPLE_RATE = 24000

function getInworldSpeakingRate(): number {
  const rate = Number(process.env.INWORLD_TTS_SPEAKING_RATE || '1.3')
  return Number.isFinite(rate) && rate > 0 ? rate : 1.3
}

export function getGeminiTtsVoice(): string {
  return (process.env.GEMINI_TTS_VOICE || '').trim() || DEFAULT_GEMINI_TTS_VOICE
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
  fallbackFrom?: TtsProviderId
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
  fallbackFrom?: TtsProviderId
}

export type TtsSynthesisResult = TtsSynthesisSuccess | TtsSynthesisFailure

export type TtsSynthesisInput = {
  text: string
  /** Normalized base language code (e.g. "ko"), or null. */
  language: string | null
  /** Inworld voice id sent by the client. Ignored on the Gemini path. */
  requestedVoiceId?: string
}

/**
 * Inworld synthesis — request body, defaults and voice resolution are
 * identical to the pre-refactor handlers.
 */
export async function synthesizeWithInworld(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
  const modelId = getInworldTtsModelId()
  const authHeader = getInworldAuthHeaderValue()
  if (!authHeader) {
    return { ok: false, provider: 'inworld', reason: 'missing_credentials', modelId }
  }

  const voiceId = input.requestedVoiceId?.trim() || await resolveVoiceId(authHeader, input.language)
  try {
    const response = await fetch(`${INWORLD_API_BASE}/tts/v1/voice`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: input.text,
        voiceId,
        modelId,
        audioConfig: {
          speakingRate: getInworldSpeakingRate(),
        },
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return {
        ok: false,
        provider: 'inworld',
        reason: 'upstream_error',
        status: response.status,
        detail: detail.slice(0, 300),
        voiceId,
        modelId,
      }
    }

    const data = await response.json() as { audioContent?: string }
    const audio = decodeAudioContent(data.audioContent)
    if (!audio) {
      return { ok: false, provider: 'inworld', reason: 'invalid_audio', voiceId, modelId }
    }
    return { ok: true, provider: 'inworld', audio, mime: detectAudioMime(audio), voiceId, modelId }
  } catch (error) {
    return { ok: false, provider: 'inworld', reason: 'exception', error, voiceId, modelId }
  }
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
 * Gemini synthesis. The text is sent verbatim — no style instruction is
 * prepended (Gemini 3.8 TTS may read inline directions aloud).
 */
export async function synthesizeWithGemini(
  input: TtsSynthesisInput & { modelId: string },
): Promise<TtsSynthesisResult> {
  const modelId = input.modelId
  const voiceId = getGeminiTtsVoice()
  const apiKey = (process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) {
    return { ok: false, provider: 'gemini', reason: 'missing_credentials', modelId, voiceId }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), getGeminiTtsTimeoutMs())
  try {
    const response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        input: [{
          type: 'user_input',
          content: [{ type: 'text', text: input.text }],
        }],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [{ voice: voiceId }],
        },
        // Do not retain user utterances server-side (default is store=true).
        store: false,
      }),
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

    const data = await response.json() as GeminiInteractionResponse
    const audioItem = extractGeminiAudio(data)
    const raw = decodeAudioContent(audioItem?.data)
    if (!audioItem || !raw || raw.length === 0) {
      return { ok: false, provider: 'gemini', reason: 'invalid_audio', voiceId, modelId }
    }

    const normalized = normalizeGeminiAudio(
      raw,
      audioItem.mime_type || audioItem.mimeType || '',
      audioItem.sample_rate,
    )
    return { ok: true, provider: 'gemini', audio: normalized.audio, mime: normalized.mime, voiceId, modelId }
  } catch (error) {
    const aborted = controller.signal.aborted
    return { ok: false, provider: 'gemini', reason: aborted ? 'timeout' : 'exception', error, voiceId, modelId }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Synthesize with the model the user selected (`ttsModel`, default gemini-3.8-flash-tts).
 * Gemini failures fall back to Inworld; the Inworld result (success or
 * failure) is then returned with `fallbackFrom: 'gemini'`.
 */
export async function synthesizeSpeech(
  input: TtsSynthesisInput & { ttsModel?: unknown },
): Promise<TtsSynthesisResult> {
  const selection = resolveTtsRuntimeSelection(input.ttsModel)
  if (selection.provider === 'inworld') return await synthesizeWithInworld(input)

  const geminiResult = await synthesizeWithGemini({ ...input, modelId: selection.runtimeModel })
  if (geminiResult.ok) return geminiResult

  console.warn('[tts] gemini failed, falling back to inworld', {
    reason: geminiResult.reason,
    status: geminiResult.status,
    modelId: geminiResult.modelId,
  })
  const inworldResult = await synthesizeWithInworld(input)
  return { ...inworldResult, fallbackFrom: 'gemini' }
}
