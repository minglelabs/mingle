import { describe, expect, it } from 'vitest'
import { shownCoinsDelta } from '@/lib/coin-units'
import { coinUsageFeatureOf } from '@/server/coins/queries'
import { voiceTalkCostTip } from '@/components/LivePhoneDemo/VoiceTalkPanel'

describe('Hash shown in whole units and usage detail', () => {
  it('counts a spend as the whole Hash it took off the shown balance: 1 up front, then 0 until it is used up', () => {
    const M = 1_000_000n
    // 1000.0 -> 999.9 (shown 1000 -> 999): one Hash taken up front.
    expect(shownCoinsDelta(-M / 10n, 999n * M + 9n * M / 10n)).toBe(1)
    // 999.9 -> 999.8: still 999 shown, nothing taken.
    expect(shownCoinsDelta(-M / 10n, 999n * M + 8n * M / 10n)).toBe(0)
    // 999.05 -> 998.95: crosses 999, the next Hash.
    expect(shownCoinsDelta(-M / 10n, 998n * M + 95n * M / 100n)).toBe(1)
    // A grant of 1000 onto 0.5 shows +1000.
    expect(shownCoinsDelta(1000n * M, 1000n * M + M / 2n)).toBe(1000)
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
