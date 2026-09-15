'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildClientApiPath } from '@/lib/api-contract'
import type { Utterance } from '@/components/LivePhoneDemo/ChatBubble'

// Duplicated from use-realtime-stt.ts's getConversationEventsWsUrl rather
// than imported — that file is a ~5000-line hook this public, potentially
// bot-crawled page has no other reason to pull into its bundle.
function getConversationEventsWsUrl(): string {
  const configured = process.env.NEXT_PUBLIC_MESSAGING_WS_URL?.trim()
  if (configured) {
    try {
      const url = new URL(configured)
      if (url.pathname === '/' || url.pathname === '') {
        url.pathname = '/conversation-events'
      }
      return url.toString()
    } catch {
      return ''
    }
  }

  const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '3001'
  const configuredWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim()
  try {
    if (configuredWsUrl) {
      return `${new URL(configuredWsUrl).origin}/conversation-events`
    }
    const wsPath = process.env.NEXT_PUBLIC_WS_PATH?.trim()
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const protocol = isSecure ? 'wss' : 'ws'
    if (wsPath) {
      const normalizedPath = wsPath.startsWith('/') ? wsPath : `/${wsPath}`
      const locationPort = typeof window !== 'undefined' ? window.location.port : ''
      const hostWithPort = locationPort ? `${host}:${locationPort}` : host
      return `${new URL(`${protocol}://${hostWithPort}${normalizedPath}`).origin}/conversation-events`
    }
    return `${protocol}://${host}:${wsPort}/conversation-events`
  } catch {
    return ''
  }
}

export type ConversationSpectateState = {
  roomTitle: string
  sharedByUserId: string | null
  utterances: Utterance[]
}

export type ConversationSpectateStatus = 'loading' | 'ready' | 'not_found'

type SpectateHydrationResponse = {
  conversation?: { title?: string }
  utterances?: Array<Record<string, unknown>>
  sharedByUserId?: string | null
}

function toUtterance(raw: Record<string, unknown>): Utterance | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  const originalText = typeof raw.originalText === 'string' ? raw.originalText : null
  if (!id || !originalText) return null

  return {
    id,
    originalText,
    originalLang: typeof raw.originalLang === 'string' ? raw.originalLang : 'unknown',
    translations: typeof raw.translations === 'object' && raw.translations !== null
      ? raw.translations as Record<string, string>
      : {},
    translationFinalized: typeof raw.translationFinalized === 'object' && raw.translationFinalized !== null
      ? raw.translationFinalized as Record<string, boolean>
      : undefined,
    targetLanguages: Array.isArray(raw.targetLanguages) ? raw.targetLanguages as string[] : undefined,
    createdAtMs: typeof raw.createdAtMs === 'number' ? raw.createdAtMs : undefined,
    speaker: typeof raw.speaker === 'string' ? raw.speaker : undefined,
    speakerAvatarSeed: typeof raw.speakerAvatarSeed === 'string' ? raw.speakerAvatarSeed : undefined,
    speakerAvatarIndex: typeof raw.speakerAvatarIndex === 'number' ? raw.speakerAvatarIndex : undefined,
    speakerName: typeof raw.speakerName === 'string' ? raw.speakerName : null,
    speakerUserId: typeof raw.speakerUserId === 'string' ? raw.speakerUserId : null,
    speakerImage: typeof raw.speakerImage === 'string' ? raw.speakerImage : null,
  }
}

// Read-only counterpart to use-realtime-stt.ts's mount-hydration + push
// + poll-fallback shape, but against the public share-token endpoints
// (conversation-share-controller.ts) instead of the member ones — no
// composer, no send, just refetch-on-signal. A 404 here is authoritative
// (the endpoint only ever returns 200 or 404): it means sharing was turned
// off or the link never existed, so it's reflected immediately even after
// the page was already showing a ready room. A network exception is not
// authoritative — it leaves an already-ready view alone rather than
// flashing "no longer shared" on a transient blip.
export function useConversationSpectate(shareToken: string | null) {
  const [status, setStatus] = useState<ConversationSpectateStatus>('loading')
  const [state, setState] = useState<ConversationSpectateState | null>(null)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!shareToken) return
    try {
      const response = await fetch(
        buildClientApiPath(`/conversations/shared/${encodeURIComponent(shareToken)}` as `/${string}`),
        { cache: 'no-store' },
      )
      if (cancelledRef.current) return

      if (!response.ok) {
        setStatus('not_found')
        return
      }

      const payload = await response.json() as SpectateHydrationResponse
      const utterances = (payload.utterances ?? [])
        .map(toUtterance)
        .filter((utterance): utterance is Utterance => utterance !== null)

      setState({
        roomTitle: payload.conversation?.title?.trim() || '',
        sharedByUserId: typeof payload.sharedByUserId === 'string' ? payload.sharedByUserId : null,
        utterances,
      })
      setStatus('ready')
    } catch {
      if (cancelledRef.current) return
      setStatus((previousStatus) => (previousStatus === 'ready' ? previousStatus : 'not_found'))
    }
  }, [shareToken])

  // Deferred via queueMicrotask, matching LivePhoneDemo.tsx's persisted-
  // preferences hydration effect, so this doesn't trip the
  // react-hooks/set-state-in-effect rule (refresh's setState calls happen
  // after its own await anyway, but the lint rule flags the direct call
  // shape regardless of that internal gating).
  useEffect(() => {
    cancelledRef.current = false
    const schedule = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => { void Promise.resolve().then(callback) }

    schedule(() => {
      if (cancelledRef.current) return
      refresh().finally(() => {})
    })

    return () => {
      cancelledRef.current = true
    }
  }, [refresh])

  useEffect(() => {
    if (typeof window === 'undefined' || !shareToken) return

    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const openSocket = async () => {
      if (cancelled) return
      try {
        const response = await fetch(
          buildClientApiPath(`/conversations/shared/${encodeURIComponent(shareToken)}/realtime-token` as `/${string}`),
          { cache: 'no-store' },
        )
        if (!response.ok || cancelled) return
        const payload = await response.json() as { token?: string | null }
        const token = payload.token
        const wsBase = getConversationEventsWsUrl()
        if (!token || !wsBase || cancelled) return

        socket = new WebSocket(`${wsBase}?token=${encodeURIComponent(token)}`)
        socket.onmessage = () => {
          void refresh()
        }
        socket.onclose = () => {
          if (cancelled) return
          clearReconnectTimer()
          reconnectTimer = window.setTimeout(openSocket, 5_000)
        }
      } catch {
        // Realtime push failed to set up — the poll fallback below still runs.
      }
    }

    void openSocket()

    const pollIntervalMs = 20_000
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refresh()
    }, pollIntervalMs)

    return () => {
      cancelled = true
      clearReconnectTimer()
      window.clearInterval(pollTimer)
      if (socket) {
        socket.onclose = null
        socket.close()
      }
    }
  }, [refresh, shareToken])

  return { status, state }
}
