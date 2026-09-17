'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildClientApiPath } from '@/lib/api-contract'
import type { Utterance } from '@/components/LivePhoneDemo/ChatBubble'

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

// A share link is a fixed snapshot (messages up to the share's sharedAt
// cutoff — see getConversationHydrationStateForShare), not a live feed, so
// this is a single fetch on mount with no poll/websocket loop: the content
// genuinely doesn't change until whoever shared it presses "refresh" again,
// which mints a fresh sharedAt the next page load will pick up on its own.
// A 404 here is authoritative (the endpoint only ever returns 200 or 404):
// it means the link never existed or the room was deleted.
//
// initialState comes from the page's own server-side render (see
// conversation-spectate-screen.tsx), which already ran this exact fetch to
// build the invite banner. Without it, the message list sits behind a
// second, redundant client round trip after first paint; with it, messages
// render immediately and the mount effect below just no-ops once.
//
// initialNotFound is the same idea for the opposite outcome: the server
// already knows the token doesn't resolve to a shared conversation, so the
// "no longer shared" card can render on the very first paint instead of
// flashing the normal chat card while the client re-fetches to learn the
// same thing.
export function useConversationSpectate(
  shareToken: string | null,
  initialState?: ConversationSpectateState | null,
  initialNotFound?: boolean,
) {
  const [status, setStatus] = useState<ConversationSpectateStatus>(
    initialState ? 'ready' : initialNotFound ? 'not_found' : 'loading',
  )
  const [state, setState] = useState<ConversationSpectateState | null>(initialState ?? null)
  const cancelledRef = useRef(false)
  const skipInitialFetchRef = useRef(initialState != null || initialNotFound === true)

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
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false
      return
    }

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

  return { status, state }
}
