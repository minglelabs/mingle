import { describe, expect, it } from 'vitest'

import {
  REALTIME_FALLBACK_POLL_INTERVAL_MS,
  REALTIME_SOCKET_WATCHDOG_IDLE_MS,
  shouldRunRealtimeFallbackRefresh,
} from './realtime-fallback-poll'

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

  // Mirrors conversation-list.tsx: a successful fallback refresh resets
  // lastRealtimeActivityAt, so an idle healthy socket is polled roughly every
  // 60-80 s (next 20 s tick past the 60 s watchdog), while a socket that is not
  // OPEN keeps polling on every 20 s tick.
  it('polls an idle open socket about every 60-80 s once successful refreshes reset activity', () => {
    const simulate = (socketReadyState: number | null) => {
      let lastRealtimeActivityAt = 0
      const refreshTimes: number[] = []
      for (let now = REALTIME_FALLBACK_POLL_INTERVAL_MS; now <= 300_000; now += REALTIME_FALLBACK_POLL_INTERVAL_MS) {
        if (!shouldRunRealtimeFallbackRefresh({
          isDocumentVisible: true,
          socketReadyState,
          lastRealtimeActivityAt,
          now,
        })) continue
        refreshTimes.push(now)
        lastRealtimeActivityAt = now
      }
      return refreshTimes
    }

    const openSocketRefreshes = simulate(1)
    expect(openSocketRefreshes).toEqual([60_000, 120_000, 180_000, 240_000, 300_000])
    for (let index = 1; index < openSocketRefreshes.length; index += 1) {
      const gap = openSocketRefreshes[index] - openSocketRefreshes[index - 1]
      expect(gap).toBeGreaterThanOrEqual(REALTIME_SOCKET_WATCHDOG_IDLE_MS)
      expect(gap).toBeLessThanOrEqual(REALTIME_SOCKET_WATCHDOG_IDLE_MS + REALTIME_FALLBACK_POLL_INTERVAL_MS)
    }

    expect(simulate(null)).toHaveLength(300_000 / REALTIME_FALLBACK_POLL_INTERVAL_MS)
    expect(simulate(3)).toHaveLength(300_000 / REALTIME_FALLBACK_POLL_INTERVAL_MS)
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
