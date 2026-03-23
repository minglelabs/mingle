import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  AUTO_SCROLL_MIN_INTERVAL_MS,
  createAutoScrollScheduler,
  deriveAutoScrollThrottleDelayMs,
  deriveScrollAutoFollowState,
  deriveScrollUiVisibility,
  isLikelyIOSNavigator,
} from './live-phone-demo.scroll.logic'

describe('live-phone-demo scroll/platform logic', () => {
  describe('createAutoScrollScheduler', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-23T00:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('rechecks the latest condition before a throttled scroll runs', () => {
      let shouldAutoScroll = true
      let runCount = 0

      const scheduler = createAutoScrollScheduler()
      scheduler.markPerformed()
      scheduler.update({
        shouldAutoScroll: () => shouldAutoScroll,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

      shouldAutoScroll = false
      vi.advanceTimersByTime(AUTO_SCROLL_MIN_INTERVAL_MS)

      expect(runCount).toBe(0)
    })

    it('cancels a pending throttled scroll when auto-follow turns off', () => {
      let shouldAutoScroll = true
      let runCount = 0

      const scheduler = createAutoScrollScheduler()
      scheduler.markPerformed()
      scheduler.update({
        shouldAutoScroll: () => shouldAutoScroll,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

      shouldAutoScroll = false
      scheduler.cancel()
      vi.advanceTimersByTime(AUTO_SCROLL_MIN_INTERVAL_MS)

      expect(runCount).toBe(0)
    })

    it('reschedules using the remaining throttle window instead of stacking timers', () => {
      let runCount = 0

      const scheduler = createAutoScrollScheduler()
      scheduler.markPerformed()
      scheduler.update({
        shouldAutoScroll: () => true,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

      vi.advanceTimersByTime(400)
      scheduler.update({
        shouldAutoScroll: () => true,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

      vi.advanceTimersByTime(599)
      expect(runCount).toBe(0)

      vi.advanceTimersByTime(1)
      expect(runCount).toBe(1)
    })
  })

  describe('isLikelyIOSNavigator', () => {
    it('returns true for iPhone user agent', () => {
      expect(isLikelyIOSNavigator({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5,
      })).toBe(true)
    })

    it('returns true for iPadOS Safari desktop-class UA on touch MacIntel', () => {
      expect(isLikelyIOSNavigator({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      })).toBe(true)
    })

    it('returns false for real macOS desktop without touch points', () => {
      expect(isLikelyIOSNavigator({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      })).toBe(false)
    })

    it('returns false for Android devices', () => {
      expect(isLikelyIOSNavigator({
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
        platform: 'Linux armv8l',
        maxTouchPoints: 5,
      })).toBe(false)
    })
  })

  describe('deriveScrollAutoFollowState', () => {
    it('suppresses auto-follow when user manually scrolls away from bottom', () => {
      const state = deriveScrollAutoFollowState({
        distanceToBottom: AUTO_SCROLL_BOTTOM_THRESHOLD_PX + 1,
        fromUserScroll: true,
        suppressAutoScroll: false,
        isPaginating: false,
        isLoadingOlder: false,
      })

      expect(state.isNearBottom).toBe(false)
      expect(state.suppressAutoScroll).toBe(true)
      expect(state.shouldAutoScroll).toBe(false)
    })

    it('re-enables auto-follow when user returns near bottom', () => {
      const state = deriveScrollAutoFollowState({
        distanceToBottom: AUTO_SCROLL_BOTTOM_THRESHOLD_PX - 1,
        fromUserScroll: true,
        suppressAutoScroll: true,
        isPaginating: false,
        isLoadingOlder: false,
      })

      expect(state.isNearBottom).toBe(true)
      expect(state.suppressAutoScroll).toBe(false)
      expect(state.shouldAutoScroll).toBe(true)
    })

    it('treats threshold boundary as near bottom', () => {
      const state = deriveScrollAutoFollowState({
        distanceToBottom: AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
        fromUserScroll: false,
        suppressAutoScroll: false,
        isPaginating: false,
        isLoadingOlder: false,
      })

      expect(state.isNearBottom).toBe(true)
      expect(state.shouldAutoScroll).toBe(true)
    })

    it('keeps auto-follow off while paginating older utterances', () => {
      const state = deriveScrollAutoFollowState({
        distanceToBottom: 10,
        fromUserScroll: false,
        suppressAutoScroll: false,
        isPaginating: true,
        isLoadingOlder: false,
      })

      expect(state.shouldAutoScroll).toBe(false)
    })

    it('keeps auto-follow off while loading older utterances', () => {
      const state = deriveScrollAutoFollowState({
        distanceToBottom: 10,
        fromUserScroll: false,
        suppressAutoScroll: false,
        isPaginating: false,
        isLoadingOlder: true,
      })

      expect(state.shouldAutoScroll).toBe(false)
    })

    it('keeps suppression after top-safe-area tap equivalent state', () => {
      const state = deriveScrollAutoFollowState({
        distanceToBottom: AUTO_SCROLL_BOTTOM_THRESHOLD_PX + 600,
        fromUserScroll: true,
        suppressAutoScroll: true,
        isPaginating: false,
        isLoadingOlder: false,
      })

      expect(state.suppressAutoScroll).toBe(true)
      expect(state.shouldAutoScroll).toBe(false)
    })
  })

  describe('deriveScrollUiVisibility', () => {
    it('hides overlay during pure auto-follow momentum scroll', () => {
      const ui = deriveScrollUiVisibility({
        fromUserScroll: false,
        shouldAutoScroll: true,
      })

      expect(ui.visible).toBe(false)
      expect(ui.scheduleHideTimer).toBe(false)
    })

    it('keeps overlay visible during momentum scroll when auto-follow is suppressed', () => {
      const ui = deriveScrollUiVisibility({
        fromUserScroll: false,
        shouldAutoScroll: false,
      })

      expect(ui.visible).toBe(true)
      expect(ui.scheduleHideTimer).toBe(true)
    })

    it('keeps overlay visible for explicit user scroll events', () => {
      const ui = deriveScrollUiVisibility({
        fromUserScroll: true,
        shouldAutoScroll: true,
      })

      expect(ui.visible).toBe(true)
      expect(ui.scheduleHideTimer).toBe(true)
    })
  })

  describe('deriveAutoScrollThrottleDelayMs', () => {
    it('returns zero when auto-scroll has not run yet', () => {
      expect(deriveAutoScrollThrottleDelayMs({
        nowMs: 10_000,
        lastAutoScrollAtMs: 0,
      })).toBe(0)
    })

    it('returns the remaining throttle window', () => {
      expect(deriveAutoScrollThrottleDelayMs({
        nowMs: 10_250,
        lastAutoScrollAtMs: 10_000,
      })).toBe(AUTO_SCROLL_MIN_INTERVAL_MS - 250)
    })

    it('returns zero after the minimum interval elapses', () => {
      expect(deriveAutoScrollThrottleDelayMs({
        nowMs: 11_250,
        lastAutoScrollAtMs: 10_000,
      })).toBe(0)
    })
  })
})
