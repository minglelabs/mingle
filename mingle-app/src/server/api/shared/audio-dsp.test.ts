import { describe, expect, it } from 'vitest'
import {
  floatToPcm16Buffer,
  parsePcm16Wav,
  pcm16ToMonoFloat,
  timeStretchWsola,
  trimSilence,
} from '@/server/api/shared/audio-dsp'

const SR = 24000

function sine(frequency: number, seconds: number, amplitude = 0.5, sampleRate = SR): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate))
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  return out
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}

/** Frequency from positive-going zero crossings over the steady middle of the clip. */
function zeroCrossingFrequency(x: Float32Array, sampleRate = SR): number {
  const from = Math.floor(x.length * 0.1)
  const to = Math.floor(x.length * 0.9)
  const crossings: number[] = []
  for (let i = from + 1; i < to; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) crossings.push(i - x[i] / (x[i] - x[i - 1]))
  }
  return ((crossings.length - 1) * sampleRate) / (crossings[crossings.length - 1] - crossings[0])
}

/** Dominant frequency by normalised autocorrelation (robust for multi-harmonic signals). */
function autocorrelationFrequency(x: Float32Array, minHz: number, maxHz: number, sampleRate = SR): number {
  const n = 4096
  const start = Math.floor((x.length - n) / 2)
  let bestLag = 0
  let best = -Infinity
  for (let lag = Math.floor(sampleRate / maxHz); lag <= Math.ceil(sampleRate / minHz); lag++) {
    let sum = 0
    for (let i = 0; i < n; i++) sum += x[start + i] * x[start + i + lag]
    if (sum > best) { best = sum; bestLag = lag }
  }
  return sampleRate / bestLag
}

function wav(samples: Int16Array, sampleRate: number, channels: number, extraChunk = false): Buffer {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((v, i) => data.writeInt16LE(v, i * 2))
  const fmt = Buffer.alloc(24)
  fmt.write('fmt ', 0, 'ascii')
  fmt.writeUInt32LE(16, 4)
  fmt.writeUInt16LE(1, 8)
  fmt.writeUInt16LE(channels, 10)
  fmt.writeUInt32LE(sampleRate, 12)
  fmt.writeUInt32LE(sampleRate * channels * 2, 16)
  fmt.writeUInt16LE(channels * 2, 20)
  fmt.writeUInt16LE(16, 22)
  const list = extraChunk ? Buffer.concat([Buffer.from('LIST', 'ascii'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc\0', 'ascii')]) : Buffer.alloc(0)
  const dataHeader = Buffer.alloc(8)
  dataHeader.write('data', 0, 'ascii')
  dataHeader.writeUInt32LE(data.length, 4)
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, list, dataHeader, data])
  const riff = Buffer.alloc(8)
  riff.write('RIFF', 0, 'ascii')
  riff.writeUInt32LE(body.length, 4)
  return Buffer.concat([riff, body])
}

describe('parsePcm16Wav', () => {
  it('reads 16-bit PCM, skipping unknown chunks (odd sizes padded)', () => {
    const parsed = parsePcm16Wav(wav(Int16Array.from([1, -2, 3, -4]), 16000, 2, true))
    expect(parsed).not.toBeNull()
    expect(parsed?.sampleRate).toBe(16000)
    expect(parsed?.channels).toBe(2)
    expect(Array.from(parsed?.samples ?? [])).toEqual([1, -2, 3, -4])
  })

  it('returns null for non-WAV, non-PCM and non-16-bit input', () => {
    expect(parsePcm16Wav(Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000'))).toBeNull()
    const float = wav(Int16Array.from([0, 0]), SR, 1)
    float.writeUInt16LE(3, 20) // WAVE_FORMAT_IEEE_FLOAT
    expect(parsePcm16Wav(float)).toBeNull()
    const eightBit = wav(Int16Array.from([0, 0]), SR, 1)
    eightBit.writeUInt16LE(8, 34)
    expect(parsePcm16Wav(eightBit)).toBeNull()
    // Header without fmt chunk.
    const bare = Buffer.alloc(48)
    bare.write('RIFF', 0, 'ascii')
    bare.write('WAVE', 8, 'ascii')
    expect(parsePcm16Wav(bare)).toBeNull()
  })

  it('downmixes interleaved stereo to mono float and round-trips to PCM16', () => {
    const mono = pcm16ToMonoFloat(Int16Array.from([16384, 0, -16384, -16384]), 2)
    expect(Array.from(mono)).toEqual([0.25, -0.5])
    const bytes = floatToPcm16Buffer(Float32Array.from([0.5, -1, 2]))
    expect([bytes.readInt16LE(0), bytes.readInt16LE(2), bytes.readInt16LE(4)]).toEqual([16384, -32768, 32767])
  })
})

describe('trimSilence', () => {
  it('drops leading/trailing silence and keeps 80 ms padding on each side', () => {
    const clip = concat(new Float32Array(SR * 0.5), sine(200, 1), new Float32Array(SR * 0.7))
    const trimmed = trimSilence(clip, SR)
    // 1 s tone + 2 x 80 ms, within one 10 ms analysis frame.
    expect(trimmed.length / SR).toBeGreaterThan(1.15)
    expect(trimmed.length / SR).toBeLessThan(1.18)
  })

  it('treats audio below -40 dBFS as silence', () => {
    const hiss = sine(1000, 0.3, 0.005) // about -49 dBFS RMS
    const clip = concat(hiss, sine(200, 0.5), hiss)
    expect(trimSilence(clip, SR).length / SR).toBeCloseTo(0.66, 1)
  })

  it('leaves an all-silent clip unchanged and keeps internal pauses', () => {
    const silent = new Float32Array(SR)
    expect(trimSilence(silent, SR)).toBe(silent)
    const clip = concat(sine(200, 0.3), new Float32Array(SR * 0.4), sine(200, 0.3))
    expect(trimSilence(clip, SR).length).toBe(clip.length)
  })
})

describe('timeStretchWsola', () => {
  it.each([1.25, 1.4, 1.6, 0.8])('shortens/lengthens by the factor %s', (speed) => {
    const input = sine(180, 3)
    const out = timeStretchWsola(input, SR, speed)
    const ratio = input.length / out.length
    expect(ratio).toBeGreaterThan(speed * 0.98)
    expect(ratio).toBeLessThan(speed * 1.02)
  })

  it.each([120, 220, 440])('keeps a %s Hz sine within 3%% of its frequency at 1.4x', (frequency) => {
    const out = timeStretchWsola(sine(frequency, 2), SR, 1.4)
    const measured = zeroCrossingFrequency(out)
    expect(Math.abs(measured - frequency) / frequency).toBeLessThan(0.03)
  })

  it('keeps the fundamental of a harmonic, voice-like signal (no resampling pitch shift)', () => {
    const f0 = 130
    const input = new Float32Array(SR * 2)
    for (let i = 0; i < input.length; i++) {
      const t = i / SR
      input[i] = 0.4 * Math.sin(2 * Math.PI * f0 * t) + 0.2 * Math.sin(2 * Math.PI * 2 * f0 * t) + 0.1 * Math.sin(2 * Math.PI * 3 * f0 * t)
    }
    const measured = autocorrelationFrequency(timeStretchWsola(input, SR, 1.4), 70, 300)
    expect(Math.abs(measured - f0) / f0).toBeLessThan(0.03)
  })

  it('does not add energy (no clipping / level jump)', () => {
    const input = sine(200, 2, 0.8)
    const out = timeStretchWsola(input, SR, 1.4)
    const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(peak).toBeLessThanOrEqual(0.8 + 1e-3)
    expect(peak).toBeGreaterThan(0.7)
  })

  it('returns the input untouched for speed 1, invalid speeds and too-short clips', () => {
    const input = sine(200, 1)
    expect(timeStretchWsola(input, SR, 1)).toBe(input)
    expect(timeStretchWsola(input, SR, 0)).toBe(input)
    expect(timeStretchWsola(input, SR, Number.NaN)).toBe(input)
    const tiny = sine(200, 0.01)
    expect(timeStretchWsola(tiny, SR, 1.4)).toBe(tiny)
  })
})
