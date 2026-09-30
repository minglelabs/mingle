import { describe, expect, it } from 'vitest'
import {
  NATIVE_TTS_WATCHDOG_MAX_TIMEOUT_MS,
  NATIVE_TTS_WATCHDOG_MIN_TIMEOUT_MS,
  estimateMp3DurationMs,
  estimateTtsAudioDurationMs,
  estimateWavDurationMs,
  resolveNativeTtsWatchdogTimeoutMs,
} from './tts-audio-duration'

function writeAscii(bytes: Uint8Array, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index)
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
  bytes[offset + 2] = (value >>> 16) & 0xff
  bytes[offset + 3] = (value >>> 24) & 0xff
}

function writeUint16LE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

// PCM16 mono WAV like Gemini TTS returns.
function buildWav(seconds: number, sampleRate = 24_000, options: { streamedSize?: number, extraChunk?: boolean } = {}) {
  const byteRate = sampleRate * 2
  const dataSize = Math.round(seconds * byteRate)
  const extra = options.extraChunk ? 8 + 5 + 1 : 0
  const bytes = new Uint8Array(44 + extra + dataSize)
  writeAscii(bytes, 0, 'RIFF')
  writeUint32LE(bytes, 4, bytes.length - 8)
  writeAscii(bytes, 8, 'WAVE')
  writeAscii(bytes, 12, 'fmt ')
  writeUint32LE(bytes, 16, 16)
  writeUint16LE(bytes, 20, 1)
  writeUint16LE(bytes, 22, 1)
  writeUint32LE(bytes, 24, sampleRate)
  writeUint32LE(bytes, 28, byteRate)
  writeUint16LE(bytes, 32, 2)
  writeUint16LE(bytes, 34, 16)
  let offset = 36
  if (options.extraChunk) {
    // Odd-sized LIST chunk padded to a word boundary.
    writeAscii(bytes, offset, 'LIST')
    writeUint32LE(bytes, offset + 4, 5)
    offset += 8 + 5 + 1
  }
  writeAscii(bytes, offset, 'data')
  writeUint32LE(bytes, offset + 4, options.streamedSize ?? dataSize)
  return bytes
}

// MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo frames.
function buildCbrMp3(seconds: number, options: { id3?: boolean } = {}) {
  const frameBytes = Math.floor((144 * 128_000) / 44_100) // 417
  const frames = Math.round((seconds * 44_100) / 1152)
  const id3Size = options.id3 ? 10 + 20 : 0
  const bytes = new Uint8Array(id3Size + frames * frameBytes)
  if (options.id3) {
    writeAscii(bytes, 0, 'ID3')
    bytes[3] = 4
    bytes[9] = 20
  }
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = id3Size + frame * frameBytes
    bytes[offset] = 0xff
    bytes[offset + 1] = 0xfb
    bytes[offset + 2] = 0x90
    bytes[offset + 3] = 0x00
  }
  return bytes
}

function buildXingMp3(frames: number) {
  const bytes = new Uint8Array(4096)
  // MPEG-1 Layer III, 64 kbps, 44.1 kHz, mono.
  bytes[0] = 0xff
  bytes[1] = 0xfb
  bytes[2] = 0x50
  bytes[3] = 0xc0
  const xingOffset = 4 + 17
  writeAscii(bytes, xingOffset, 'Xing')
  bytes[xingOffset + 7] = 0x01
  bytes[xingOffset + 8] = (frames >>> 24) & 0xff
  bytes[xingOffset + 9] = (frames >>> 16) & 0xff
  bytes[xingOffset + 10] = (frames >>> 8) & 0xff
  bytes[xingOffset + 11] = frames & 0xff
  return bytes
}

describe('estimateWavDurationMs', () => {
  it('reads the data size and byte rate of a PCM WAV', () => {
    expect(estimateWavDurationMs(buildWav(3.5))).toBe(3500)
  })

  it('skips extra chunks and falls back to the payload size for streamed headers', () => {
    expect(estimateWavDurationMs(buildWav(2, 24_000, { extraChunk: true }))).toBe(2000)
    expect(estimateWavDurationMs(buildWav(2, 24_000, { streamedSize: 0xffffffff }))).toBe(2000)
    expect(estimateWavDurationMs(buildWav(2, 24_000, { streamedSize: 0 }))).toBe(2000)
  })

  it('refuses a non-WAV payload', () => {
    expect(estimateWavDurationMs(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull()
  })
})

describe('estimateMp3DurationMs', () => {
  it('derives a CBR clip length from the first frame bitrate', () => {
    const duration = estimateMp3DurationMs(buildCbrMp3(10))!
    expect(Math.abs(duration - 10_000)).toBeLessThan(100)
  })

  it('skips an ID3v2 tag before the first frame', () => {
    const duration = estimateMp3DurationMs(buildCbrMp3(4, { id3: true }))!
    expect(Math.abs(duration - 4_000)).toBeLessThan(100)
  })

  it('prefers the Xing frame count for VBR clips', () => {
    // 383 frames x 1152 samples / 44.1 kHz = 10.005 s, far from what 4 KB at 64 kbps suggests.
    expect(estimateMp3DurationMs(buildXingMp3(383))).toBe(Math.round((383 * 1152 * 1000) / 44_100))
  })

  it('returns null when no frame sync exists', () => {
    expect(estimateMp3DurationMs(new Uint8Array(64))).toBeNull()
  })
})

describe('estimateTtsAudioDurationMs', () => {
  it('routes by content type and sniffs the payload', () => {
    expect(estimateTtsAudioDurationMs(buildWav(1.5), 'audio/wav')).toBe(1500)
    expect(estimateTtsAudioDurationMs(buildWav(1.5), '')).toBe(1500)
    expect(Math.abs(estimateTtsAudioDurationMs(buildCbrMp3(6), 'audio/mpeg')! - 6000)).toBeLessThan(100)
  })
})

describe('resolveNativeTtsWatchdogTimeoutMs', () => {
  it('keeps the old 15 s floor for short clips', () => {
    expect(resolveNativeTtsWatchdogTimeoutMs({ durationMs: 2_000, byteLength: 32_000 })).toBe(NATIVE_TTS_WATCHDOG_MIN_TIMEOUT_MS)
  })

  it('outlasts a long clip so the queue cannot move on while it still plays', () => {
    const durationMs = 40_000
    const timeoutMs = resolveNativeTtsWatchdogTimeoutMs({ durationMs, byteLength: 640_000 })
    expect(timeoutMs).toBeGreaterThan(durationMs)
    expect(timeoutMs).toBe(Math.ceil(durationMs * 1.25 + 5_000))
  })

  it('falls back to a size-based upper bound when the header is unreadable', () => {
    // 400 KB at no less than 4 KB/s is at most 100 s of audio.
    expect(resolveNativeTtsWatchdogTimeoutMs({ durationMs: null, byteLength: 400_000 })).toBe(Math.ceil(100_000 * 1.25 + 5_000))
  })

  it('caps the timeout', () => {
    expect(resolveNativeTtsWatchdogTimeoutMs({ durationMs: 60 * 60_000, byteLength: 0 })).toBe(NATIVE_TTS_WATCHDOG_MAX_TIMEOUT_MS)
  })
})
