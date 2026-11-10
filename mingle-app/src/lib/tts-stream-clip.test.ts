import { describe, expect, it, vi } from 'vitest'
import {
  TTS_STREAM_CONTENT_TYPE,
  TTS_STREAM_FRAME_AUDIO,
  encodeTtsStreamEnd,
  encodeTtsStreamFrame,
} from './tts-stream-format'
import {
  TtsStreamClip,
  isPlayableTtsClipAudio,
  isTtsStreamResponse,
  readTtsStreamResponse,
} from './tts-stream-clip'

function audioFrame(bytes: number[]): Uint8Array {
  return encodeTtsStreamFrame(TTS_STREAM_FRAME_AUDIO, new Uint8Array(bytes))
}

/** A streamed answer whose network chunks the test releases one at a time. */
function controlledResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c } })
  const response = new Response(body, {
    headers: { 'Content-Type': TTS_STREAM_CONTENT_TYPE, 'X-TTS-Sample-Rate': '16000' },
  })
  return { response, send: (chunk: Uint8Array) => controller.enqueue(chunk), close: () => controller.close() }
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('readTtsStreamResponse', () => {
  it('hands the clip over at the first audio and keeps filling it', async () => {
    const { response, send, close } = controlledResponse()
    expect(isTtsStreamResponse(response)).toBe(true)
    const onEnd = vi.fn()
    const pending = readTtsStreamResponse(response, { onEnd })

    send(audioFrame([1, 2]))
    const clip = await pending
    expect(clip).not.toBeNull()
    expect(clip!.sampleRate).toBe(16000)
    expect(clip!.isEnded).toBe(false)

    const played: number[] = []
    const ended = vi.fn()
    clip!.consume({ onPcm: (pcm) => played.push(...pcm), onEnd: ended })
    expect(played).toEqual([1, 2])

    send(audioFrame([3, 4]))
    await flush()
    expect(played).toEqual([1, 2, 3, 4])
    expect(ended).not.toHaveBeenCalled()

    send(encodeTtsStreamEnd({ coinBalance: 77 }))
    close()
    await flush()
    expect(ended).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith({ coinBalance: 77 })
    expect(clip!.isEnded).toBe(true)
  })

  it('resolves null when the answer ends without audio', async () => {
    const { response, send, close } = controlledResponse()
    const pending = readTtsStreamResponse(response)
    send(encodeTtsStreamEnd({}))
    close()
    expect(await pending).toBeNull()
  })

  it('keeps what arrived when the answer is cut off', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const response = new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c } }), {
      headers: { 'Content-Type': TTS_STREAM_CONTENT_TYPE },
    })
    const pending = readTtsStreamResponse(response)
    controller.enqueue(audioFrame([9, 9, 9, 9]))
    const clip = await pending
    controller.error(new Error('network'))
    await flush()
    expect(clip!.isEnded).toBe(true)
    expect(clip!.byteLength).toBe(4)
    expect(clip!.sampleRate).toBe(24000)
  })

  it('cancel stops the request and ends the clip', async () => {
    const { response, send } = controlledResponse()
    const cancel = vi.fn()
    const pending = readTtsStreamResponse(response, { cancel })
    send(audioFrame([1, 2]))
    const clip = await pending
    const ended = vi.fn()
    clip!.consume({ onPcm: () => {}, onEnd: ended })
    clip!.cancel()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(clip!.isEnded).toBe(true)
  })
})

describe('TtsStreamClip', () => {
  it('replays everything to a late consumer of an ended clip', () => {
    const clip = new TtsStreamClip(24000)
    clip.push(new Uint8Array([1, 2]))
    clip.push(new Uint8Array([3, 4]))
    clip.end()
    const played: number[] = []
    const ended = vi.fn()
    clip.consume({ onPcm: (pcm) => played.push(...pcm), onEnd: ended })
    expect(played).toEqual([1, 2, 3, 4])
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('stops feeding a detached consumer', () => {
    const clip = new TtsStreamClip(24000)
    const onPcm = vi.fn()
    const detach = clip.consume({ onPcm, onEnd: () => {} })
    detach()
    clip.push(new Uint8Array([1, 2]))
    expect(onPcm).not.toHaveBeenCalled()
  })

  it('builds a WAV of the whole clip once it ended', async () => {
    const clip = new TtsStreamClip(24000)
    clip.push(new Uint8Array([1, 2, 3]))
    const pending = clip.toWavBlob()
    clip.push(new Uint8Array([4, 5]))
    clip.end()
    const wav = new Uint8Array(await (await pending)!.arrayBuffer())
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(24000)
    // The dangling fifth byte (half a sample) is dropped.
    expect([...wav.slice(44)]).toEqual([1, 2, 3, 4])
    expect(clip.durationMs).toBeCloseTo((5 / 2 / 24000) * 1000)
  })

  it('counts a clip as playable only when it holds audio', () => {
    const clip = new TtsStreamClip(24000)
    expect(isPlayableTtsClipAudio(clip)).toBe(false)
    clip.push(new Uint8Array([1, 2]))
    expect(isPlayableTtsClipAudio(clip)).toBe(true)
    expect(isPlayableTtsClipAudio(new Blob([]))).toBe(false)
    expect(isPlayableTtsClipAudio(new Blob(['x']))).toBe(true)
    expect(isPlayableTtsClipAudio(null)).toBe(false)
  })
})
