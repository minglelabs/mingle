// On-device TTS (iOS system voice): no audio comes from the server. The TTS
// queue still carries a Blob per clip, so an on-device clip is a small JSON
// Blob with the sentence and its language, tagged with its own content type;
// the player hands it to the shell as `native_tts_speak` instead of audio.

export const DEVICE_SPEECH_CLIP_TYPE = 'application/x-mingle-device-speech+json'

// Per device, not an account preference: a server model choice stays as it was.
export const ON_DEVICE_TTS_STORAGE_KEY = 'mingle_on_device_tts'
export const ON_DEVICE_TTS_OPTION_LABEL = 'iOS on-device (free)'

export type DeviceSpeechClip = {
  text: string
  language: string
}

export function createDeviceSpeechClip(text: string, language: string): Blob {
  return new Blob([JSON.stringify({ text, language })], { type: DEVICE_SPEECH_CLIP_TYPE })
}

export function isDeviceSpeechClip(audio: unknown): audio is Blob {
  return typeof Blob !== 'undefined' && audio instanceof Blob && audio.type === DEVICE_SPEECH_CLIP_TYPE
}

export async function readDeviceSpeechClip(blob: Blob): Promise<DeviceSpeechClip | null> {
  try {
    const parsed = JSON.parse(await blob.text()) as Partial<DeviceSpeechClip>
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : ''
    const language = typeof parsed.language === 'string' ? parsed.language.trim() : ''
    return text ? { text, language } : null
  } catch {
    return null
  }
}

// Whether the shell speaks text on-device (`ttsSpeak: true` in its
// capabilities message).
export function parseNativeTtsSpeakCapability(capabilities: unknown): boolean {
  if (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities)) return false
  const record = capabilities as Record<string, unknown>
  return record.type === 'capabilities' && record.ttsSpeak === true
}

// Rough playback length for the watchdog: system voices read about
// 12-15 characters a second (CJK fewer), plus room for rendering.
export function estimateDeviceSpeechDurationMs(text: string): number {
  return Math.max(1500, text.length * 120)
}

export function readOnDeviceTtsPreference(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ON_DEVICE_TTS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeOnDeviceTtsPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(ON_DEVICE_TTS_STORAGE_KEY, '1')
    else window.localStorage.removeItem(ON_DEVICE_TTS_STORAGE_KEY)
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
}
