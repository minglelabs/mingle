import { describe, expect, it } from 'vitest'
import {
  TTS_STREAM_FRAME_AUDIO,
  TtsStreamFrameParser,
  encodeTtsStreamEnd,
  encodeTtsStreamFrame,
} from './tts-stream-format'

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

describe('tts stream frames', () => {
  const body = concat([
    encodeTtsStreamFrame(TTS_STREAM_FRAME_AUDIO, new Uint8Array([1, 2, 3])),
    encodeTtsStreamFrame(TTS_STREAM_FRAME_AUDIO, new Uint8Array([4, 5, 6, 7])),
    encodeTtsStreamFrame(9, new Uint8Array([42])),
    encodeTtsStreamEnd({ coinBalance: 120, coinExhausted: true }),
  ])

  it('round-trips frames delivered whole', () => {
    expect(new TtsStreamFrameParser().push(body)).toEqual([
      { type: 'audio', pcm: new Uint8Array([1, 2, 3]) },
      { type: 'audio', pcm: new Uint8Array([4, 5, 6, 7]) },
      { type: 'end', end: { coinBalance: 120, coinExhausted: true } },
    ])
  })

  it('reassembles frames cut at every possible byte', () => {
    for (let cut = 1; cut < body.byteLength; cut++) {
      const parser = new TtsStreamFrameParser()
      const frames = [...parser.push(body.slice(0, cut)), ...parser.push(body.slice(cut))]
      expect(frames).toHaveLength(3)
      expect(frames[1]).toEqual({ type: 'audio', pcm: new Uint8Array([4, 5, 6, 7]) })
      expect(frames[2]).toEqual({ type: 'end', end: { coinBalance: 120, coinExhausted: true } })
    }
  })

  it('reads an unreadable end payload as an empty end', () => {
    const parser = new TtsStreamFrameParser()
    expect(parser.push(encodeTtsStreamFrame(2, new Uint8Array([123])))).toEqual([{ type: 'end', end: {} }])
  })
})
