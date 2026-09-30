// Clip-length estimate for the iOS native TTS watchdog. The native player
// reports the end of a clip over the bridge; the watchdog only frees the queue
// when that report never arrives, so it must outlast the clip itself. The TTS
// API returns MP3 (Inworld) or WAV (Gemini); both carry enough header data to
// derive the duration without decoding.

// Old fixed timeout; still the floor so short clips behave as before.
export const NATIVE_TTS_WATCHDOG_MIN_TIMEOUT_MS = 15_000
export const NATIVE_TTS_WATCHDOG_MAX_TIMEOUT_MS = 10 * 60_000
const NATIVE_TTS_WATCHDOG_MARGIN_MS = 5_000
const NATIVE_TTS_WATCHDOG_MARGIN_RATIO = 1.25
// Used only when the header cannot be read: no TTS voice encodes below this,
// so bytes / rate is an upper bound on the clip length.
const FALLBACK_MIN_BYTES_PER_SECOND = 4_000

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return ''
  let result = ''
  for (let index = offset; index < offset + length; index += 1) {
    result += String.fromCharCode(bytes[index])
  }
  return result
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return 0
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

export function estimateWavDurationMs(bytes: Uint8Array): number | null {
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') return null

  let byteRate = 0
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4)
    const chunkSize = readUint32LE(bytes, offset + 4)
    const dataOffset = offset + 8

    if (chunkId === 'fmt ') {
      byteRate = readUint32LE(bytes, dataOffset + 8)
      if (!byteRate) {
        const channels = readUint16LE(bytes, dataOffset + 2)
        const sampleRate = readUint32LE(bytes, dataOffset + 4)
        const bitsPerSample = readUint16LE(bytes, dataOffset + 14)
        byteRate = Math.floor((sampleRate * channels * bitsPerSample) / 8)
      }
    } else if (chunkId === 'data') {
      if (!byteRate) return null
      const available = bytes.length - dataOffset
      // Streamed WAV writers leave the size at 0 or 0xFFFFFFFF.
      const dataSize = chunkSize > 0 && chunkSize <= available ? chunkSize : available
      return Math.max(0, Math.round((dataSize / byteRate) * 1000))
    }

    // Chunks are word aligned.
    offset = dataOffset + chunkSize + (chunkSize % 2)
  }
  return null
}

const MP3_SAMPLE_RATES: Record<number, readonly number[]> = {
  3: [44_100, 48_000, 32_000], // MPEG-1
  2: [22_050, 24_000, 16_000], // MPEG-2
  0: [11_025, 12_000, 8_000], // MPEG-2.5
}

const MP3_BITRATES_KBPS = {
  v1l1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  v1l2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2l1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  v2l23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
} as const

type Mp3FrameHeader = {
  versionBits: number
  layer: 1 | 2 | 3
  bitrateKbps: number
  sampleRate: number
  samplesPerFrame: number
  isMono: boolean
}

function parseMp3FrameHeader(bytes: Uint8Array, offset: number): Mp3FrameHeader | null {
  if (offset + 4 > bytes.length) return null
  if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null

  const versionBits = (bytes[offset + 1] >> 3) & 0x03
  const layerBits = (bytes[offset + 1] >> 1) & 0x03
  const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03
  const channelMode = (bytes[offset + 3] >> 6) & 0x03
  if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null
  }

  const layer = (4 - layerBits) as 1 | 2 | 3
  const isMpeg1 = versionBits === 3
  const table = isMpeg1
    ? (layer === 1 ? MP3_BITRATES_KBPS.v1l1 : layer === 2 ? MP3_BITRATES_KBPS.v1l2 : MP3_BITRATES_KBPS.v1l3)
    : (layer === 1 ? MP3_BITRATES_KBPS.v2l1 : MP3_BITRATES_KBPS.v2l23)
  const sampleRate = MP3_SAMPLE_RATES[versionBits][sampleRateIndex]
  const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : (isMpeg1 ? 1152 : 576)

  return {
    versionBits,
    layer,
    bitrateKbps: table[bitrateIndex],
    sampleRate,
    samplesPerFrame,
    isMono: channelMode === 3,
  }
}

function skipId3v2(bytes: Uint8Array): number {
  if (readAscii(bytes, 0, 3) !== 'ID3' || bytes.length < 10) return 0
  // Syncsafe size: 7 bits per byte.
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  const hasFooter = (bytes[5] & 0x10) !== 0
  return 10 + size + (hasFooter ? 10 : 0)
}

export function estimateMp3DurationMs(bytes: Uint8Array): number | null {
  const start = skipId3v2(bytes)
  // Scan a bounded window for the first frame sync.
  const scanEnd = Math.min(bytes.length - 4, start + 64 * 1024)
  for (let offset = start; offset <= scanEnd; offset += 1) {
    const header = parseMp3FrameHeader(bytes, offset)
    if (!header) continue

    // Xing/Info (VBR or LAME CBR) header sits after the side information.
    const sideInfoSize = header.versionBits === 3
      ? (header.isMono ? 17 : 32)
      : (header.isMono ? 9 : 17)
    const xingOffset = offset + 4 + sideInfoSize
    const xingTag = readAscii(bytes, xingOffset, 4)
    if (xingTag === 'Xing' || xingTag === 'Info') {
      const flags = readUint32BE(bytes, xingOffset + 4)
      if (flags & 0x1) {
        const frames = readUint32BE(bytes, xingOffset + 8)
        if (frames > 0) return Math.round((frames * header.samplesPerFrame * 1000) / header.sampleRate)
      }
    }
    // Fraunhofer VBRI header, always 32 bytes after the frame header.
    if (readAscii(bytes, offset + 36, 4) === 'VBRI') {
      const frames = readUint32BE(bytes, offset + 36 + 14)
      if (frames > 0) return Math.round((frames * header.samplesPerFrame * 1000) / header.sampleRate)
    }

    const audioBytes = bytes.length - offset
    return Math.round((audioBytes * 8) / header.bitrateKbps)
  }
  return null
}

export function estimateTtsAudioDurationMs(bytes: Uint8Array, contentType?: string | null): number | null {
  const type = (contentType || '').trim().toLowerCase()
  const looksLikeWav = readAscii(bytes, 0, 4) === 'RIFF'
  if (type.includes('wav') || type.includes('wave') || looksLikeWav) {
    const wav = estimateWavDurationMs(bytes)
    if (wav !== null) return wav
  }
  if (type.includes('mpeg') || type.includes('mp3') || !looksLikeWav) {
    return estimateMp3DurationMs(bytes)
  }
  return null
}

// How long to wait for the native end/stop/error event before freeing the
// queue: the clip length plus a generous margin, never below the old 15 s.
export function resolveNativeTtsWatchdogTimeoutMs(input: {
  durationMs: number | null
  byteLength: number
}): number {
  const expectedMs = input.durationMs !== null && Number.isFinite(input.durationMs) && input.durationMs > 0
    ? input.durationMs
    : (Math.max(0, input.byteLength) / FALLBACK_MIN_BYTES_PER_SECOND) * 1000
  const withMarginMs = Math.ceil(expectedMs * NATIVE_TTS_WATCHDOG_MARGIN_RATIO + NATIVE_TTS_WATCHDOG_MARGIN_MS)
  return Math.min(
    NATIVE_TTS_WATCHDOG_MAX_TIMEOUT_MS,
    Math.max(NATIVE_TTS_WATCHDOG_MIN_TIMEOUT_MS, withMarginMs),
  )
}
