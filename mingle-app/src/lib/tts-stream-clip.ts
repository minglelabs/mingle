import {
  TTS_STREAM_CONTENT_TYPE,
  TTS_STREAM_SAMPLE_RATE_HEADER,
  TtsStreamFrameParser,
  type TtsStreamEnd,
} from './tts-stream-format'

const DEFAULT_SAMPLE_RATE = 24000

export type TtsStreamClipConsumer = {
  /** 16-bit little-endian mono PCM, in playing order. */
  onPcm: (pcm: Uint8Array) => void
  /** No more audio will come (the stream completed, was cut off, or was cancelled). */
  onEnd: () => void
}

/**
 * A TTS clip whose audio is still arriving. It exists once the first audio
 * is here, so it can start playing at once; the rest is handed to whoever
 * plays it as it arrives. Everything received is kept, so a late consumer
 * gets the clip from its beginning.
 */
export class TtsStreamClip {
  readonly sampleRate: number
  private readonly pieces: Uint8Array[] = []
  private ended = false
  private consumer: TtsStreamClipConsumer | null = null
  private readonly endWaiters: Array<() => void> = []
  private cancelUpstream: (() => void) | null

  constructor(sampleRate: number, cancelUpstream?: () => void) {
    this.sampleRate = sampleRate
    this.cancelUpstream = cancelUpstream ?? null
  }

  get isEnded(): boolean {
    return this.ended
  }

  /** PCM bytes received so far. */
  get byteLength(): number {
    return this.pieces.reduce((sum, piece) => sum + piece.byteLength, 0)
  }

  /** Duration of what was received so far. */
  get durationMs(): number {
    return (this.byteLength / 2 / this.sampleRate) * 1000
  }

  push(pcm: Uint8Array): void {
    if (this.ended || pcm.byteLength === 0) return
    this.pieces.push(pcm)
    this.consumer?.onPcm(pcm)
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    this.cancelUpstream = null
    this.consumer?.onEnd()
    this.consumer = null
    for (const wake of this.endWaiters.splice(0)) wake()
  }

  /**
   * Hands the clip to its player: what was already received at once, the
   * rest as it arrives, then `onEnd`. One consumer at a time; the returned
   * function detaches it (without ending the clip).
   */
  consume(consumer: TtsStreamClipConsumer): () => void {
    for (const piece of this.pieces) consumer.onPcm(piece)
    if (this.ended) {
      consumer.onEnd()
      return () => {}
    }
    this.consumer = consumer
    return () => {
      if (this.consumer === consumer) this.consumer = null
    }
  }

  /** Nobody will play this clip: stop the request that feeds it. */
  cancel(): void {
    const cancelUpstream = this.cancelUpstream
    this.cancelUpstream = null
    cancelUpstream?.()
    this.end()
  }

  /** The whole clip as a WAV file, once it has ended. Null when it holds no audio. */
  async toWavBlob(): Promise<Blob | null> {
    if (!this.ended) await new Promise<void>((resolve) => this.endWaiters.push(resolve))
    const dataBytes = this.byteLength - (this.byteLength % 2)
    if (dataBytes <= 0) return null
    const wav = new Uint8Array(44 + dataBytes)
    const view = new DataView(wav.buffer)
    const ascii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i)
    }
    ascii(0, 'RIFF')
    view.setUint32(4, 36 + dataBytes, true)
    ascii(8, 'WAVEfmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, this.sampleRate, true)
    view.setUint32(28, this.sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    ascii(36, 'data')
    view.setUint32(40, dataBytes, true)
    let offset = 44
    for (const piece of this.pieces) {
      const room = 44 + dataBytes - offset
      if (room <= 0) break
      wav.set(piece.byteLength > room ? piece.subarray(0, room) : piece, offset)
      offset += piece.byteLength
    }
    return new Blob([wav], { type: 'audio/wav' })
  }
}

/** A clip to play: complete (Blob) or still arriving. */
export type TtsClipAudio = Blob | TtsStreamClip

export function isTtsStreamClip(audio: unknown): audio is TtsStreamClip {
  return audio instanceof TtsStreamClip
}

/** Whether a clip holds something to play. */
export function isPlayableTtsClipAudio(audio: TtsClipAudio | null | undefined): audio is TtsClipAudio {
  if (!audio) return false
  return isTtsStreamClip(audio) ? audio.byteLength > 0 : audio.size > 0
}

export function isTtsStreamResponse(response: { headers: { get(name: string): string | null } }): boolean {
  return (response.headers.get('content-type') || '').toLowerCase().startsWith(TTS_STREAM_CONTENT_TYPE)
}

/**
 * Reads a streamed TTS answer (`tts-stream-format`). Resolves with the clip
 * as soon as its first audio arrives, and keeps filling it in the
 * background; resolves null when the answer ends without any audio.
 * `onEnd` gets the end frame of a complete answer (coin balance).
 */
export async function readTtsStreamResponse(
  response: Response,
  options: { cancel?: () => void, onEnd?: (end: TtsStreamEnd) => void } = {},
): Promise<TtsStreamClip | null> {
  const body = response.body
  if (!body) return null
  const headerRate = Number(response.headers.get(TTS_STREAM_SAMPLE_RATE_HEADER))
  const sampleRate = Number.isFinite(headerRate) && headerRate >= 8000 && headerRate <= 48000
    ? headerRate
    : DEFAULT_SAMPLE_RATE
  const reader = body.getReader()
  const parser = new TtsStreamFrameParser()
  const clip = new TtsStreamClip(sampleRate, () => {
    options.cancel?.()
    void reader.cancel().catch(() => undefined)
  })

  return await new Promise<TtsStreamClip | null>((resolve) => {
    let resolved = false
    const settle = (value: TtsStreamClip | null) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          for (const frame of parser.push(value)) {
            if (frame.type === 'audio') {
              clip.push(frame.pcm)
              settle(clip)
            } else {
              options.onEnd?.(frame.end)
            }
          }
          if (clip.isEnded) break
        }
      } catch {
        // Cut off or cancelled: what arrived is still a clip.
      } finally {
        clip.end()
        settle(clip.byteLength > 0 ? clip : null)
      }
    })()
  })
}
