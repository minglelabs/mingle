// Wire format of a streamed TTS answer (`Content-Type: application/x-mingle-tts-stream`).
//
// The body is a sequence of frames: one type byte, a 4-byte little-endian
// payload length, then the payload.
// - AUDIO frames carry 16-bit little-endian mono PCM at the rate given in the
//   `X-TTS-Sample-Rate` header, in playing order. A frame may hold an odd
//   number of bytes; the sample continues in the next AUDIO frame.
// - One END frame closes a complete answer. Its payload is JSON:
//   `{ coinBalance?: number, coinExhausted?: boolean }`. A body that ends
//   without it was cut off; what arrived is still playable.

export const TTS_STREAM_CONTENT_TYPE = 'application/x-mingle-tts-stream'
export const TTS_STREAM_SAMPLE_RATE_HEADER = 'X-TTS-Sample-Rate'
export const TTS_STREAM_FRAME_AUDIO = 1
export const TTS_STREAM_FRAME_END = 2
const HEADER_BYTES = 5

export type TtsStreamEnd = { coinBalance?: number, coinExhausted?: boolean }

export type TtsStreamFrame =
  | { type: 'audio', pcm: Uint8Array }
  | { type: 'end', end: TtsStreamEnd }

export function encodeTtsStreamFrame(type: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(HEADER_BYTES + payload.byteLength)
  frame[0] = type
  new DataView(frame.buffer).setUint32(1, payload.byteLength, true)
  frame.set(payload, HEADER_BYTES)
  return frame
}

export function encodeTtsStreamEnd(end: TtsStreamEnd): Uint8Array {
  return encodeTtsStreamFrame(TTS_STREAM_FRAME_END, new TextEncoder().encode(JSON.stringify(end)))
}

/** Splits network chunks, cut anywhere, back into frames. Unknown frame types are skipped. */
export class TtsStreamFrameParser {
  private buffered = new Uint8Array(0)

  push(chunk: Uint8Array): TtsStreamFrame[] {
    if (chunk.byteLength > 0) {
      const joined = new Uint8Array(this.buffered.byteLength + chunk.byteLength)
      joined.set(this.buffered, 0)
      joined.set(chunk, this.buffered.byteLength)
      this.buffered = joined
    }
    const frames: TtsStreamFrame[] = []
    let offset = 0
    while (this.buffered.byteLength - offset >= HEADER_BYTES) {
      const view = new DataView(this.buffered.buffer, this.buffered.byteOffset + offset, HEADER_BYTES)
      const type = view.getUint8(0)
      const length = view.getUint32(1, true)
      if (this.buffered.byteLength - offset - HEADER_BYTES < length) break
      const payload = this.buffered.slice(offset + HEADER_BYTES, offset + HEADER_BYTES + length)
      offset += HEADER_BYTES + length
      if (type === TTS_STREAM_FRAME_AUDIO) {
        if (payload.byteLength > 0) frames.push({ type: 'audio', pcm: payload })
      } else if (type === TTS_STREAM_FRAME_END) {
        let end: TtsStreamEnd = {}
        try {
          const parsed = JSON.parse(new TextDecoder().decode(payload)) as TtsStreamEnd
          end = {
            ...(typeof parsed?.coinBalance === 'number' ? { coinBalance: parsed.coinBalance } : {}),
            ...(parsed?.coinExhausted === true ? { coinExhausted: true } : {}),
          }
        } catch {
          end = {}
        }
        frames.push({ type: 'end', end })
      }
    }
    if (offset > 0) this.buffered = this.buffered.slice(offset)
    return frames
  }
}
