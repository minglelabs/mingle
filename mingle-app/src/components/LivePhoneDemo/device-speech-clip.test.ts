import { describe, expect, it } from 'vitest'
import {
  createDeviceSpeechClip,
  estimateDeviceSpeechDurationMs,
  isDeviceSpeechClip,
  parseNativeTtsSpeakCapability,
  readDeviceSpeechClip,
} from './device-speech-clip'

describe('device speech clip', () => {
  it('round-trips the sentence and language', async () => {
    const clip = createDeviceSpeechClip('안녕하세요', 'ko')
    expect(isDeviceSpeechClip(clip)).toBe(true)
    await expect(readDeviceSpeechClip(clip)).resolves.toEqual({ text: '안녕하세요', language: 'ko' })
  })

  it('does not mistake audio for a speech clip', async () => {
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' })
    expect(isDeviceSpeechClip(audio)).toBe(false)
    expect(isDeviceSpeechClip(null)).toBe(false)
  })

  it('reads an empty or broken clip as nothing to speak', async () => {
    await expect(readDeviceSpeechClip(createDeviceSpeechClip('  ', 'en'))).resolves.toBeNull()
    const broken = new Blob(['{'], { type: 'application/x-mingle-device-speech+json' })
    await expect(readDeviceSpeechClip(broken)).resolves.toBeNull()
  })

  it('needs ttsSpeak in the capabilities message', () => {
    expect(parseNativeTtsSpeakCapability({ type: 'capabilities', ttsSpeak: true })).toBe(true)
    expect(parseNativeTtsSpeakCapability({ type: 'capabilities', ttsStream: true })).toBe(false)
    expect(parseNativeTtsSpeakCapability(null)).toBe(false)
  })

  it('gives short sentences a minimum watchdog length', () => {
    expect(estimateDeviceSpeechDurationMs('hi')).toBe(1500)
    expect(estimateDeviceSpeechDurationMs('a'.repeat(100))).toBe(12000)
  })
})
