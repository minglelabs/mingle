'use client'

import { useEffect, useRef } from 'react'
import { REALTIME_FALLBACK_POLL_INTERVAL_MS, shouldRunRealtimeFallbackRefresh } from '@/lib/realtime-fallback-poll'
import { resolveAdminInboxWsUrl, withRealtimeToken } from '../_lib/inbox-realtime'

export const ADMIN_INBOX_REALTIME_TOKEN_PATH = '/admin/inbox/api/realtime-token'
const RECONNECT_DELAY_MS = 5_000
// A burst of messages (the admin key hears every operator room) becomes one refetch.
const EVENT_COALESCE_MS = 400

/**
 * Keeps an admin inbox screen fresh, like the app's conversation list
 * (conversation-list.tsx): a socket on the admin inbox key refetches on each
 * event, and a 20 s poll covers a socket that is down or silent. The token
 * route may not exist yet (404): then only the poll runs. Also refreshes when
 * the page becomes visible again.
 */
export function useAdminInboxRealtime(refresh: () => Promise<unknown>): void {
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let coalesceTimer: number | null = null
    let lastRealtimeActivityAt = Date.now()

    const runRefresh = () => {
      void refreshRef.current().then(() => {
        lastRealtimeActivityAt = Date.now()
      }, () => {
        // Keep the current snapshot; the next event or poll retries.
      })
    }
    const scheduleEventRefresh = () => {
      if (coalesceTimer !== null) return
      coalesceTimer = window.setTimeout(() => {
        coalesceTimer = null
        if (!cancelled) runRefresh()
      }, EVENT_COALESCE_MS)
    }
    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) return
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        void openSocket()
      }, RECONNECT_DELAY_MS)
    }
    const openSocket = async () => {
      if (cancelled) return
      try {
        const response = await fetch(ADMIN_INBOX_REALTIME_TOKEN_PATH, { cache: 'no-store', credentials: 'same-origin' })
        if (cancelled) return
        if (!response.ok) {
          // 404: no realtime route in this build; 401: logged out. The poll stays on.
          if (response.status >= 500) scheduleReconnect()
          return
        }
        const payload = await response.json() as { token?: unknown; wsUrl?: unknown }
        const wsUrl = resolveAdminInboxWsUrl(payload.wsUrl, window.location)
        if (cancelled || typeof payload.token !== 'string' || !payload.token || !wsUrl) return
        socket = new WebSocket(withRealtimeToken(wsUrl, payload.token))
        socket.onopen = () => {
          lastRealtimeActivityAt = Date.now()
        }
        socket.onmessage = () => {
          lastRealtimeActivityAt = Date.now()
          scheduleEventRefresh()
        }
        socket.onclose = () => {
          if (cancelled) return
          socket = null
          scheduleReconnect()
        }
      } catch {
        scheduleReconnect()
      }
    }

    void openSocket()
    const pollTimer = window.setInterval(() => {
      if (!shouldRunRealtimeFallbackRefresh({
        isDocumentVisible: document.visibilityState === 'visible',
        socketReadyState: socket?.readyState,
        lastRealtimeActivityAt,
        now: Date.now(),
      })) return
      runRefresh()
    }, REALTIME_FALLBACK_POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') runRefresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(pollTimer)
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      if (coalesceTimer !== null) window.clearTimeout(coalesceTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (socket) {
        socket.onclose = null
        socket.close()
      }
    }
  }, [])
}
