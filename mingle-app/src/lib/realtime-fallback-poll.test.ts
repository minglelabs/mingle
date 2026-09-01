import { describe, expect, it } from 'vitest'

import { shouldRunRealtimeFallbackRefresh } from './realtime-fallback-poll'

describe('shouldRunRealtimeFallbackRefresh', () => {
  it('uses the normal fallback when no healthy socket is available', () => {
    expect(shouldRunRealtimeFallbackRefresh({
      isDocumentVisible: true,
      socketReadyState: null,
      lastRealtimeActivityAt: 0,
      now: 1_000,
    })).toBe(true)
  })

  it('does not poll a recently active open socket', () => {
    expect(shouldRunRealtimeFallbackRefresh({
      isDocumentVisible: true,
      socketReadyState: 1,
      lastRealtimeActivityAt: 10_000,
      now: 69_999,
    })).toBe(false)
  })

  it('uses the watchdog fallback for an open socket that stays silent too long', () => {
    expect(shouldRunRealtimeFallbackRefresh({
      isDocumentVisible: true,
      socketReadyState: 1,
      lastRealtimeActivityAt: 10_000,
      now: 70_000,
    })).toBe(true)
  })

  it('does not refresh while the document is hidden', () => {
    expect(shouldRunRealtimeFallbackRefresh({
      isDocumentVisible: false,
      socketReadyState: null,
      lastRealtimeActivityAt: 0,
      now: 1_000,
    })).toBe(false)
  })
})
