import { describe, expect, it } from 'vitest'
import {
  buildTimelineMetadata,
  extractTimelineFromEventMetadata,
  parseLiveEventEnvelopeV2,
} from './live-event-contract'

describe('live-event-contract', () => {
  it('parses v2 envelope from top-level payload', () => {
    const parsed = parseLiveEventEnvelopeV2({
      eventId: 'evt_abc',
      seq: 7,
      sessionId: 'sess_123',
      schemaVersion: '2',
      clientCreatedAt: 1_710_000_000_000,
    })

    expect(parsed.eventId).toBe('evt_abc')
    expect(parsed.seq).toBe(7)
    expect(parsed.sessionId).toBe('sess_123')
    expect(parsed.schemaVersion).toBe('2')
    expect(parsed.clientCreatedAtIso).toBe('2024-03-09T16:00:00.000Z')
  })

  it('supports nested envelope payload shape', () => {
    const parsed = parseLiveEventEnvelopeV2({
      envelope: {
        eventId: 'evt_nested',
        seq: 8,
        sessionKey: 'sess_nested',
        clientCreatedAt: '2026-03-23T12:00:00.000Z',
      },
    })

    expect(parsed.eventId).toBe('evt_nested')
    expect(parsed.seq).toBe(8)
    expect(parsed.sessionId).toBe('sess_nested')
    expect(parsed.clientCreatedAtIso).toBe('2026-03-23T12:00:00.000Z')
  })

  it('builds timeline metadata only when eventId/seq are valid', () => {
    const timeline = buildTimelineMetadata({
      envelope: parseLiveEventEnvelopeV2({
        eventId: 'evt_valid',
        seq: 9,
        sessionId: 'sess_live',
      }),
      fallbackSessionId: 'sess_fallback',
      eventType: 'stt_turn_finalized',
      clientMessageId: 'msg_1',
    })

    expect(timeline).toEqual({
      eventId: 'evt_valid',
      seq: 9,
      schemaVersion: '2',
      sessionId: 'sess_live',
      eventType: 'stt_turn_finalized',
      clientMessageId: 'msg_1',
    })

    const invalid = buildTimelineMetadata({
      envelope: parseLiveEventEnvelopeV2({ eventId: 'evt_missing_seq' }),
      eventType: 'stt_turn_started',
    })
    expect(invalid).toBeNull()
  })

  it('extracts timeline records from persisted metadata', () => {
    const timeline = extractTimelineFromEventMetadata({
      timeline: {
        eventId: 'evt_saved',
        seq: 11,
        sessionId: 'sess_saved',
        schemaVersion: '2',
        clientCreatedAt: '2026-03-23T12:10:00.000Z',
        eventType: 'stt_turn_started',
        clientMessageId: 'msg_saved',
      },
    })

    expect(timeline).toEqual({
      eventId: 'evt_saved',
      seq: 11,
      sessionId: 'sess_saved',
      schemaVersion: '2',
      clientCreatedAtIso: '2026-03-23T12:10:00.000Z',
      eventType: 'stt_turn_started',
      clientMessageId: 'msg_saved',
    })
  })
})
