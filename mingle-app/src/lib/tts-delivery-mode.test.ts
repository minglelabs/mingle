import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TTS_DELIVERY_MODE,
  TTS_DELIVERY_MODE_STORAGE_KEY,
  normalizeTtsDeliveryMode,
  readTtsDeliveryMode,
  ttsDeliverySplitsSentences,
  ttsDeliveryStreams,
  writeTtsDeliveryMode,
} from './tts-delivery-mode'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

describe('tts delivery mode', () => {
  it('defaults to sentences that stream, also for unknown stored values', () => {
    expect(DEFAULT_TTS_DELIVERY_MODE).toBe('sentence_stream')
    expect(readTtsDeliveryMode(memoryStorage())).toBe('sentence_stream')
    expect(readTtsDeliveryMode(memoryStorage({ [TTS_DELIVERY_MODE_STORAGE_KEY]: 'whole' }))).toBe('sentence_stream')
    expect(readTtsDeliveryMode(null)).toBe('sentence_stream')
    expect(normalizeTtsDeliveryMode(3)).toBe('sentence_stream')
  })

  it('keeps the picked mode', () => {
    const storage = memoryStorage()
    writeTtsDeliveryMode('stream', storage)
    expect(readTtsDeliveryMode(storage)).toBe('stream')
    writeTtsDeliveryMode('sentence', storage)
    expect(readTtsDeliveryMode(storage)).toBe('sentence')
  })

  it('says what each mode does', () => {
    expect([ttsDeliverySplitsSentences('sentence'), ttsDeliveryStreams('sentence')]).toEqual([true, false])
    expect([ttsDeliverySplitsSentences('stream'), ttsDeliveryStreams('stream')]).toEqual([false, true])
    expect([ttsDeliverySplitsSentences('sentence_stream'), ttsDeliveryStreams('sentence_stream')]).toEqual([true, true])
  })

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(readTtsDeliveryMode(broken)).toBe('sentence_stream')
    expect(() => writeTtsDeliveryMode('stream', broken)).not.toThrow()
  })
})
