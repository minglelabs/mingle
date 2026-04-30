import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  AUTO_SCROLL_MIN_INTERVAL_MS,
  CHAT_SCROLLBAR_MIN_THUMB_HEIGHT_PX,
  LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER,
  LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_SAMPLE_TARGET,
  LIVE_DEMO_SCROLL_HANDLER_MEDIAN_BUDGET_MS,
  LIVE_DEMO_SCROLL_MEASUREMENT_SEARCH_PARAM,
  createAutoScrollScheduler,
  deriveAutoScrollClockDelayMs,
  deriveLateMessageHeightChangeEffectAboveViewportAnchor,
  deriveLivePhoneDemoScrollMetrics,
  deriveNewMessageAutoScrollState,
  deriveScrollAutoFollowState,
  deriveScrollUiVisibility,
  isLikelyIOSNavigator,
  readLivePhoneDemoScrollHandlerMeasurement,
  recordLivePhoneDemoScrollHandlerMeasurement,
  resolveLateMessageHeightChangeAnchorScrollTop,
  resolveLivePhoneDemoScrollMeasurementCounter,
  resolveNewMessageAutoScrollTargetTop,
  resolvePrependScrollAnchorTop,
  resolveScrollViewportAnchorSnapshot,
  resolveTopVisibleScrollDateLabelAnchor,
  shouldCapturePrependScrollTopSnapshot,
  shouldReadPrependScrollHeightForSnapshot,
  shouldUpdateScrollDateLabelState,
  type LivePhoneDemoScrollHandlerMeasurementState,
  type ScrollDateLabelAnchor,
} from './live-phone-demo.scroll.logic'

const livePhoneDemoSource = readFileSync(new URL('./LivePhoneDemo.tsx', import.meta.url), 'utf8')
const useRealtimeSttSource = readFileSync(new URL('./use-realtime-stt.ts', import.meta.url), 'utf8')

function readTextBetween(source: string, startMarker: string, endMarker: string): string {
  const startIndex = source.indexOf(startMarker)
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length)

  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)

  return source.slice(startIndex, endIndex)
}

function readSourceBetween(startMarker: string, endMarker: string): string {
  return readTextBetween(livePhoneDemoSource, startMarker, endMarker)
}

function readUseRealtimeSttSourceBetween(startMarker: string, endMarker: string): string {
  return readTextBetween(useRealtimeSttSource, startMarker, endMarker)
}

function createStackedScrollAnchors(
  messages: Array<{ id: string; heightPx: number }>,
  options: { gapPx?: number; startCreatedAtMs?: number } = {},
): ScrollDateLabelAnchor[] {
  const gapPx = options.gapPx ?? 12
  const startCreatedAtMs = options.startCreatedAtMs ?? 1_700_000_000_000
  let offsetTop = 0

  return messages.map((message, index) => {
    const anchor: ScrollDateLabelAnchor = {
      utteranceId: message.id,
      createdAtMs: startCreatedAtMs + index * 1_000,
      offsetTop,
      offsetHeight: message.heightPx,
    }
    offsetTop += message.heightPx + gapPx
    return anchor
  })
}

function getStackedScrollHeight(anchors: readonly ScrollDateLabelAnchor[]): number {
  const lastAnchor = anchors[anchors.length - 1]
  return lastAnchor ? lastAnchor.offsetTop + lastAnchor.offsetHeight : 0
}

function getViewportTopOffsetForAnchor(
  anchors: readonly ScrollDateLabelAnchor[],
  utteranceId: string,
  scrollTop: number,
): number {
  const anchor = anchors.find((candidate) => candidate.utteranceId === utteranceId)
  expect(anchor).toBeDefined()
  return (anchor?.offsetTop ?? 0) - scrollTop
}

function createScrollHandlerMeasurementState(): LivePhoneDemoScrollHandlerMeasurementState {
  return {
    counter: LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER,
    samplesMs: [],
    latestMs: 0,
    maxMs: 0,
  }
}

describe('live-phone-demo scroll/platform logic', () => {
  describe('scroll performance QA scenario', () => {
    it('exposes a deterministic 500-utterance scenario without changing the default QA seed', () => {
      const scenarioSource = readSourceBetween(
        'function buildQaScrollPerformanceUtterances()',
        'declare global',
      )
      const defaultSeedSource = readSourceBetween(
        'seedPersistedHistory: (count = 48) => {',
        '      },\n      seedScrollPerformanceHistory',
      )

      expect(livePhoneDemoSource).toContain('const SCROLL_PERFORMANCE_CHAT_UTTERANCE_COUNT = 500')
      expect(livePhoneDemoSource).toContain('seedScrollPerformanceHistory: () => number')
      expect(livePhoneDemoSource).toContain('seedScrollPerformanceHistory: () => {')
      expect(livePhoneDemoSource).toContain('replaceConversationHistoryForQa(seededUtterances, { loadAll: true })')
      expect(scenarioSource).toContain('SCROLL_PERFORMANCE_CHAT_STARTED_AT_MS')
      expect(scenarioSource).not.toContain('Date.now(')
      expect(scenarioSource).not.toContain('new Date(')
      expect(defaultSeedSource).toContain('buildQaSeededUtterances(count)')
      expect(defaultSeedSource).not.toContain('buildQaScrollPerformanceUtterances')
      expect(defaultSeedSource).not.toContain('loadAll')
    })

    it('lets the QA performance scenario render the full seeded history instead of only the recent batch', () => {
      const replaceQaSource = readUseRealtimeSttSourceBetween(
        'const replaceConversationHistoryForQa = useCallback((items: Utterance[], options?: { loadAll?: boolean }) => {',
        '  const prepareForDeletion = useCallback',
      )

      expect(replaceQaSource).toContain('const cached = options?.loadAll ? normalized : buildLocalUtteranceCache(normalized)')
      expect(replaceQaSource).toContain('const initial = options?.loadAll ? cached : cached.slice(-LOAD_BATCH_SIZE)')
      expect(replaceQaSource).toContain('setHasOlderUtterances(!options?.loadAll &&')
    })
  })

  describe('scroll event DOM scan contract', () => {
    const fullDomScanPatterns = [
      'querySelector',
      'querySelectorAll',
      'getElementsBy',
      'childNodes',
      '.children',
      'readScrollDateLabelAnchors',
    ]

    it('keeps the native scroll event handler free of full-DOM scans', () => {
      const handleScrollSource = readSourceBetween(
        'const handleScroll = useCallback(() => {',
        'const handleScrollToBottom = useCallback',
      )

      for (const pattern of fullDomScanPatterns) {
        expect(handleScrollSource).not.toContain(pattern)
      }
    })

    it('keeps rAF-throttled scroll-derived state on cached date-label anchors', () => {
      const updateScrollDerivedStateSource = readSourceBetween(
        'const updateScrollDerivedState = useCallback((options?: { fromUserScroll?: boolean }) => {',
        'const processScrollEventDerivedState = useCallback',
      )

      expect(updateScrollDerivedStateSource).toContain('scrollDateLabelAnchorsRef.current')
      for (const pattern of fullDomScanPatterns) {
        expect(updateScrollDerivedStateSource).not.toContain(pattern)
      }
    })

    it('keeps viewport anchor tracking on message ids and cached offsets', () => {
      expect(livePhoneDemoSource).toContain('viewportAnchorSnapshotRef')
      expect(livePhoneDemoSource).toContain('data-utterance-id={utterance.id}')
      expect(livePhoneDemoSource).toContain('resolveScrollViewportAnchorSnapshot')
    })

    it('keeps long-chat message rendering behind memoized stable row props', () => {
      const chatMessageRowSource = readSourceBetween(
        'type LivePhoneDemoChatMessageRowProps = {',
        'function postNativeQaCommand',
      )
      const chatMessageMapSource = readSourceBetween(
        '{displayUtterances.map((u) => (',
        '            {/* Demo typing animation */}',
      )

      expect(chatMessageRowSource).toContain('const MemoizedLivePhoneDemoChatMessageRow = memo(')
      expect(chatMessageRowSource).toContain('if (prev.utterance !== next.utterance) return false')
      expect(chatMessageRowSource).toContain('if (prev.onPlayOriginal !== next.onPlayOriginal) return false')
      expect(chatMessageRowSource).toContain('if (prev.onPlayTranslation !== next.onPlayTranslation) return false')
      expect(chatMessageRowSource).toContain('if (prev.bubbleTextClassName !== next.bubbleTextClassName) return false')
      expect(chatMessageRowSource).toContain('isPlaybackKeyForUtterance(prev.speakingPlaybackKey, prev.utterance.id)')

      expect(chatMessageMapSource).toContain('<MemoizedLivePhoneDemoChatMessageRow')
      expect(chatMessageMapSource).toContain('utterance={u}')
      expect(chatMessageMapSource).toContain('onPlayOriginal={handlePlayOriginalBubbleTts}')
      expect(chatMessageMapSource).toContain('onPlayTranslation={handlePlayTranslationBubbleTts}')
      expect(chatMessageMapSource).toContain('speakingPlaybackKey={activeBubblePlaybackKey}')
      expect(chatMessageMapSource).not.toContain('<ChatBubble')
      expect(chatMessageMapSource).not.toContain('style={{')
      expect(chatMessageMapSource).not.toContain('onPlayOriginal={()')
      expect(chatMessageMapSource).not.toContain('onPlayTranslation={()')
    })

    it('keeps the native scroll handler synchronous work limited to anchor snapshots and rAF scheduling', () => {
      const handleScrollSource = readSourceBetween(
        'const handleScroll = useCallback(() => {',
        'const handleScrollToBottom = useCallback',
      )

      expect(handleScrollSource).toContain('const measurementStartMs = scrollHandlerMeasurementRef.current')
      expect(handleScrollSource).toContain('captureCurrentViewportAnchorSnapshot(scrollTop)')
      expect(handleScrollSource).toContain('shouldCapturePrependScrollTopSnapshot')
      expect(handleScrollSource).toContain('prevScrollTopRef.current = scrollTop')
      expect(handleScrollSource).toContain('scheduleScrollEventDerivedState({ fromUserScroll: isUserScrollIntentActive() })')
      expect(handleScrollSource).toContain('recordScrollHandlerMeasurement(readBrowserPerformanceNowMs() - measurementStartMs)')
      expect(handleScrollSource).not.toContain('updateScrollDerivedState({')
      expect(handleScrollSource).not.toContain('setScrollMetrics(')
      expect(handleScrollSource).not.toContain('setScrollDateLabel(')
      expect(handleScrollSource).not.toContain('setScrollUiVisible(')
    })

    it('keeps scrollHeight reads behind the pending-prepend guard in the native scroll handler', () => {
      const handleScrollSource = readSourceBetween(
        'const handleScroll = useCallback(() => {',
        'const handleScrollToBottom = useCallback',
      )

      const guardIndex = handleScrollSource.indexOf('shouldReadPrependScrollHeightForSnapshot({')
      const scrollHeightIndex = handleScrollSource.indexOf('currentScrollHeight: node.scrollHeight')

      expect(handleScrollSource).toContain('const scrollTop = node.scrollTop')
      expect(guardIndex).toBeGreaterThanOrEqual(0)
      expect(scrollHeightIndex).toBeGreaterThan(guardIndex)
    })

    it('gates the chat scroll handler measurement to one dev-only counter', () => {
      const measurementSource = readSourceBetween(
        'const configureScrollHandlerMeasurement = useCallback(() => {',
        'const captureCurrentViewportAnchorSnapshot = useCallback',
      )

      expect(measurementSource).toContain("process.env.NODE_ENV === 'production'")
      expect(measurementSource).toContain('resolveLivePhoneDemoScrollMeasurementCounter')
      expect(measurementSource).toContain('LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER')
      expect(measurementSource).toContain('recordLivePhoneDemoScrollHandlerMeasurement')
      expect(measurementSource).toContain('console.info')
    })

    it('coalesces repeated scroll events into one animation frame while preserving user-scroll intent', () => {
      const scheduleScrollEventDerivedStateSource = readSourceBetween(
        'const scheduleScrollEventDerivedState = useCallback((options: { fromUserScroll: boolean }) => {',
        'const handleScroll = useCallback',
      )

      expect(scheduleScrollEventDerivedStateSource).toContain('scrollStateFrameRef.current.fromUserScroll = (')
      expect(scheduleScrollEventDerivedStateSource).toContain('|| options.fromUserScroll')
      expect(scheduleScrollEventDerivedStateSource).toContain('if (scrollStateFrameRef.current.frameId !== null) return')
      expect(scheduleScrollEventDerivedStateSource).toContain('window.requestAnimationFrame')
      expect(scheduleScrollEventDerivedStateSource).toContain('processScrollEventDerivedState({ fromUserScroll })')
    })

    it('processes rAF scroll state before overlay visibility and cancels pending auto-scroll only after user scroll-away', () => {
      const processScrollEventDerivedStateSource = readSourceBetween(
        'const processScrollEventDerivedState = useCallback((options: { fromUserScroll: boolean }) => {',
        'const cancelScheduledScrollEventDerivedState = useCallback',
      )

      expect(processScrollEventDerivedStateSource).toContain('updateScrollDerivedState({ fromUserScroll })')
      expect(processScrollEventDerivedStateSource).toContain('if (fromUserScroll && (!shouldAutoScroll.current || suppressAutoScrollRef.current))')
      expect(processScrollEventDerivedStateSource).toContain('clearPendingAutoScrollTimer()')
      expect(processScrollEventDerivedStateSource).toContain('deriveScrollUiVisibility({')
      expect(processScrollEventDerivedStateSource).toContain('shouldAutoScroll: shouldAutoScroll.current')
      expect(processScrollEventDerivedStateSource).toContain('scrollUiHideTimerRef.current = window.setTimeout')
    })

    it('keeps date-label updates inside the next scroll animation frame', () => {
      const scheduleScrollEventDerivedStateSource = readSourceBetween(
        'const scheduleScrollEventDerivedState = useCallback((options: { fromUserScroll: boolean }) => {',
        'const handleScroll = useCallback',
      )
      const processScrollEventDerivedStateSource = readSourceBetween(
        'const processScrollEventDerivedState = useCallback((options: { fromUserScroll: boolean }) => {',
        'const cancelScheduledScrollEventDerivedState = useCallback',
      )
      const updateScrollDerivedStateSource = readSourceBetween(
        'const updateScrollDerivedState = useCallback((options?: { fromUserScroll?: boolean }) => {',
        'const processScrollEventDerivedState = useCallback',
      )

      const processIndex = scheduleScrollEventDerivedStateSource.indexOf('processScrollEventDerivedState({ fromUserScroll })')
      const dateLabelIndex = updateScrollDerivedStateSource.indexOf('applyScrollDateLabelState(findTopVisibleUtteranceDateLabel(')
      const overlayTimerIndex = processScrollEventDerivedStateSource.indexOf('scrollUiHideTimerRef.current = window.setTimeout')

      expect(scheduleScrollEventDerivedStateSource.match(/window\.requestAnimationFrame/g)).toHaveLength(1)
      expect(scheduleScrollEventDerivedStateSource).not.toContain('window.setTimeout')
      expect(processIndex).toBeGreaterThanOrEqual(0)
      expect(processScrollEventDerivedStateSource.indexOf('updateScrollDerivedState({ fromUserScroll })')).toBeLessThan(overlayTimerIndex)
      expect(dateLabelIndex).toBeGreaterThanOrEqual(0)
      expect(updateScrollDerivedStateSource).not.toContain('window.requestAnimationFrame')
      expect(updateScrollDerivedStateSource).not.toContain('window.setTimeout')
    })

    it('calculates late height effects before replacing measured anchor offsets', () => {
      const refreshSource = readSourceBetween(
        'const refreshScrollDateLabelAnchors = useCallback(() => {',
        'const applyScrollMetricsState = useCallback',
      )

      const calculateIndex = refreshSource.indexOf('deriveLateMessageHeightChangeEffectAboveViewportAnchor')
      const adjustIndex = refreshSource.indexOf('resolveLateMessageHeightChangeAnchorScrollTop')
      const assignIndex = refreshSource.indexOf('node.scrollTop = adjustedScrollTop')
      const replaceIndex = refreshSource.indexOf('scrollDateLabelAnchorsRef.current = nextAnchors')

      expect(refreshSource).toContain('lateMessageHeightChangeEffectAboveViewportAnchorRef')
      expect(refreshSource).toContain('viewportAnchorSnapshotRef.current')
      expect(calculateIndex).toBeGreaterThanOrEqual(0)
      expect(adjustIndex).toBeGreaterThan(calculateIndex)
      expect(assignIndex).toBeGreaterThan(adjustIndex)
      expect(replaceIndex).toBeGreaterThan(assignIndex)
    })

    it('keeps new-message append from clearing user scroll-away suppression before eligibility is known', () => {
      const newMessageAutoScrollEffectSource = readSourceBetween(
        'useLayoutEffect(() => {\n    const nextCounts: ChatScrollMessageCountSnapshot = {',
        '  useLayoutEffect(() => {\n    refreshScrollDateLabelAnchors()',
      )

      const earlyReturnIndex = newMessageAutoScrollEffectSource.indexOf(
        'if (!autoScrollState.shouldAutoScroll || !hasInitialBottomAnchorRef.current || !chatRef.current) return',
      )
      const clearSuppressIndex = newMessageAutoScrollEffectSource.indexOf('suppressAutoScrollRef.current = false')
      const forceFollowIndex = newMessageAutoScrollEffectSource.indexOf('shouldAutoScroll.current = true')

      expect(newMessageAutoScrollEffectSource).toContain('previousDistanceToBottom: lastDistanceToBottomRef.current')
      expect(newMessageAutoScrollEffectSource).toContain('resolveNewMessageAutoScrollTargetTop')
      expect(earlyReturnIndex).toBeGreaterThanOrEqual(0)
      expect(clearSuppressIndex).toBeGreaterThan(earlyReturnIndex)
      expect(forceFollowIndex).toBeGreaterThan(earlyReturnIndex)
    })
  })

  describe('live demo scroll handler measurement', () => {
    it('enables exactly one development counter when explicitly requested', () => {
      expect(resolveLivePhoneDemoScrollMeasurementCounter({
        nodeEnv: 'development',
        search: `?${LIVE_DEMO_SCROLL_MEASUREMENT_SEARCH_PARAM}=${LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER}`,
      })).toBe(LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER)

      expect(resolveLivePhoneDemoScrollMeasurementCounter({
        nodeEnv: 'development',
        storageValue: LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER,
      })).toBe(LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER)

      expect(resolveLivePhoneDemoScrollMeasurementCounter({
        nodeEnv: 'production',
        search: `?${LIVE_DEMO_SCROLL_MEASUREMENT_SEARCH_PARAM}=${LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER}`,
      })).toBeNull()

      expect(resolveLivePhoneDemoScrollMeasurementCounter({
        nodeEnv: 'development',
        search: `?${LIVE_DEMO_SCROLL_MEASUREMENT_SEARCH_PARAM}=${LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER},fps`,
      })).toBeNull()
    })

    it('reports median handler time after representative scroll samples', () => {
      const state = createScrollHandlerMeasurementState()

      recordLivePhoneDemoScrollHandlerMeasurement(state, 3)
      recordLivePhoneDemoScrollHandlerMeasurement(state, 1)
      const earlySnapshot = recordLivePhoneDemoScrollHandlerMeasurement(state, 2)

      expect(earlySnapshot).toMatchObject({
        sampleCount: 3,
        sampleTarget: LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_SAMPLE_TARGET,
        representative: false,
        latestMs: 2,
        medianMs: 2,
        maxMs: 3,
      })

      const representativeSnapshot = readLivePhoneDemoScrollHandlerMeasurement(state, 3)
      expect(representativeSnapshot).toMatchObject({
        sampleCount: 3,
        sampleTarget: 3,
        representative: true,
        medianMs: 2,
      })
      expect(representativeSnapshot.medianMs).toBeLessThanOrEqual(LIVE_DEMO_SCROLL_HANDLER_MEDIAN_BUDGET_MS)
    })

    it('keeps only the latest bounded sample window active', () => {
      const state = createScrollHandlerMeasurementState()

      recordLivePhoneDemoScrollHandlerMeasurement(state, 10, 3)
      recordLivePhoneDemoScrollHandlerMeasurement(state, 20, 3)
      recordLivePhoneDemoScrollHandlerMeasurement(state, 30, 3)
      const snapshot = recordLivePhoneDemoScrollHandlerMeasurement(state, 40, 3)

      expect(state.samplesMs).toEqual([20, 30, 40])
      expect(snapshot).toMatchObject({
        sampleCount: 3,
        latestMs: 40,
        medianMs: 30,
        maxMs: 40,
      })
    })
  })

  describe('deriveLivePhoneDemoScrollMetrics', () => {
    it('calculates scroll thumb geometry and distance from the current DOM metrics', () => {
      expect(deriveLivePhoneDemoScrollMetrics({
        scrollTop: 300,
        scrollHeight: 1_200,
        clientHeight: 400,
      })).toEqual({
        thumbTop: 100.125,
        thumbHeight: 133,
        clientHeight: 400,
        scrollable: true,
        distanceToBottom: 500,
      })
    })

    it('uses the minimum thumb size and clamps the thumb at the bottom for large chats', () => {
      expect(deriveLivePhoneDemoScrollMetrics({
        scrollTop: 19_500,
        scrollHeight: 20_000,
        clientHeight: 700,
      })).toEqual({
        thumbTop: 700 - CHAT_SCROLLBAR_MIN_THUMB_HEIGHT_PX,
        thumbHeight: CHAT_SCROLLBAR_MIN_THUMB_HEIGHT_PX,
        clientHeight: 700,
        scrollable: true,
        distanceToBottom: 0,
      })
    })

    it('treats content within the one-pixel overflow tolerance as non-scrollable', () => {
      expect(deriveLivePhoneDemoScrollMetrics({
        scrollTop: 0,
        scrollHeight: 401,
        clientHeight: 400,
      })).toEqual({
        thumbTop: 0,
        thumbHeight: 0,
        clientHeight: 400,
        scrollable: false,
        distanceToBottom: 1,
      })
    })

    it('keeps iOS top rubber-band distance while pinning the thumb to the top', () => {
      expect(deriveLivePhoneDemoScrollMetrics({
        scrollTop: -24,
        scrollHeight: 1_200,
        clientHeight: 400,
      })).toEqual({
        thumbTop: 0,
        thumbHeight: 133,
        clientHeight: 400,
        scrollable: true,
        distanceToBottom: 824,
      })
    })
  })

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

    it('preserves user-scrolled-away position when committed or live chat items arrive', () => {
      const previousScrollTop = 560
      const previousDistanceToBottom = AUTO_SCROLL_BOTTOM_THRESHOLD_PX + 240
      const scrolledAwayState = deriveScrollAutoFollowState({
        distanceToBottom: previousDistanceToBottom,
        fromUserScroll: true,
        suppressAutoScroll: false,
        isPaginating: false,
        isLoadingOlder: false,
      })

      expect(scrolledAwayState.isNearBottom).toBe(false)
      expect(scrolledAwayState.suppressAutoScroll).toBe(true)
      expect(scrolledAwayState.shouldAutoScroll).toBe(false)

      const newChatItemCases = [
        {
          name: 'committed item',
          previousCounts: { utteranceCount: 24, liveUtteranceCount: 0 },
          nextCounts: { utteranceCount: 25, liveUtteranceCount: 0 },
        },
        {
          name: 'live item',
          previousCounts: { utteranceCount: 24, liveUtteranceCount: 0 },
          nextCounts: { utteranceCount: 24, liveUtteranceCount: 1 },
        },
      ]

      for (const testCase of newChatItemCases) {
        const state = deriveNewMessageAutoScrollState({
          previousCounts: testCase.previousCounts,
          nextCounts: testCase.nextCounts,
          previousDistanceToBottom,
          isPaginating: false,
          isLoadingOlder: false,
        })
        const autoScrollTargetTop = resolveNewMessageAutoScrollTargetTop({
          shouldAutoScroll: state.shouldAutoScroll,
          currentScrollTop: previousScrollTop,
          currentScrollHeight: 1_420,
          currentClientHeight: 420,
        })
        const followStateAfterAppend = deriveScrollAutoFollowState({
          distanceToBottom: previousDistanceToBottom + 120,
          fromUserScroll: false,
          suppressAutoScroll: scrolledAwayState.suppressAutoScroll,
          isPaginating: false,
          isLoadingOlder: false,
        })

        expect(state.hasNewMessage, testCase.name).toBe(true)
        expect(state.shouldAutoScroll, testCase.name).toBe(false)
        expect(autoScrollTargetTop, testCase.name).toBeNull()
        expect(followStateAfterAppend.suppressAutoScroll, testCase.name).toBe(true)
        expect(followStateAfterAppend.shouldAutoScroll, testCase.name).toBe(false)
      }
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
    it('captures a pending scrollTop snapshot while prepend height has not applied yet', () => {
      expect(shouldReadPrependScrollHeightForSnapshot({
        isPaginating: true,
        previousScrollHeight: 1_200,
      })).toBe(true)

      expect(shouldCapturePrependScrollTopSnapshot({
        isPaginating: true,
        previousScrollHeight: 1_200,
        currentScrollHeight: 1_200.5,
      })).toBe(true)
    })

    it('stops capturing the pending scrollTop snapshot after prepend height applies', () => {
      expect(shouldCapturePrependScrollTopSnapshot({
        isPaginating: true,
        previousScrollHeight: 1_200,
        currentScrollHeight: 1_340,
      })).toBe(false)
    })

    it('does not capture a pending scrollTop snapshot outside prepend pagination', () => {
      expect(shouldReadPrependScrollHeightForSnapshot({
        isPaginating: false,
        previousScrollHeight: 1_200,
      })).toBe(false)
      expect(shouldReadPrependScrollHeightForSnapshot({
        isPaginating: true,
        previousScrollHeight: null,
      })).toBe(false)

      expect(shouldCapturePrependScrollTopSnapshot({
        isPaginating: false,
        previousScrollHeight: 1_200,
        currentScrollHeight: 1_200,
      })).toBe(false)
      expect(shouldCapturePrependScrollTopSnapshot({
        isPaginating: true,
        previousScrollHeight: null,
        currentScrollHeight: 1_200,
      })).toBe(false)
    })

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

    it('preserves the top-visible utterance viewport offset when older chat items are inserted before it', () => {
      const existingMessages = Array.from({ length: 18 }, (_, index) => ({
        id: `current-${index}`,
        heightPx: 54 + (index % 4) * 17,
      }))
      const olderMessages = [
        { id: 'older-0', heightPx: 92 },
        { id: 'older-1', heightPx: 64 },
        { id: 'older-2', heightPx: 118 },
        { id: 'older-3', heightPx: 73 },
      ]
      const previousAnchors = createStackedScrollAnchors(existingMessages)
      const nextAnchors = createStackedScrollAnchors([...olderMessages, ...existingMessages])
      const anchorUtteranceId = 'current-8'
      const previousAnchor = previousAnchors.find((anchor) => anchor.utteranceId === anchorUtteranceId)

      expect(previousAnchor).toBeDefined()
      const previousScrollTop = (previousAnchor?.offsetTop ?? 0) + 23.5
      const previousSnapshot = resolveScrollViewportAnchorSnapshot({
        anchors: previousAnchors,
        scrollTop: previousScrollTop,
      })

      expect(previousSnapshot).toEqual({
        utteranceId: anchorUtteranceId,
        topOffsetPx: -23.5,
      })
      if (!previousSnapshot) throw new Error('Expected a viewport anchor snapshot')

      const previousScrollHeight = getStackedScrollHeight(previousAnchors)
      const nextScrollHeight = getStackedScrollHeight(nextAnchors)
      const nextScrollTop = resolvePrependScrollAnchorTop({
        previousScrollHeight,
        nextScrollHeight,
        previousScrollTop,
        maxScrollTop: nextScrollHeight - 640,
      })
      const nextViewportTopOffset = getViewportTopOffsetForAnchor(
        nextAnchors,
        previousSnapshot.utteranceId,
        nextScrollTop,
      )

      expect(Math.abs(nextViewportTopOffset - previousSnapshot.topOffsetPx)).toBeLessThanOrEqual(1)
    })

    it('keeps the selected anchor stable in a 500-utterance chat after a history page prepends', () => {
      const existingMessages = Array.from({ length: 500 }, (_, index) => ({
        id: `current-${index}`,
        heightPx: 48 + (index % 7) * 9,
      }))
      const olderMessages = Array.from({ length: 25 }, (_, index) => ({
        id: `older-${index}`,
        heightPx: 52 + (index % 5) * 13,
      }))
      const previousAnchors = createStackedScrollAnchors(existingMessages)
      const nextAnchors = createStackedScrollAnchors([...olderMessages, ...existingMessages])
      const anchorUtteranceId = 'current-241'
      const previousAnchor = previousAnchors.find((anchor) => anchor.utteranceId === anchorUtteranceId)

      expect(previousAnchor).toBeDefined()
      const previousScrollTop = (previousAnchor?.offsetTop ?? 0) + 31.25
      const previousSnapshot = resolveScrollViewportAnchorSnapshot({
        anchors: previousAnchors,
        scrollTop: previousScrollTop,
      })

      expect(previousSnapshot).toEqual({
        utteranceId: anchorUtteranceId,
        topOffsetPx: -31.25,
      })
      if (!previousSnapshot) throw new Error('Expected a viewport anchor snapshot')

      const previousScrollHeight = getStackedScrollHeight(previousAnchors)
      const nextScrollHeight = getStackedScrollHeight(nextAnchors)
      const nextScrollTop = resolvePrependScrollAnchorTop({
        previousScrollHeight,
        nextScrollHeight,
        previousScrollTop,
        maxScrollTop: nextScrollHeight - 640,
      })
      const nextViewportTopOffset = getViewportTopOffsetForAnchor(
        nextAnchors,
        previousSnapshot.utteranceId,
        nextScrollTop,
      )

      expect(Math.abs(nextViewportTopOffset - previousSnapshot.topOffsetPx)).toBeLessThanOrEqual(1)
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

  describe('resolveScrollViewportAnchorSnapshot', () => {
    it('tracks the top-visible message id and viewport-relative top offset', () => {
      expect(resolveScrollViewportAnchorSnapshot({
        anchors: [
          { utteranceId: 'oldest-visible', createdAtMs: 1_700_000_010_000, offsetTop: 16, offsetHeight: 160 },
          { utteranceId: 'next-visible', createdAtMs: 1_700_000_011_000, offsetTop: 188, offsetHeight: 44 },
        ],
        scrollTop: 132,
      })).toEqual({
        utteranceId: 'oldest-visible',
        topOffsetPx: -116,
      })
    })

    it('does not create a viewport anchor snapshot without a message id', () => {
      expect(resolveScrollViewportAnchorSnapshot({
        anchors: [
          { createdAtMs: 1_700_000_010_000, offsetTop: 16, offsetHeight: 160 },
        ],
        scrollTop: 132,
      })).toBeNull()
    })
  })

  describe('deriveLateMessageHeightChangeEffectAboveViewportAnchor', () => {
    it('detects per-message height changes above the viewport anchor and sums their effect', () => {
      expect(deriveLateMessageHeightChangeEffectAboveViewportAnchor({
        viewportAnchor: { utteranceId: 'anchor', topOffsetPx: -12 },
        previousAnchors: [
          { utteranceId: 'before-a', createdAtMs: 1, offsetTop: 0, offsetHeight: 40 },
          { utteranceId: 'before-b', createdAtMs: 2, offsetTop: 52, offsetHeight: 70 },
          { utteranceId: 'anchor', createdAtMs: 3, offsetTop: 134, offsetHeight: 80 },
          { utteranceId: 'after', createdAtMs: 4, offsetTop: 226, offsetHeight: 60 },
        ],
        nextAnchors: [
          { utteranceId: 'before-a', createdAtMs: 1, offsetTop: 0, offsetHeight: 55 },
          { utteranceId: 'before-b', createdAtMs: 2, offsetTop: 67, offsetHeight: 66 },
          { utteranceId: 'anchor', createdAtMs: 3, offsetTop: 145, offsetHeight: 96 },
          { utteranceId: 'after', createdAtMs: 4, offsetTop: 253, offsetHeight: 120 },
        ],
      })).toEqual({
        anchorUtteranceId: 'anchor',
        deltaAboveAnchorPx: 11,
        changedMessages: [
          {
            utteranceId: 'before-a',
            previousHeightPx: 40,
            nextHeightPx: 55,
            deltaPx: 15,
          },
          {
            utteranceId: 'before-b',
            previousHeightPx: 70,
            nextHeightPx: 66,
            deltaPx: -4,
          },
        ],
      })
    })

    it('ignores anchor, below-anchor, missing, and one-pixel height changes', () => {
      expect(deriveLateMessageHeightChangeEffectAboveViewportAnchor({
        viewportAnchor: { utteranceId: 'anchor', topOffsetPx: 0 },
        previousAnchors: [
          { utteranceId: 'tiny-change', createdAtMs: 1, offsetTop: 0, offsetHeight: 40 },
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 52, offsetHeight: 80 },
          { utteranceId: 'after', createdAtMs: 3, offsetTop: 144, offsetHeight: 60 },
        ],
        nextAnchors: [
          { utteranceId: 'new-before', createdAtMs: 0, offsetTop: 0, offsetHeight: 22 },
          { utteranceId: 'tiny-change', createdAtMs: 1, offsetTop: 34, offsetHeight: 40.5 },
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 86, offsetHeight: 120 },
          { utteranceId: 'after', createdAtMs: 3, offsetTop: 218, offsetHeight: 100 },
        ],
      })).toEqual({
        anchorUtteranceId: 'anchor',
        deltaAboveAnchorPx: 0,
        changedMessages: [],
      })
    })

    it('returns an empty effect when the viewport anchor is unavailable', () => {
      expect(deriveLateMessageHeightChangeEffectAboveViewportAnchor({
        viewportAnchor: null,
        previousAnchors: [
          { utteranceId: 'before', createdAtMs: 1, offsetTop: 0, offsetHeight: 40 },
        ],
        nextAnchors: [
          { utteranceId: 'before', createdAtMs: 1, offsetTop: 0, offsetHeight: 80 },
        ],
      })).toEqual({
        anchorUtteranceId: null,
        deltaAboveAnchorPx: 0,
        changedMessages: [],
      })
    })
  })

  describe('resolveLateMessageHeightChangeAnchorScrollTop', () => {
    it('keeps the viewport anchor at the same top offset after late height changes above it', () => {
      expect(resolveLateMessageHeightChangeAnchorScrollTop({
        viewportAnchor: { utteranceId: 'anchor', topOffsetPx: -12 },
        nextAnchors: [
          { utteranceId: 'before', createdAtMs: 1, offsetTop: 0, offsetHeight: 84 },
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 145, offsetHeight: 90 },
        ],
        currentScrollTop: 146,
        deltaAboveAnchorPx: 11,
        maxScrollTop: 600,
      })).toBe(157)
    })

    it('does not apply a duplicate adjustment when the current scrollTop already preserves the anchor', () => {
      expect(resolveLateMessageHeightChangeAnchorScrollTop({
        viewportAnchor: { utteranceId: 'anchor', topOffsetPx: -12 },
        nextAnchors: [
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 145, offsetHeight: 90 },
        ],
        currentScrollTop: 156.5,
        deltaAboveAnchorPx: 11,
        maxScrollTop: 600,
      })).toBeNull()
    })

    it('clamps the compensated scrollTop to the scrollable range', () => {
      expect(resolveLateMessageHeightChangeAnchorScrollTop({
        viewportAnchor: { utteranceId: 'anchor', topOffsetPx: -20 },
        nextAnchors: [
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 220, offsetHeight: 90 },
        ],
        currentScrollTop: 190,
        deltaAboveAnchorPx: 50,
        maxScrollTop: 210,
      })).toBe(210)

      expect(resolveLateMessageHeightChangeAnchorScrollTop({
        viewportAnchor: { utteranceId: 'anchor', topOffsetPx: 24 },
        nextAnchors: [
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 12, offsetHeight: 90 },
        ],
        currentScrollTop: 12,
        deltaAboveAnchorPx: -14,
        maxScrollTop: 210,
      })).toBe(0)
    })

    it('skips compensation without a measurable late height effect or anchor', () => {
      expect(resolveLateMessageHeightChangeAnchorScrollTop({
        viewportAnchor: { utteranceId: 'anchor', topOffsetPx: 0 },
        nextAnchors: [
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 145, offsetHeight: 90 },
        ],
        currentScrollTop: 145,
        deltaAboveAnchorPx: 1,
      })).toBeNull()

      expect(resolveLateMessageHeightChangeAnchorScrollTop({
        viewportAnchor: { utteranceId: 'missing', topOffsetPx: 0 },
        nextAnchors: [
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 145, offsetHeight: 90 },
        ],
        currentScrollTop: 145,
        deltaAboveAnchorPx: 10,
      })).toBeNull()

      expect(resolveLateMessageHeightChangeAnchorScrollTop({
        viewportAnchor: null,
        nextAnchors: [
          { utteranceId: 'anchor', createdAtMs: 2, offsetTop: 145, offsetHeight: 90 },
        ],
        currentScrollTop: 145,
        deltaAboveAnchorPx: 10,
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
