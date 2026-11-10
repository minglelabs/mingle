// Experiment switch: how a translation read aloud is asked for and played.
// - 'sentence': one request per sentence, each played once it has arrived whole.
// - 'stream': one request for the whole text, played as it arrives.
// - 'sentence_stream': one request per sentence, each played as it arrives.
// Kept per device (localStorage), not per account: it exists to compare the
// three on one phone. 'stream' only streams on a shell that can play a
// stream; elsewhere it is the whole text in one whole clip.

export type TtsDeliveryMode = 'sentence' | 'stream' | 'sentence_stream'

export const TTS_DELIVERY_MODES: readonly TtsDeliveryMode[] = ['sentence', 'stream', 'sentence_stream']
export const DEFAULT_TTS_DELIVERY_MODE: TtsDeliveryMode = 'sentence_stream'
export const TTS_DELIVERY_MODE_STORAGE_KEY = 'mingle_tts_delivery_mode'

type ModeStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): ModeStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function normalizeTtsDeliveryMode(value: unknown): TtsDeliveryMode {
  return TTS_DELIVERY_MODES.includes(value as TtsDeliveryMode) ? value as TtsDeliveryMode : DEFAULT_TTS_DELIVERY_MODE
}

export function readTtsDeliveryMode(storage: ModeStorage | null = defaultStorage()): TtsDeliveryMode {
  try {
    return normalizeTtsDeliveryMode(storage?.getItem(TTS_DELIVERY_MODE_STORAGE_KEY))
  } catch {
    return DEFAULT_TTS_DELIVERY_MODE
  }
}

export function writeTtsDeliveryMode(mode: TtsDeliveryMode, storage: ModeStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(TTS_DELIVERY_MODE_STORAGE_KEY, mode)
  } catch {
    // Storage unavailable: the mode lasts for this page only.
  }
}

/** A text is read one sentence at a time. */
export function ttsDeliverySplitsSentences(mode: TtsDeliveryMode): boolean {
  return mode !== 'stream'
}

/** A clip is asked for as a stream and played as it arrives. */
export function ttsDeliveryStreams(mode: TtsDeliveryMode): boolean {
  return mode !== 'sentence'
}
