import { describe, expect, it } from 'vitest'
import { appendBubbleHoldToWsUrl, parseSttTranscriptMessage } from './use-realtime-stt'

describe('bubble hold wiring', () => {
  it('asks for bubble hold on the socket URL unless the room uses silence mode', () => {
    expect(appendBubbleHoldToWsUrl('wss://stt.example/?coin_token=t', 2000, 'end'))
      .toBe('wss://stt.example/?coin_token=t&bubble_hold_ms=2000')
    expect(appendBubbleHoldToWsUrl('wss://stt.example/', 2000, null)).toBe('wss://stt.example/?bubble_hold_ms=2000')
    expect(appendBubbleHoldToWsUrl('wss://stt.example/', 2000, 'fin')).toBe('wss://stt.example/')
    expect(appendBubbleHoldToWsUrl('wss://stt.example/', 0, 'end')).toBe('wss://stt.example/')
  })

  it('reads committed segments from a transcript', () => {
    const parsed = parseSttTranscriptMessage({
      type: 'transcript',
      data: {
        is_final: false,
        committed_segments: ['Hello there.', ' ', 42],
        utterance: { text: 'Hello there. How', language: 'en', speaker: '1' },
      },
    }, ['en', 'ko'])
    expect(parsed?.committedSegments).toEqual(['Hello there.'])
    const legacy = parseSttTranscriptMessage({
      type: 'transcript',
      data: { is_final: true, utterance: { text: 'Hi', language: 'en', speaker: '1' } },
    }, ['en', 'ko'])
    expect(legacy?.committedSegments).toBeUndefined()
  })
})
