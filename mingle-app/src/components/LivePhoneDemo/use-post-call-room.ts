'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildClientApiPath } from '@/lib/api-contract'
import { isPostCallOver, parsePostCallView, postCallSecondsLeft, type PostCallView } from '@/lib/post-call'

/** How often the call is read: often while it rings, less while the two talk. */
const RING_POLL_MS = 1_500
const TALK_POLL_MS = 4_000

/**
 * The 1:1 voice talk this hidden room was made for (owner, 2026-11-25; see
 * src/server/post-calls.ts), as the call screen needs it: read from the
 * server until it is over, with the ring's seconds counted down here.
 */
export function usePostCallRoom(conversationId: string, enabled: boolean): {
  call: PostCallView | null
  /** The first answer came (a room with no call reads as null). */
  loaded: boolean
  secondsLeft: number
  busy: boolean
  act: (action: 'accept' | 'hangup') => Promise<PostCallView | null>
} {
  const [state, setState] = useState<{ conversationId: string; call: PostCallView | null; loaded: boolean }>({ conversationId, call: null, loaded: false })
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const current = state.conversationId === conversationId ? state : { conversationId, call: null, loaded: false }
  const call = current.call
  const status = call?.status ?? null
  const over = status !== null && isPostCallOver(status)

  useEffect(() => {
    if (!enabled || !conversationId || over) return
    let cancelled = false
    const read = () => {
      void fetch(buildClientApiPath(`/post-calls?conversationId=${encodeURIComponent(conversationId)}`), { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { call?: unknown } | null) => {
          if (cancelled || !body) return
          setState({ conversationId, call: parsePostCallView(body.call), loaded: true })
        })
        .catch(() => undefined)
    }
    read()
    const timer = window.setInterval(read, status === 'accepted' ? TALK_POLL_MS : RING_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [conversationId, enabled, over, status])

  // The ring's countdown.
  useEffect(() => {
    if (status !== 'ringing') return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [status])

  const callIdRef = useRef<string | null>(null)
  useEffect(() => { callIdRef.current = call?.id ?? null }, [call?.id])
  const act = useCallback(async (action: 'accept' | 'hangup') => {
    const callId = callIdRef.current
    if (!callId) return null
    setBusy(true)
    try {
      const response = await fetch(buildClientApiPath(`/post-calls/${encodeURIComponent(callId)}`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await response.json().catch(() => null) as { call?: unknown } | null
      const next = parsePostCallView(body?.call)
      if (next) setState({ conversationId, call: next, loaded: true })
      return next
    } catch {
      return null
    } finally {
      setBusy(false)
    }
  }, [conversationId])

  return {
    call,
    loaded: current.loaded,
    secondsLeft: call && status === 'ringing' ? postCallSecondsLeft(call.ringEndsAt, now) : 0,
    busy,
    act,
  }
}
