export const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 100
export const AUTO_SCROLL_MIN_INTERVAL_MS = 1000
export const CHAT_SCROLLBAR_MIN_THUMB_HEIGHT_PX = 28
export const LIVE_DEMO_SCROLL_MEASUREMENT_SEARCH_PARAM = 'mingleScrollMeasure'
export const LIVE_DEMO_SCROLL_MEASUREMENT_STORAGE_KEY = 'mingle_live_demo_scroll_measure'
export const LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER = 'chat-scroll-handler'
export const LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_SAMPLE_TARGET = 120
export const LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_MAX_SAMPLES = 240

export type LivePhoneDemoScrollMeasurementCounter = typeof LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER

export interface ResolveLivePhoneDemoScrollMeasurementCounterInput {
  nodeEnv: string | undefined
  search?: string
  storageValue?: string | null
}

export interface LivePhoneDemoScrollHandlerMeasurementState {
  counter: LivePhoneDemoScrollMeasurementCounter
  samplesMs: number[]
  latestMs: number
  maxMs: number
}

export interface LivePhoneDemoScrollHandlerMeasurementSnapshot {
  counter: LivePhoneDemoScrollMeasurementCounter
  sampleCount: number
  sampleTarget: number
  representative: boolean
  latestMs: number
  medianMs: number
  maxMs: number
}

function normalizeMeasurementDurationMs(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
}

function roundMeasurementDurationMs(durationMs: number): number {
  return Math.round(durationMs * 1000) / 1000
}

function resolveMedianMeasurementDurationMs(samplesMs: readonly number[]): number {
  if (samplesMs.length === 0) return 0

  const sortedSamples = [...samplesMs].sort((a, b) => a - b)
  const midpoint = Math.floor(sortedSamples.length / 2)

  return sortedSamples.length % 2 === 0
    ? (sortedSamples[midpoint - 1] + sortedSamples[midpoint]) / 2
    : sortedSamples[midpoint]
}

function readRequestedScrollMeasurementCounter(rawValue: string | null | undefined): LivePhoneDemoScrollMeasurementCounter | null {
  const requested = rawValue?.trim() ?? ''
  return requested === LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER
    ? LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_COUNTER
    : null
}

export function resolveLivePhoneDemoScrollMeasurementCounter(
  input: ResolveLivePhoneDemoScrollMeasurementCounterInput,
): LivePhoneDemoScrollMeasurementCounter | null {
  if (input.nodeEnv === 'production') return null

  const search = input.search ?? ''
  let requestedFromSearch: string | null = null

  try {
    requestedFromSearch = new URLSearchParams(search).get(LIVE_DEMO_SCROLL_MEASUREMENT_SEARCH_PARAM)
  } catch {
    requestedFromSearch = null
  }

  return readRequestedScrollMeasurementCounter(requestedFromSearch)
    ?? readRequestedScrollMeasurementCounter(input.storageValue)
}

export function readLivePhoneDemoScrollHandlerMeasurement(
  state: LivePhoneDemoScrollHandlerMeasurementState,
  sampleTarget = LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_SAMPLE_TARGET,
): LivePhoneDemoScrollHandlerMeasurementSnapshot {
  const safeSampleTarget = Number.isFinite(sampleTarget)
    ? Math.max(1, Math.floor(sampleTarget))
    : LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_SAMPLE_TARGET
  const sampleCount = state.samplesMs.length

  return {
    counter: state.counter,
    sampleCount,
    sampleTarget: safeSampleTarget,
    representative: sampleCount >= safeSampleTarget,
    latestMs: roundMeasurementDurationMs(state.latestMs),
    medianMs: roundMeasurementDurationMs(resolveMedianMeasurementDurationMs(state.samplesMs)),
    maxMs: roundMeasurementDurationMs(state.maxMs),
  }
}

export function recordLivePhoneDemoScrollHandlerMeasurement(
  state: LivePhoneDemoScrollHandlerMeasurementState,
  durationMs: number,
  maxSamples = LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_MAX_SAMPLES,
): LivePhoneDemoScrollHandlerMeasurementSnapshot {
  const safeMaxSamples = Number.isFinite(maxSamples)
    ? Math.max(1, Math.floor(maxSamples))
    : LIVE_DEMO_SCROLL_HANDLER_MEASUREMENT_MAX_SAMPLES
  const normalizedDurationMs = normalizeMeasurementDurationMs(durationMs)

  state.latestMs = normalizedDurationMs
  state.samplesMs.push(normalizedDurationMs)
  if (state.samplesMs.length > safeMaxSamples) {
    state.samplesMs.splice(0, state.samplesMs.length - safeMaxSamples)
  }
  state.maxMs = state.samplesMs.reduce((maxMs, sampleMs) => Math.max(maxMs, sampleMs), 0)

  return readLivePhoneDemoScrollHandlerMeasurement(state)
}

export interface LivePhoneDemoScrollMetrics {
  thumbTop: number
  thumbHeight: number
  clientHeight: number
  scrollable: boolean
  distanceToBottom: number
}

export const INITIAL_SCROLL_METRICS: LivePhoneDemoScrollMetrics = {
  thumbTop: 0,
  thumbHeight: 0,
  clientHeight: 0,
  scrollable: false,
  distanceToBottom: 0,
}

export function areScrollMetricsEqual(
  current: LivePhoneDemoScrollMetrics,
  next: LivePhoneDemoScrollMetrics,
): boolean {
  return (
    current.thumbTop === next.thumbTop
    && current.thumbHeight === next.thumbHeight
    && current.clientHeight === next.clientHeight
    && current.scrollable === next.scrollable
    && current.distanceToBottom === next.distanceToBottom
  )
}

export interface DeriveLivePhoneDemoScrollMetricsInput {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  minThumbHeightPx?: number
}

export function deriveLivePhoneDemoScrollMetrics(
  input: DeriveLivePhoneDemoScrollMetricsInput,
): LivePhoneDemoScrollMetrics {
  const { scrollTop, scrollHeight, clientHeight } = input
  const minThumbHeightPx = input.minThumbHeightPx ?? CHAT_SCROLLBAR_MIN_THUMB_HEIGHT_PX
  const distanceToBottom = Math.max(0, scrollHeight - scrollTop - clientHeight)

  if (scrollHeight > clientHeight + 1) {
    const thumbHeight = Math.max(
      minThumbHeightPx,
      Math.round((clientHeight / scrollHeight) * clientHeight),
    )
    const maxThumbTop = Math.max(0, clientHeight - thumbHeight)
    const denominator = scrollHeight - clientHeight
    const ratio = denominator > 0 ? Math.min(1, Math.max(0, scrollTop / denominator)) : 0
    const thumbTop = ratio * maxThumbTop

    return {
      thumbTop,
      thumbHeight,
      clientHeight,
      scrollable: true,
      distanceToBottom,
    }
  }

  return {
    thumbTop: 0,
    thumbHeight: 0,
    clientHeight,
    scrollable: false,
    distanceToBottom,
  }
}

export interface NavigatorLikeForIosCheck {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
}

export function isLikelyIOSNavigator(navigatorLike: NavigatorLikeForIosCheck): boolean {
  const ua = navigatorLike.userAgent || ''
  const platform = navigatorLike.platform || ''
  const maxTouchPoints = typeof navigatorLike.maxTouchPoints === 'number'
    ? navigatorLike.maxTouchPoints
    : 0
  return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export interface DeriveScrollAutoFollowStateInput {
  distanceToBottom: number
  fromUserScroll: boolean
  suppressAutoScroll: boolean
  isPaginating: boolean
  isLoadingOlder: boolean
  nearBottomThresholdPx?: number
}

export interface DeriveScrollAutoFollowStateResult {
  isNearBottom: boolean
  suppressAutoScroll: boolean
  shouldAutoScroll: boolean
}

export function deriveScrollAutoFollowState(
  input: DeriveScrollAutoFollowStateInput,
): DeriveScrollAutoFollowStateResult {
  const threshold = input.nearBottomThresholdPx ?? AUTO_SCROLL_BOTTOM_THRESHOLD_PX
  const safeDistance = Number.isFinite(input.distanceToBottom)
    ? Math.max(0, input.distanceToBottom)
    : Number.POSITIVE_INFINITY
  const isNearBottom = safeDistance <= threshold

  // When user explicitly scrolls, manual scroll intent should win.
  // Auto-follow is re-enabled only when user returns near the bottom.
  const nextSuppressAutoScroll = input.fromUserScroll
    ? !isNearBottom
    : input.suppressAutoScroll

  const shouldAutoScroll = (
    isNearBottom
    && !nextSuppressAutoScroll
    && !input.isPaginating
    && !input.isLoadingOlder
  )

  return {
    isNearBottom,
    suppressAutoScroll: nextSuppressAutoScroll,
    shouldAutoScroll,
  }
}

export interface ChatScrollMessageCountSnapshot {
  utteranceCount: number
  liveUtteranceCount: number
}

export interface DeriveNewMessageAutoScrollStateInput {
  previousCounts: ChatScrollMessageCountSnapshot
  nextCounts: ChatScrollMessageCountSnapshot
  previousDistanceToBottom: number
  isPaginating: boolean
  isLoadingOlder: boolean
  nearBottomThresholdPx?: number
}

export interface DeriveNewMessageAutoScrollStateResult {
  hasNewMessage: boolean
  shouldAutoScroll: boolean
}

export interface ResolveNewMessageAutoScrollTargetTopInput {
  shouldAutoScroll: boolean
  currentScrollTop: number
  currentScrollHeight: number
  currentClientHeight: number
  bottomTolerancePx?: number
}

function normalizeMessageCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
}

export function deriveNewMessageAutoScrollState(
  input: DeriveNewMessageAutoScrollStateInput,
): DeriveNewMessageAutoScrollStateResult {
  const previousUtteranceCount = normalizeMessageCount(input.previousCounts.utteranceCount)
  const nextUtteranceCount = normalizeMessageCount(input.nextCounts.utteranceCount)
  const previousLiveUtteranceCount = normalizeMessageCount(input.previousCounts.liveUtteranceCount)
  const nextLiveUtteranceCount = normalizeMessageCount(input.nextCounts.liveUtteranceCount)
  const hasNewMessage = (
    nextUtteranceCount > previousUtteranceCount
    || nextLiveUtteranceCount > previousLiveUtteranceCount
  )
  const threshold = input.nearBottomThresholdPx ?? AUTO_SCROLL_BOTTOM_THRESHOLD_PX
  const previousDistanceToBottom = Number.isFinite(input.previousDistanceToBottom)
    ? Math.max(0, input.previousDistanceToBottom)
    : Number.POSITIVE_INFINITY

  return {
    hasNewMessage,
    shouldAutoScroll: (
      hasNewMessage
      && previousDistanceToBottom <= threshold
      && !input.isPaginating
      && !input.isLoadingOlder
    ),
  }
}

export function resolveNewMessageAutoScrollTargetTop(
  input: ResolveNewMessageAutoScrollTargetTopInput,
): number | null {
  if (!input.shouldAutoScroll) return null

  const currentScrollTop = Number.isFinite(input.currentScrollTop)
    ? Math.max(0, input.currentScrollTop)
    : 0
  const currentScrollHeight = Number.isFinite(input.currentScrollHeight)
    ? Math.max(0, input.currentScrollHeight)
    : 0
  const currentClientHeight = Number.isFinite(input.currentClientHeight)
    ? Math.max(0, input.currentClientHeight)
    : 0
  const bottomTolerancePx = typeof input.bottomTolerancePx === 'number' && Number.isFinite(input.bottomTolerancePx)
    ? Math.max(0, input.bottomTolerancePx)
    : 1
  const distanceToBottom = Math.abs(currentScrollHeight - currentScrollTop - currentClientHeight)

  return distanceToBottom > bottomTolerancePx
    ? currentScrollHeight
    : null
}

export interface ResolvePrependScrollAnchorTopInput {
  previousScrollHeight: number
  nextScrollHeight: number
  previousScrollTop: number
  maxScrollTop?: number
}

export interface ShouldCapturePrependScrollTopSnapshotInput {
  isPaginating: boolean
  previousScrollHeight: number | null | undefined
  currentScrollHeight: number
  heightTolerancePx?: number
}

export function shouldCapturePrependScrollTopSnapshot(
  input: ShouldCapturePrependScrollTopSnapshotInput,
): boolean {
  if (!input.isPaginating) return false
  if (typeof input.previousScrollHeight !== 'number' || !Number.isFinite(input.previousScrollHeight)) {
    return false
  }

  const currentScrollHeight = Number.isFinite(input.currentScrollHeight)
    ? input.currentScrollHeight
    : Number.POSITIVE_INFINITY
  const heightTolerancePx = typeof input.heightTolerancePx === 'number' && Number.isFinite(input.heightTolerancePx)
    ? Math.max(0, input.heightTolerancePx)
    : 1

  return Math.abs(currentScrollHeight - input.previousScrollHeight) <= heightTolerancePx
}

export function resolvePrependScrollAnchorTop(
  input: ResolvePrependScrollAnchorTopInput,
): number {
  const previousScrollHeight = Number.isFinite(input.previousScrollHeight)
    ? Math.max(0, input.previousScrollHeight)
    : 0
  const nextScrollHeight = Number.isFinite(input.nextScrollHeight)
    ? Math.max(0, input.nextScrollHeight)
    : previousScrollHeight
  const previousScrollTop = Number.isFinite(input.previousScrollTop)
    ? Math.max(0, input.previousScrollTop)
    : 0
  const maxScrollTop = typeof input.maxScrollTop === 'number' && Number.isFinite(input.maxScrollTop)
    ? Math.max(0, input.maxScrollTop)
    : null

  const targetScrollTop = previousScrollTop + (nextScrollHeight - previousScrollHeight)
  const lowerBoundedScrollTop = Math.max(0, targetScrollTop)

  return maxScrollTop === null
    ? lowerBoundedScrollTop
    : Math.min(maxScrollTop, lowerBoundedScrollTop)
}

export interface DeriveAutoScrollClockDelayMsInput {
  nowMs: number
  intervalMs?: number
}

export function deriveAutoScrollClockDelayMs(
  input: DeriveAutoScrollClockDelayMsInput,
): number {
  const intervalMs = input.intervalMs ?? AUTO_SCROLL_MIN_INTERVAL_MS
  const safeNowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0
  if (intervalMs <= 0) return 0
  const remainderMs = ((safeNowMs % intervalMs) + intervalMs) % intervalMs
  return remainderMs === 0 ? 0 : intervalMs - remainderMs
}

export interface AutoScrollSchedulerUpdateInput {
  shouldAutoScroll: () => boolean
  runAutoScroll: () => boolean
}

export interface AutoScrollSchedulerOptions {
  minIntervalMs?: number
  getNowMs?: () => number
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

export interface AutoScrollScheduler {
  update: (input: AutoScrollSchedulerUpdateInput) => void
  cancel: () => void
  markPerformed: (nowMs?: number) => void
}

export function createAutoScrollScheduler(
  options: AutoScrollSchedulerOptions = {},
): AutoScrollScheduler {
  const minIntervalMs = options.minIntervalMs ?? AUTO_SCROLL_MIN_INTERVAL_MS
  const getNowMs = options.getNowMs ?? (() => Date.now())
  const setTimer = options.setTimer ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer ?? ((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer))

  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let currentInput: AutoScrollSchedulerUpdateInput | null = null
  let hasPendingUpdate = false

  const cancel = () => {
    if (!pendingTimer) return
    clearTimer(pendingTimer)
    pendingTimer = null
  }

  const execute = () => {
    hasPendingUpdate = false
    if (!currentInput?.shouldAutoScroll()) return
    currentInput.runAutoScroll()
  }

  return {
    update(input) {
      currentInput = input
      hasPendingUpdate = true
      cancel()
      const delayMs = deriveAutoScrollClockDelayMs({ nowMs: getNowMs(), intervalMs: minIntervalMs })

      if (delayMs === 0) {
        execute()
        return
      }

      pendingTimer = setTimer(() => {
        pendingTimer = null
        if (!hasPendingUpdate) return
        execute()
      }, delayMs)
    },
    cancel,
    markPerformed() {
      hasPendingUpdate = false
      cancel()
    },
  }
}

export interface DeriveScrollUiVisibilityInput {
  fromUserScroll: boolean
  shouldAutoScroll: boolean
}

export interface DeriveScrollUiVisibilityResult {
  visible: boolean
  scheduleHideTimer: boolean
}

export function deriveScrollUiVisibility(
  input: DeriveScrollUiVisibilityInput,
): DeriveScrollUiVisibilityResult {
  // During pure auto-follow scrolls, keep overlay hidden.
  if (!input.fromUserScroll && input.shouldAutoScroll) {
    return { visible: false, scheduleHideTimer: false }
  }

  // User scroll or non-auto-follow momentum: keep visible for a short window.
  return { visible: true, scheduleHideTimer: true }
}

export interface ScrollDateLabelAnchor {
  utteranceId?: string
  createdAtMs: number
  offsetTop: number
  offsetHeight: number
}

export interface ScrollViewportAnchorSnapshot {
  utteranceId: string
  topOffsetPx: number
}

export interface ResolveScrollViewportAnchorSnapshotInput {
  anchors: readonly ScrollDateLabelAnchor[]
  scrollTop: number
  topTolerancePx?: number
}

export interface LateMessageHeightChangeAboveViewportAnchor {
  utteranceId: string
  previousHeightPx: number
  nextHeightPx: number
  deltaPx: number
}

export interface LateMessageHeightChangeEffectAboveViewportAnchor {
  anchorUtteranceId: string | null
  deltaAboveAnchorPx: number
  changedMessages: LateMessageHeightChangeAboveViewportAnchor[]
}

export interface DeriveLateMessageHeightChangeEffectAboveViewportAnchorInput {
  previousAnchors: readonly ScrollDateLabelAnchor[]
  nextAnchors: readonly ScrollDateLabelAnchor[]
  viewportAnchor: ScrollViewportAnchorSnapshot | null
  heightTolerancePx?: number
}

export function deriveLateMessageHeightChangeEffectAboveViewportAnchor(
  input: DeriveLateMessageHeightChangeEffectAboveViewportAnchorInput,
): LateMessageHeightChangeEffectAboveViewportAnchor {
  const anchorUtteranceId = input.viewportAnchor?.utteranceId
  if (!anchorUtteranceId) {
    return {
      anchorUtteranceId: null,
      deltaAboveAnchorPx: 0,
      changedMessages: [],
    }
  }

  const anchorIndex = input.nextAnchors.findIndex((anchor) => anchor.utteranceId === anchorUtteranceId)
  if (anchorIndex < 0) {
    return {
      anchorUtteranceId: null,
      deltaAboveAnchorPx: 0,
      changedMessages: [],
    }
  }

  const heightTolerancePx = typeof input.heightTolerancePx === 'number' && Number.isFinite(input.heightTolerancePx)
    ? Math.max(0, input.heightTolerancePx)
    : 1
  const previousById = new Map<string, ScrollDateLabelAnchor>()

  for (const anchor of input.previousAnchors) {
    if (!anchor.utteranceId || previousById.has(anchor.utteranceId)) continue
    previousById.set(anchor.utteranceId, anchor)
  }

  const changedMessages: LateMessageHeightChangeAboveViewportAnchor[] = []
  let deltaAboveAnchorPx = 0

  for (let index = 0; index < anchorIndex; index += 1) {
    const nextAnchor = input.nextAnchors[index]
    const utteranceId = nextAnchor.utteranceId
    if (!utteranceId) continue

    const previousAnchor = previousById.get(utteranceId)
    if (!previousAnchor) continue
    if (!Number.isFinite(previousAnchor.offsetHeight) || !Number.isFinite(nextAnchor.offsetHeight)) continue

    const previousHeightPx = previousAnchor.offsetHeight
    const nextHeightPx = nextAnchor.offsetHeight
    const deltaPx = nextHeightPx - previousHeightPx
    if (Math.abs(deltaPx) <= heightTolerancePx) continue

    deltaAboveAnchorPx += deltaPx
    changedMessages.push({
      utteranceId,
      previousHeightPx,
      nextHeightPx,
      deltaPx,
    })
  }

  return {
    anchorUtteranceId,
    deltaAboveAnchorPx,
    changedMessages,
  }
}

export interface ResolveLateMessageHeightChangeAnchorScrollTopInput {
  viewportAnchor: ScrollViewportAnchorSnapshot | null
  nextAnchors: readonly ScrollDateLabelAnchor[]
  currentScrollTop: number
  deltaAboveAnchorPx: number
  maxScrollTop?: number
  heightTolerancePx?: number
}

export function resolveLateMessageHeightChangeAnchorScrollTop(
  input: ResolveLateMessageHeightChangeAnchorScrollTopInput,
): number | null {
  const anchorUtteranceId = input.viewportAnchor?.utteranceId
  if (!anchorUtteranceId || !input.viewportAnchor) return null

  const heightTolerancePx = typeof input.heightTolerancePx === 'number' && Number.isFinite(input.heightTolerancePx)
    ? Math.max(0, input.heightTolerancePx)
    : 1
  if (!Number.isFinite(input.deltaAboveAnchorPx) || Math.abs(input.deltaAboveAnchorPx) <= heightTolerancePx) {
    return null
  }

  const nextAnchor = input.nextAnchors.find((anchor) => anchor.utteranceId === anchorUtteranceId)
  if (!nextAnchor || !Number.isFinite(nextAnchor.offsetTop) || !Number.isFinite(input.viewportAnchor.topOffsetPx)) {
    return null
  }

  const currentScrollTop = Number.isFinite(input.currentScrollTop)
    ? Math.max(0, input.currentScrollTop)
    : 0
  const targetScrollTop = nextAnchor.offsetTop - input.viewportAnchor.topOffsetPx
  if (!Number.isFinite(targetScrollTop)) return null

  const maxScrollTop = typeof input.maxScrollTop === 'number' && Number.isFinite(input.maxScrollTop)
    ? Math.max(0, input.maxScrollTop)
    : null
  const boundedScrollTop = Math.max(0, targetScrollTop)
  const adjustedScrollTop = maxScrollTop === null
    ? boundedScrollTop
    : Math.min(maxScrollTop, boundedScrollTop)

  return Math.abs(adjustedScrollTop - currentScrollTop) > heightTolerancePx
    ? adjustedScrollTop
    : null
}

export function shouldUpdateScrollDateLabelState(
  currentDateLabel: string,
  nextDateLabel: string,
): boolean {
  return currentDateLabel !== nextDateLabel
}

export interface ResolveTopVisibleScrollDateLabelAnchorInput {
  anchors: readonly ScrollDateLabelAnchor[]
  scrollTop: number
  topTolerancePx?: number
}

export function resolveTopVisibleScrollDateLabelAnchor(
  input: ResolveTopVisibleScrollDateLabelAnchorInput,
): ScrollDateLabelAnchor | null {
  if (input.anchors.length === 0) return null

  const topTolerancePx = input.topTolerancePx ?? 1
  const safeScrollTop = Number.isFinite(input.scrollTop)
    ? Math.max(0, input.scrollTop)
    : 0
  const topEdgePx = safeScrollTop + topTolerancePx

  let low = 0
  let high = input.anchors.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    const anchor = input.anchors[mid]
    const anchorBottomPx = anchor.offsetTop + anchor.offsetHeight

    if (!Number.isFinite(anchorBottomPx) || anchorBottomPx <= topEdgePx) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  for (let index = low; index < input.anchors.length; index += 1) {
    const anchor = input.anchors[index]
    if (
      Number.isFinite(anchor.createdAtMs)
      && anchor.createdAtMs > 0
      && Number.isFinite(anchor.offsetTop)
      && Number.isFinite(anchor.offsetHeight)
    ) {
      return anchor
    }
  }

  return null
}

export function resolveScrollViewportAnchorSnapshot(
  input: ResolveScrollViewportAnchorSnapshotInput,
): ScrollViewportAnchorSnapshot | null {
  const anchor = resolveTopVisibleScrollDateLabelAnchor(input)
  if (!anchor?.utteranceId) return null

  const safeScrollTop = Number.isFinite(input.scrollTop)
    ? Math.max(0, input.scrollTop)
    : 0
  const topOffsetPx = anchor.offsetTop - safeScrollTop
  if (!Number.isFinite(topOffsetPx)) return null

  return {
    utteranceId: anchor.utteranceId,
    topOffsetPx,
  }
}
