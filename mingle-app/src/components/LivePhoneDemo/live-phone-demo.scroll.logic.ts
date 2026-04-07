export const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 400
export const AUTO_SCROLL_MIN_INTERVAL_MS = 1000

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
