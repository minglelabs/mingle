import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  AUTO_SCROLL_MIN_INTERVAL_MS,
  createAutoScrollScheduler,
  deriveAutoScrollClockDelayMs,
  deriveNewMessageAutoScrollState,
  deriveScrollAutoFollowState,
  deriveScrollUiVisibility,
  isLikelyIOSNavigator,
  resolveNewMessageAutoScrollTargetTop,
  resolvePrependScrollAnchorTop,
  resolveTopVisibleScrollDateLabelAnchor,
  shouldUpdateScrollDateLabelState,
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

    it('rechecks the latest condition before a scheduled clock tick runs', () => {
      let shouldAutoScroll = true
      let runCount = 0

      vi.setSystemTime(new Date('2026-03-23T00:00:00.500Z'))
      const scheduler = createAutoScrollScheduler()
      scheduler.update({
        shouldAutoScroll: () => shouldAutoScroll,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

      shouldAutoScroll = false
      vi.advanceTimersByTime(500)

      expect(runCount).toBe(0)
    })

    it('cancels a pending scheduled tick when auto-follow turns off', () => {
      let runCount = 0

      vi.setSystemTime(new Date('2026-03-23T00:00:00.500Z'))
      const scheduler = createAutoScrollScheduler()
      scheduler.update({
        shouldAutoScroll: () => true,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

      scheduler.cancel()
      vi.advanceTimersByTime(500)

      expect(runCount).toBe(0)
    })

    it('coalesces multiple updates into one run on the next clock tick', () => {
      let runCount = 0

      vi.setSystemTime(new Date('2026-03-23T00:00:00.400Z'))
      const scheduler = createAutoScrollScheduler()
      scheduler.update({
        shouldAutoScroll: () => true,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

      vi.advanceTimersByTime(200)
      scheduler.update({
        shouldAutoScroll: () => true,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

      vi.advanceTimersByTime(399)
      expect(runCount).toBe(0)

      vi.advanceTimersByTime(1)
      expect(runCount).toBe(1)
    })

    it('runs immediately when an update arrives exactly on a clock boundary', () => {
      let runCount = 0

      const scheduler = createAutoScrollScheduler()
      scheduler.update({
        shouldAutoScroll: () => true,
        runAutoScroll: () => {
          runCount += 1
          return true
        },
      })

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
    it('uses a 100px default near-bottom threshold', () => {
      expect(AUTO_SCROLL_BOTTOM_THRESHOLD_PX).toBe(100)
    })

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

  describe('deriveNewMessageAutoScrollState', () => {
    it('auto-scrolls a new committed message when the user was within 100px of bottom before append', () => {
      const state = deriveNewMessageAutoScrollState({
        previousCounts: { utteranceCount: 24, liveUtteranceCount: 0 },
        nextCounts: { utteranceCount: 25, liveUtteranceCount: 0 },
        previousDistanceToBottom: 100,
        isPaginating: false,
        isLoadingOlder: false,
      })

      expect(state.hasNewMessage).toBe(true)
      expect(state.shouldAutoScroll).toBe(true)
    })

    it('auto-scrolls a new live message when the user was within 100px of bottom before append', () => {
      const state = deriveNewMessageAutoScrollState({
        previousCounts: { utteranceCount: 24, liveUtteranceCount: 0 },
        nextCounts: { utteranceCount: 24, liveUtteranceCount: 1 },
        previousDistanceToBottom: 99.5,
        isPaginating: false,
        isLoadingOlder: false,
      })

      expect(state.hasNewMessage).toBe(true)
      expect(state.shouldAutoScroll).toBe(true)
    })

    it('does not auto-scroll a new message when the user was more than 100px from bottom', () => {
      const state = deriveNewMessageAutoScrollState({
        previousCounts: { utteranceCount: 24, liveUtteranceCount: 0 },
        nextCounts: { utteranceCount: 25, liveUtteranceCount: 0 },
        previousDistanceToBottom: 100.5,
        isPaginating: false,
        isLoadingOlder: false,
      })

      expect(state.hasNewMessage).toBe(true)
      expect(state.shouldAutoScroll).toBe(false)
    })

    it('keeps scrollTop unchanged for a new message when the user was more than 100px from bottom', () => {
      const previousScrollTop = 560
      const state = deriveNewMessageAutoScrollState({
        previousCounts: { utteranceCount: 24, liveUtteranceCount: 0 },
        nextCounts: { utteranceCount: 25, liveUtteranceCount: 0 },
        previousDistanceToBottom: 101,
        isPaginating: false,
        isLoadingOlder: false,
      })
      const autoScrollTargetTop = resolveNewMessageAutoScrollTargetTop({
        shouldAutoScroll: state.shouldAutoScroll,
        currentScrollTop: previousScrollTop,
        currentScrollHeight: 1_240,
        currentClientHeight: 420,
      })
      const nextScrollTop = autoScrollTargetTop ?? previousScrollTop

      expect(state.hasNewMessage).toBe(true)
      expect(state.shouldAutoScroll).toBe(false)
      expect(autoScrollTargetTop).toBeNull()
      expect(nextScrollTop).toBe(previousScrollTop)
    })

    it('does not treat older-message pagination as a new-message auto-scroll trigger', () => {
      const state = deriveNewMessageAutoScrollState({
        previousCounts: { utteranceCount: 24, liveUtteranceCount: 0 },
        nextCounts: { utteranceCount: 25, liveUtteranceCount: 0 },
        previousDistanceToBottom: 0,
        isPaginating: true,
        isLoadingOlder: true,
      })

      expect(state.hasNewMessage).toBe(true)
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

  describe('deriveAutoScrollClockDelayMs', () => {
    it('returns zero on an exact clock boundary', () => {
      expect(deriveAutoScrollClockDelayMs({
        nowMs: 10_000,
      })).toBe(0)
    })

    it('returns the remaining time until the next clock tick', () => {
      expect(deriveAutoScrollClockDelayMs({
        nowMs: 10_250,
      })).toBe(AUTO_SCROLL_MIN_INTERVAL_MS - 250)
    })

    it('wraps to the next global boundary instead of using last-run time', () => {
      expect(deriveAutoScrollClockDelayMs({
        nowMs: 11_250,
      })).toBe(AUTO_SCROLL_MIN_INTERVAL_MS - 250)
    })
  })

  describe('resolvePrependScrollAnchorTop', () => {
    it('keeps the visible message at the same viewport offset after older utterances prepend', () => {
      const previousScrollHeight = 1_200
      const previousScrollTop = 420.5
      const visibleMessageDocumentTop = 455.25
      const visibleMessageViewportTop = visibleMessageDocumentTop - previousScrollTop
      const prependedHeight = 284.75

      const nextScrollTop = resolvePrependScrollAnchorTop({
        previousScrollHeight,
        nextScrollHeight: previousScrollHeight + prependedHeight,
        previousScrollTop,
        maxScrollTop: 1_600,
      })

      const nextVisibleMessageViewportTop = (visibleMessageDocumentTop + prependedHeight) - nextScrollTop
      expect(Math.abs(nextVisibleMessageViewportTop - visibleMessageViewportTop)).toBeLessThanOrEqual(1)
    })

    it('uses the latest pending scrollTop snapshot when the user scrolls before prepend applies', () => {
      const previousScrollHeight = 1_800
      const latestPendingScrollTop = 260
      const currentVisibleMessageDocumentTop = 318
      const currentVisibleMessageViewportTop = currentVisibleMessageDocumentTop - latestPendingScrollTop
      const prependedHeight = 96

      const nextScrollTop = resolvePrependScrollAnchorTop({
        previousScrollHeight,
        nextScrollHeight: previousScrollHeight + prependedHeight,
        previousScrollTop: latestPendingScrollTop,
        maxScrollTop: 1_500,
      })

      const nextVisibleMessageViewportTop = (currentVisibleMessageDocumentTop + prependedHeight) - nextScrollTop
      expect(Math.abs(nextVisibleMessageViewportTop - currentVisibleMessageViewportTop)).toBeLessThanOrEqual(1)
    })

    it('clamps the corrected scrollTop to the scrollable range', () => {
      expect(resolvePrependScrollAnchorTop({
        previousScrollHeight: 400,
        nextScrollHeight: 900,
        previousScrollTop: 700,
        maxScrollTop: 600,
      })).toBe(600)
    })
  })

  describe('resolveTopVisibleScrollDateLabelAnchor', () => {
    const anchors = [
      { createdAtMs: 1_700_000_000_000, offsetTop: 10, offsetHeight: 40 },
      { createdAtMs: 1_700_000_001_000, offsetTop: 62, offsetHeight: 40 },
      { createdAtMs: 1_700_000_002_000, offsetTop: 114, offsetHeight: 40 },
    ]

    it('keeps the date label anchored to the topmost message crossing the container top edge', () => {
      expect(resolveTopVisibleScrollDateLabelAnchor({
        anchors: [
          { createdAtMs: 1_700_000_010_000, offsetTop: 16, offsetHeight: 160 },
          { createdAtMs: 1_700_000_011_000, offsetTop: 188, offsetHeight: 44 },
          { createdAtMs: 1_700_000_012_000, offsetTop: 244, offsetHeight: 44 },
        ],
        scrollTop: 132,
      })?.createdAtMs).toBe(1_700_000_010_000)
    })

    it('uses cached offsets to pick the first message whose bottom is still visible', () => {
      expect(resolveTopVisibleScrollDateLabelAnchor({
        anchors,
        scrollTop: 48,
      })?.createdAtMs).toBe(1_700_000_000_000)
    })

    it('moves to the next message at the same one-pixel top tolerance as the DOM rect path', () => {
      expect(resolveTopVisibleScrollDateLabelAnchor({
        anchors,
        scrollTop: 49,
      })?.createdAtMs).toBe(1_700_000_001_000)
    })

    it('returns null when no cached message crosses the visible top edge', () => {
      expect(resolveTopVisibleScrollDateLabelAnchor({
        anchors,
        scrollTop: 200,
      })).toBeNull()
    })
  })

  describe('shouldUpdateScrollDateLabelState', () => {
    it('skips state updates when the computed date label is unchanged', () => {
      expect(shouldUpdateScrollDateLabelState('today', 'today')).toBe(false)
    })

    it('allows state updates when the computed date label changes', () => {
      expect(shouldUpdateScrollDateLabelState('today', 'yesterday')).toBe(true)
    })
  })
})
