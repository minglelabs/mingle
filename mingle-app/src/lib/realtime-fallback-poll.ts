export const REALTIME_FALLBACK_POLL_INTERVAL_MS = 20_000
export const REALTIME_SOCKET_WATCHDOG_IDLE_MS = 60_000
export const WEBSOCKET_OPEN_READY_STATE = 1

export function shouldRunRealtimeFallbackRefresh(input: {
  isDocumentVisible: boolean
  socketReadyState: number | null | undefined
  lastRealtimeActivityAt: number
  now: number
}): boolean {
  if (!input.isDocumentVisible) return false
  if (input.socketReadyState !== WEBSOCKET_OPEN_READY_STATE) return true

  return !Number.isFinite(input.lastRealtimeActivityAt)
    || input.now - input.lastRealtimeActivityAt >= REALTIME_SOCKET_WATCHDOG_IDLE_MS
}
