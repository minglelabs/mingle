// A TTS clip that is still arriving. The server answers a `stream: true`
// request with headerless 16-bit mono PCM (`audio/L16;rate=24000`) while the
// voice is being synthesized; a shell that reports `ttsStream` plays the
// pieces as they come, so the sentence starts before the clip is complete.
// Everything else waits for `whenComplete()` and plays the WAV as before.

// Pieces handed to listeners are at least this long (the last one may be
// shorter): fewer bridge messages, and never half a sample.
const MIN_PIECE_MS = 50

export type StreamingTtsClipListener = {
  onChunk: (chunk: Uint8Array) => void
  // No more audio will come (complete, or cut short by a failure).
  onEnd: () => void
}

export class StreamingTtsClip {
  readonly sampleRate: number
  private readonly minPieceBytes: number
  private readonly pieces: Uint8Array[] = []
  private pending: Uint8Array[] = []
  private pendingBytes = 0
  private totalBytes = 0
  private ended = false
  private readonly listeners = new Set<StreamingTtsClipListener>()
  private completeWaiters: Array<(blob: Blob) => void> = []

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
    this.minPieceBytes = Math.max(2, Math.round(sampleRate * MIN_PIECE_MS / 1000) * 2)
  }

  /** Bytes received so far (the auto-read controller's "has audio" check). */
  get size(): number {
    return this.totalBytes
  }

  get isComplete(): boolean {
    return this.ended
  }

  /** Length of what has arrived so far. */
  get durationMs(): number {
    return (this.totalBytes / 2 / this.sampleRate) * 1000
  }

  append(bytes: Uint8Array): void {
    if (this.ended || bytes.byteLength === 0) return
    this.pending.push(bytes)
    this.pendingBytes += bytes.byteLength
    this.totalBytes += bytes.byteLength
    if (this.pendingBytes >= this.minPieceBytes) this.flush(false)
  }

  finish(): void {
    if (this.ended) return
    this.flush(true)
    this.ended = true
    for (const listener of [...this.listeners]) listener.onEnd()
    this.listeners.clear()
    const waiters = this.completeWaiters
    this.completeWaiters = []
    if (waiters.length > 0) {
      const blob = this.toWavBlob()
      for (const resolve of waiters) resolve(blob)
    }
  }

  /**
   * Replays the pieces that are already in, then delivers the rest as they
   * arrive. Returns a function that stops delivery.
   */
  subscribe(listener: StreamingTtsClipListener): () => void {
    for (const piece of this.pieces) listener.onChunk(piece)
    if (this.ended) {
      listener.onEnd()
      return () => {}
    }
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** The whole clip as a WAV, once it has ended. */
  whenComplete(): Promise<Blob> {
    if (this.ended) return Promise.resolve(this.toWavBlob())
    return new Promise((resolve) => { this.completeWaiters.push(resolve) })
  }

  private flush(final: boolean): void {
    if (this.pendingBytes === 0) return
    // Whole samples only; an odd byte waits for the next network chunk.
    const usable = this.pendingBytes - (this.pendingBytes % 2)
    if (usable === 0) {
      if (final) { this.pending = []; this.pendingBytes = 0 }
      return
    }
    const joined = new Uint8Array(this.pendingBytes)
    let offset = 0
    for (const part of this.pending) {
      joined.set(part, offset)
      offset += part.byteLength
    }
    const piece = joined.subarray(0, usable)
    const rest = joined.subarray(usable)
    this.pending = rest.byteLength > 0 && !final ? [rest] : []
    this.pendingBytes = this.pending.length > 0 ? rest.byteLength : 0
    this.pieces.push(piece)
    for (const listener of [...this.listeners]) listener.onChunk(piece)
  }

  private toWavBlob(): Blob {
    const dataBytes = this.pieces.reduce((sum, piece) => sum + piece.byteLength, 0)
    const header = new DataView(new ArrayBuffer(44))
    const writeAscii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i))
    }
    writeAscii(0, 'RIFF')
    header.setUint32(4, 36 + dataBytes, true)
    writeAscii(8, 'WAVE')
    writeAscii(12, 'fmt ')
    header.setUint32(16, 16, true)
    header.setUint16(20, 1, true)
    header.setUint16(22, 1, true)
    header.setUint32(24, this.sampleRate, true)
    header.setUint32(28, this.sampleRate * 2, true)
    header.setUint16(32, 2, true)
    header.setUint16(34, 16, true)
    writeAscii(36, 'data')
    header.setUint32(40, dataBytes, true)
    return new Blob([header.buffer, ...this.pieces.map((piece) => piece.slice().buffer)], { type: 'audio/wav' })
  }
}

export type TtsClipAudio = Blob | StreamingTtsClip

export function isStreamingTtsClip(audio: unknown): audio is StreamingTtsClip {
  return audio instanceof StreamingTtsClip
}

/** The clip as one playable blob (waits for a streaming clip to end). */
export function resolveTtsClipBlob(audio: TtsClipAudio): Promise<Blob> {
  return isStreamingTtsClip(audio) ? audio.whenComplete() : Promise.resolve(audio)
}

/** Sample rate of an `audio/L16;rate=…` content type; null for anything else. */
export function parseStreamedPcmSampleRate(contentType: string | null | undefined): number | null {
  const value = (contentType || '').toLowerCase()
  const base = value.split(';')[0].trim()
  if (base !== 'audio/l16' && base !== 'audio/pcm') return null
  const rate = Number(/rate=(\d+)/.exec(value)?.[1])
  return Number.isFinite(rate) && rate > 0 ? rate : 24000
}

/**
 * Reads a streamed PCM response. Resolves as soon as the first audio is in
 * (null when none arrives); the rest keeps filling the clip in the background.
 * A read failure or an abort ends the clip with what it has.
 */
export async function readStreamingTtsResponse(
  body: ReadableStream<Uint8Array>,
  sampleRate: number,
): Promise<StreamingTtsClip | null> {
  const reader = body.getReader()
  const clip = new StreamingTtsClip(sampleRate)
  try {
    while (clip.size === 0) {
      const { done, value } = await reader.read()
      if (done) return null
      if (value) clip.append(value)
    }
  } catch {
    return null
  }
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) clip.append(value)
      }
    } catch {
      // Cut short: what arrived is still played.
    } finally {
      clip.finish()
    }
  })()
  return clip
}

// Whether the shell plays `native_tts_stream_*` messages (`ttsStream: true` in
// its capabilities message). Shells without it get whole clips.
export function parseNativeTtsStreamCapability(capabilities: unknown): boolean {
  if (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities)) return false
  const record = capabilities as Record<string, unknown>
  return record.type === 'capabilities' && record.ttsStream === true
}
