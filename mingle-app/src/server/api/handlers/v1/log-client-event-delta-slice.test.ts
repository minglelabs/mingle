import { describe, expect, it } from 'vitest'
import { sliceDeltaEventsForCursor, type DeltaEvent } from './log-client-event-delta-slice'

function makeEvent(seq: number, suffix: string): DeltaEvent {
  return {
    seq,
    eventId: `evt_${seq}_${suffix}`,
    sessionId: 'sess_test',
    schemaVersion: '2',
    eventType: 'stt_turn_finalized',
    clientMessageId: `msg_${seq}_${suffix}`,
    sourceLanguage: 'en',
    sourceText: `source_${seq}_${suffix}`,
    translations: {},
    sttDurationMs: 10,
    totalDurationMs: 20,
    provider: 'openai',
    model: 'gpt-4.1',
    clientCreatedAt: '2026-03-23T10:00:00.000Z',
    serverCreatedAt: '2026-03-23T10:00:00.000Z',
    logId: `log_${seq}_${suffix}`,
    messageId: `m_${seq}_${suffix}`,
  }
}

describe('sliceDeltaEventsForCursor', () => {
  it('returns all events and hasMore=false when under limit', () => {
    const events = [makeEvent(1, 'a'), makeEvent(2, 'a')]
    const result = sliceDeltaEventsForCursor({
      events,
      limit: 3,
      didHitFetchLimit: false,
    })
    expect(result.events).toEqual(events)
    expect(result.hasMore).toBe(false)
  })

  it('truncates at limit and hasMore=true when next seq differs', () => {
    const events = [makeEvent(1, 'a'), makeEvent(2, 'a'), makeEvent(3, 'a')]
    const result = sliceDeltaEventsForCursor({
      events,
      limit: 2,
      didHitFetchLimit: false,
    })
    expect(result.events).toEqual([makeEvent(1, 'a'), makeEvent(2, 'a')])
    expect(result.hasMore).toBe(true)
  })

  it('includes all duplicate boundary seq rows to avoid cursor skip', () => {
    const events = [
      makeEvent(1, 'a'),
      makeEvent(2, 'a'),
      makeEvent(2, 'b'),
      makeEvent(2, 'c'),
      makeEvent(3, 'a'),
    ]
    const result = sliceDeltaEventsForCursor({
      events,
      limit: 2,
      didHitFetchLimit: false,
    })
    expect(result.events).toEqual([
      makeEvent(1, 'a'),
      makeEvent(2, 'a'),
      makeEvent(2, 'b'),
      makeEvent(2, 'c'),
    ])
    expect(result.hasMore).toBe(true)
  })

  it('marks hasMore=true when scan limit was hit without clear boundary break', () => {
    const events = [makeEvent(10, 'a'), makeEvent(10, 'b')]
    const result = sliceDeltaEventsForCursor({
      events,
      limit: 10,
      didHitFetchLimit: true,
    })
    expect(result.events).toEqual(events)
    expect(result.hasMore).toBe(true)
  })
})
