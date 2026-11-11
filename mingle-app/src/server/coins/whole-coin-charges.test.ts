import { describe, expect, it } from 'vitest'
import { roundUpToWholeCoin } from '@/server/coins/wallet'
import { coinUsageFeatureOf } from '@/server/coins/queries'
import { voiceTalkCostTip } from '@/components/LivePhoneDemo/VoiceTalkPanel'

describe('whole-Hash charges and usage detail', () => {
  it('rounds every charge up to a whole Hash', () => {
    expect(roundUpToWholeCoin(0n)).toBe(0n)
    expect(roundUpToWholeCoin(200_000n)).toBe(1_000_000n)
    expect(roundUpToWholeCoin(1_000_000n)).toBe(1_000_000n)
    expect(roundUpToWholeCoin(1_000_001n)).toBe(2_000_000n)
  })

  it('names what each charge paid for', () => {
    expect(coinUsageFeatureOf({ kind: 'stt', idempotencyKey: 'voice-caption-stt:line' })).toBe('voice_caption')
    expect(coinUsageFeatureOf({ kind: 'tts', idempotencyKey: 'voice-playback-tts:line:en:u' })).toBe('voice_listen')
    expect(coinUsageFeatureOf({ kind: 'stt', idempotencyKey: 'stt:u:abc' })).toBe('speech')
    expect(coinUsageFeatureOf({ kind: 'tts', idempotencyKey: 'tts:x' })).toBe('read_aloud')
    expect(coinUsageFeatureOf({ kind: 'translation', units: { message: 1 } })).toBe('typed')
    expect(coinUsageFeatureOf({ kind: 'translation', units: { input_token: 10 } })).toBe('translation')
    expect(coinUsageFeatureOf({ kind: 'image_text' })).toBe('photo')
  })

  it('says what interpretation and its read-aloud cost per minute', () => {
    const copy = { interpretTip: 'I {coins}', listenTip: 'L {coins}' }
    const rates = { sttCoinsPerMinute: 8, ttsCoinsPerAudioMinute: 13.6 }
    expect(voiceTalkCostTip({ kind: 'interpret', listenOn: true, rates, copy })).toBe('I 8 L 14')
    expect(voiceTalkCostTip({ kind: 'interpret', listenOn: false, rates, copy })).toBe('I 8')
    expect(voiceTalkCostTip({ kind: 'listen', listenOn: true, rates, copy })).toBe('L 14')
    expect(voiceTalkCostTip({ kind: 'interpret', listenOn: true, rates: null, copy })).toBeNull()
  })
})
