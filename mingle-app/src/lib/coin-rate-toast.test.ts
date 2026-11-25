import { describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: vi.fn() }))

import { buildCoinRateToast, coinRatePerMinute } from './coin-rate-toast'

const rates = { sttCoinsPerMinute: 10, voiceWithTtsCoinsPerMinute: 16.4, ttsCoinsPerAudioMinute: 17.5 }

describe('coin rate toast', () => {
  it('prices speech and captions by the voice rate, read-aloud by the audio rate, in whole Hash', () => {
    expect(coinRatePerMinute('speech', rates)).toBe(10)
    expect(coinRatePerMinute('voice_caption', rates)).toBe(10)
    expect(coinRatePerMinute('read_aloud', rates)).toBe(18)
    expect(coinRatePerMinute('voice_listen', rates)).toBe(18)
    expect(coinRatePerMinute('speech', undefined)).toBe(0)
  })

  it('names the switch and its rate when it goes on, and that it stopped when it goes off', () => {
    expect(buildCoinRateToast({ feature: 'speech', on: true, rates, locale: 'ko' })).toBe('음성 인식 켜짐 · 1분에 약 10해씨')
    expect(buildCoinRateToast({ feature: 'speech', on: false, rates, locale: 'ko' })).toBe('음성 인식 꺼짐 · 해씨가 더 빠지지 않아요')
    expect(buildCoinRateToast({ feature: 'read_aloud', on: true, rates, locale: 'en' })).toBe('Translation read aloud on · about 18 Hash a minute')
  })

  it('says nothing about a rate it does not know', () => {
    expect(buildCoinRateToast({ feature: 'speech', on: true, rates: undefined, locale: 'ko' })).toBeNull()
  })
})
