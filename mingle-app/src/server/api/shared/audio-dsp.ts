/**
 * Pure-TypeScript audio DSP for TTS post-processing (no ffmpeg, no native
 * binaries — runs anywhere Node runs, including Railway).
 *
 * - parsePcm16Wav: read mono/stereo 16-bit PCM out of a RIFF/WAVE buffer.
 * - trimSilence: drop leading/trailing silence, keeping a little padding.
 * - timeStretchWsola: change tempo WITHOUT changing pitch (WSOLA). Speeding up
 *   by resampling would raise the pitch, so it is never done here.
 *
 * This file intentionally has no imports so it can be unit-tested and
 * benchmarked in isolation.
 */

export type Pcm16Wav = {
  samples: Int16Array
  sampleRate: number
  channels: number
}

/**
 * Parse a RIFF/WAVE buffer holding 16-bit linear PCM. Returns null for any
 * other layout (compressed formats, other bit depths, truncated headers) so
 * callers can pass such audio through untouched.
 */
export function parsePcm16Wav(buffer: Buffer): Pcm16Wav | null {
  if (buffer.length < 12) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null

  let offset = 12
  let format: { audioFormat: number, channels: number, sampleRate: number, bitsPerSample: number } | null = null
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ' && size >= 16 && body + 16 <= buffer.length) {
      format = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      }
    } else if (id === 'data') {
      // 1 = PCM, 0xFFFE = WAVE_FORMAT_EXTENSIBLE (PCM sub-format in practice).
      if (!format || (format.audioFormat !== 1 && format.audioFormat !== 0xfffe)) return null
      if (format.bitsPerSample !== 16 || format.channels < 1 || format.sampleRate <= 0) return null
      // Streaming encoders may write 0 / 0xFFFFFFFF sizes; clamp to what is present.
      const end = Math.min(buffer.length, size === 0 || size === 0xffffffff ? buffer.length : body + size)
      const byteLength = (end - body) - ((end - body) % (2 * format.channels))
      const samples = new Int16Array(byteLength / 2)
      for (let i = 0; i < samples.length; i++) samples[i] = buffer.readInt16LE(body + i * 2)
      return { samples, sampleRate: format.sampleRate, channels: format.channels }
    }
    offset = body + size + (size % 2)
  }
  return null
}

/** Interleaved Int16 -> mono Float32 in [-1, 1). */
export function pcm16ToMonoFloat(samples: Int16Array, channels: number): Float32Array {
  const frames = Math.floor(samples.length / channels)
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += samples[i * channels + c]
    out[i] = sum / channels / 32768
  }
  return out
}

/**
 * Float32 -> little-endian 16-bit PCM bytes (clipped). Uses the same 32768
 * scale as `pcm16ToMonoFloat`, so mono PCM that is only trimmed round-trips
 * bit-exactly.
 */
export function floatToPcm16Buffer(samples: Float32Array): Buffer {
  const out = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const value = Math.round(samples[i] * 32768)
    out.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2)
  }
  return out
}

export type TrimSilenceOptions = {
  /** Frame RMS at or below this level (dBFS) counts as silence. Default -40. */
  thresholdDb?: number
  /** Silence kept before the first and after the last loud frame. Default 80 ms. */
  paddingMs?: number
  /** Analysis frame length. Default 10 ms. */
  frameMs?: number
}

/**
 * Trim leading and trailing silence. Returns the input unchanged when no
 * frame is above the threshold (never returns an empty clip for quiet audio).
 */
export function trimSilence(samples: Float32Array, sampleRate: number, options: TrimSilenceOptions = {}): Float32Array {
  const thresholdDb = options.thresholdDb ?? -40
  const paddingMs = options.paddingMs ?? 80
  const frame = Math.max(1, Math.round(sampleRate * (options.frameMs ?? 10) / 1000))
  const threshold = Math.pow(10, thresholdDb / 20)
  const frames = Math.floor(samples.length / frame)

  const loud = (f: number) => {
    let sum = 0
    const start = f * frame
    for (let i = start; i < start + frame; i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / frame) > threshold
  }

  let first = -1
  for (let f = 0; f < frames; f++) {
    if (loud(f)) { first = f; break }
  }
  if (first < 0) return samples
  let last = first
  for (let f = frames - 1; f > first; f--) {
    if (loud(f)) { last = f; break }
  }

  const pad = Math.round(sampleRate * paddingMs / 1000)
  const start = Math.max(0, first * frame - pad)
  const end = Math.min(samples.length, (last + 1) * frame + pad)
  return samples.subarray(start, end)
}

export type WsolaOptions = {
  /** Frame (window) length. Default 25 ms. */
  frameMs?: number
  /** Max shift searched around the nominal analysis position. Default 8 ms. */
  toleranceMs?: number
}

/**
 * Pitch-preserving time-scale modification (WSOLA).
 *
 * `speed` > 1 plays faster (output length ~= input / speed); pitch is kept
 * because frames are copied at the original sample rate — only the spacing
 * between them changes. Each next frame is taken from the position, within
 * +-tolerance of its nominal spot, that best continues the waveform already
 * written, so periodic (voiced) segments join in phase.
 *
 * The correlation search runs on a 4x-decimated signal and is then refined at
 * full resolution, which keeps a 10 s clip in the low tens of milliseconds.
 */
export function timeStretchWsola(
  input: Float32Array,
  sampleRate: number,
  speed: number,
  options: WsolaOptions = {},
): Float32Array {
  if (!Number.isFinite(speed) || speed <= 0 || Math.abs(speed - 1) < 1e-3) return input

  const frameLen = Math.max(16, 2 * Math.round(sampleRate * (options.frameMs ?? 25) / 2000))
  const synthesisHop = frameLen / 2
  const analysisHop = synthesisHop * speed
  const tolerance = Math.max(1, Math.round(sampleRate * (options.toleranceMs ?? 8) / 1000))
  if (input.length < frameLen + 2 * tolerance) return input

  // Periodic Hann: overlap-added at 50% hop it sums to exactly 1.
  const window = new Float32Array(frameLen)
  for (let i = 0; i < frameLen; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frameLen)

  const outLength = Math.max(frameLen, Math.round(input.length / speed))
  const output = new Float32Array(outLength + frameLen)
  const weight = new Float32Array(outLength + frameLen)

  const maxStart = input.length - frameLen
  const DECIMATE = 4

  // Dot product of input[a..a+frameLen) and input[b..b+frameLen), stepping `step`.
  const correlate = (a: number, b: number, step: number) => {
    let sum = 0
    for (let i = 0; i < frameLen; i += step) sum += input[a + i] * input[b + i]
    return sum
  }

  let prevStart = 0
  for (let k = 0; ; k++) {
    const outPos = k * synthesisHop
    if (outPos >= outLength) break

    let start: number
    if (k === 0) {
      start = 0
    } else {
      const nominal = Math.round(k * analysisHop)
      // The segment that would naturally follow what we last copied.
      const natural = Math.min(maxStart, prevStart + synthesisHop)
      const lo = Math.max(0, nominal - tolerance)
      const hi = Math.min(maxStart, nominal + tolerance)
      if (lo > hi) break

      let best = Math.min(Math.max(nominal, lo), hi)
      let bestScore = -Infinity
      for (let s = lo; s <= hi; s += 2) {
        const score = correlate(natural, s, DECIMATE)
        if (score > bestScore) { bestScore = score; best = s }
      }
      const refineLo = Math.max(lo, best - 2)
      const refineHi = Math.min(hi, best + 2)
      bestScore = -Infinity
      for (let s = refineLo; s <= refineHi; s++) {
        const score = correlate(natural, s, 1)
        if (score > bestScore) { bestScore = score; best = s }
      }
      start = best
    }

    for (let i = 0; i < frameLen; i++) {
      output[outPos + i] += input[start + i] * window[i]
      weight[outPos + i] += window[i]
    }
    prevStart = start
  }

  // Normalise by the summed window (only differs from 1 at the edges).
  const result = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const w = weight[i]
    result[i] = w > 1e-3 ? output[i] / w : output[i]
  }
  return result
}
