import { describe, expect, it } from 'vitest'
import {
  StreamingTtsClip,
  isStreamingTtsClip,
  parseNativeTtsStreamCapability,
  parseStreamedPcmSampleRate,
  readStreamingTtsResponse,
  resolveTtsClipBlob,
} from './tts-stream-clip'

function bytes(length: number, value = 1): Uint8Array {
  return new Uint8Array(length).fill(value)
}

function streamOf(chunks: Uint8Array[], options: { failAfter?: number } = {}): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (options.failAfter !== undefined && index >= options.failAfter) {
        controller.error(new Error('network'))
        return
      }
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(chunks[index++])
    },
  })
}

function collect(clip: StreamingTtsClip) {
  const pieces: Uint8Array[] = []
  let ended = 0
  const unsubscribe = clip.subscribe({ onChunk: (chunk) => pieces.push(chunk), onEnd: () => { ended += 1 } })
  return { pieces, ended: () => ended, unsubscribe }
}

describe('StreamingTtsClip', () => {
  it('hands on pieces of at least 50 ms and flushes the rest at the end', () => {
    const clip = new StreamingTtsClip(24000)
    const seen = collect(clip)

    clip.append(bytes(1000))
    expect(seen.pieces).toHaveLength(0)
    clip.append(bytes(1400))
    expect(seen.pieces.map((piece) => piece.byteLength)).toEqual([2400])
    clip.append(bytes(600))
    clip.finish()

    expect(seen.pieces.map((piece) => piece.byteLength)).toEqual([2400, 600])
    expect(seen.ended()).toBe(1)
    expect(clip.size).toBe(3000)
    expect(clip.isComplete).toBe(true)
    expect(clip.durationMs).toBeCloseTo(62.5)
  })

  it('never hands on half a sample when network chunks split one', () => {
    const clip = new StreamingTtsClip(24000)
    const seen = collect(clip)

    clip.append(bytes(2401, 7))
    clip.append(bytes(2401, 9))
    clip.finish()

    expect(seen.pieces.map((piece) => piece.byteLength)).toEqual([2400, 2402])
    expect(seen.pieces[1][0]).toBe(7)
    expect(seen.pieces[1][1]).toBe(9)
  })

  it('replays earlier pieces to a late subscriber and stops after unsubscribe', () => {
    const clip = new StreamingTtsClip(24000)
    clip.append(bytes(2400))
    const late = collect(clip)
    expect(late.pieces).toHaveLength(1)

    late.unsubscribe()
    clip.append(bytes(2400))
    clip.finish()
    expect(late.pieces).toHaveLength(1)
    expect(late.ended()).toBe(0)

    const afterEnd = collect(clip)
    expect(afterEnd.pieces).toHaveLength(2)
    expect(afterEnd.ended()).toBe(1)
  })

  it('becomes a 16-bit mono WAV at its sample rate once complete', async () => {
    const clip = new StreamingTtsClip(16000)
    const pending = resolveTtsClipBlob(clip)
    clip.append(bytes(3200, 3))
    clip.finish()

    const blob = await pending
    expect(blob.type).toBe('audio/wav')
    const view = new DataView(await blob.arrayBuffer())
    expect(blob.size).toBe(44 + 3200)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(3200)
    expect(view.getUint8(44)).toBe(3)
    expect(isStreamingTtsClip(clip)).toBe(true)
    expect(isStreamingTtsClip(blob)).toBe(false)
    expect(await resolveTtsClipBlob(blob)).toBe(blob)
  })
})

describe('readStreamingTtsResponse', () => {
  it('resolves on the first audio and keeps filling the clip', async () => {
    const clip = await readStreamingTtsResponse(streamOf([bytes(2400), bytes(2400), bytes(1000)]), 24000)
    if (!clip) throw new Error('expected a clip')
    expect(clip.size).toBeGreaterThan(0)

    const blob = await clip.whenComplete()
    expect(clip.size).toBe(5800)
    expect(blob.size).toBe(44 + 5800)
  })

  it('returns null when no audio arrives', async () => {
    expect(await readStreamingTtsResponse(streamOf([]), 24000)).toBeNull()
    expect(await readStreamingTtsResponse(streamOf([bytes(10)], { failAfter: 0 }), 24000)).toBeNull()
  })

  it('ends the clip with what it has when the connection breaks', async () => {
    const clip = await readStreamingTtsResponse(streamOf([bytes(2400), bytes(2400)], { failAfter: 1 }), 24000)
    if (!clip) throw new Error('expected a clip')
    const blob = await clip.whenComplete()
    expect(blob.size).toBe(44 + 2400)
  })
})

describe('stream helpers', () => {
  it('reads the sample rate of streamed PCM content types only', () => {
    expect(parseStreamedPcmSampleRate('audio/L16;rate=24000;channels=1')).toBe(24000)
    expect(parseStreamedPcmSampleRate('audio/l16; rate=16000')).toBe(16000)
    expect(parseStreamedPcmSampleRate('audio/L16')).toBe(24000)
    expect(parseStreamedPcmSampleRate('audio/wav')).toBeNull()
    expect(parseStreamedPcmSampleRate(null)).toBeNull()
  })

  it('reads ttsStream from a capabilities message', () => {
    expect(parseNativeTtsStreamCapability({ type: 'capabilities', ttsStream: true })).toBe(true)
    expect(parseNativeTtsStreamCapability({ type: 'capabilities', nativeTts: true })).toBe(false)
    expect(parseNativeTtsStreamCapability({ type: 'other', ttsStream: true })).toBe(false)
    expect(parseNativeTtsStreamCapability(null)).toBe(false)
  })
})
