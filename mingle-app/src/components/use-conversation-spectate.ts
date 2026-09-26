'use client'

import { useEffect, useRef, useState } from 'react'
import { buildClientApiPath } from '@/lib/api-contract'
import type { PublicSpectateInviter } from '@/lib/conversation-share-public-payload'
import type { Utterance } from '@/components/LivePhoneDemo/ChatBubble'

export type ConversationSpectateState = {
  roomTitle: string
  // Who shared the room, as the already-public profile card the API returns.
  // Deliberately not their account id: this payload is readable by anyone
  // holding the link (see lib/conversation-share-public-payload).
  inviter: PublicSpectateInviter | null
  utterances: Utterance[]
}

export type ConversationSpectateStatus = 'loading' | 'ready' | 'not_found'

type SpectateRequestState = {
  shareToken: string | null
  status: ConversationSpectateStatus
  state: ConversationSpectateState | null
}

type SpectateHydrationResponse = {
  conversation?: { title?: string }
  utterances?: Array<Record<string, unknown>>
  sharedBy?: Record<string, unknown> | null
}

function toInviter(raw: unknown): PublicSpectateInviter | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  return {
    name: typeof record.name === 'string' ? record.name : null,
    image: typeof record.image === 'string' ? record.image : null,
    imageCropScale: typeof record.imageCropScale === 'number' ? record.imageCropScale : null,
    imageCropX: typeof record.imageCropX === 'number' ? record.imageCropX : null,
    imageCropY: typeof record.imageCropY === 'number' ? record.imageCropY : null,
  }
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
    // ChatBubble keys "is this an identified room member" off speakerUserId.
    // The public payload has no account ids, so the opaque per-response alias
    // ('s1', 's2', …) takes that slot: it satisfies every use the spectate
    // surfaces make of the field (identified-member layout, name + photo,
    // memo comparison) and matches no real account, so the viewer-is-sender
    // branch simply never fires here.
    speakerUserId: typeof raw.speakerAlias === 'string' ? raw.speakerAlias : null,
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
  const [result, setResult] = useState<SpectateRequestState>({
    shareToken,
    status: initialState ? 'ready' : initialNotFound ? 'not_found' : 'loading',
    state: initialState ?? null,
  })
  const skipInitialFetchRef = useRef(initialState != null || initialNotFound === true)

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false
      return
    }

    // Each link owns its own cancellation state. A previous request cannot
    // become live again when the next link starts loading.
    let cancelled = false
    const controller = new AbortController()
    const load = async (token: string) => {
      try {
        const response = await fetch(
          buildClientApiPath(`/conversations/shared/${encodeURIComponent(token)}` as `/${string}`),
          { cache: 'no-store', signal: controller.signal },
        )
        if (cancelled) return
        if (!response.ok) {
          setResult({ shareToken: token, status: 'not_found', state: null })
          return
        }

        const payload = await response.json() as SpectateHydrationResponse
        if (cancelled) return
        const utterances = (payload.utterances ?? [])
          .map(toUtterance)
          .filter((utterance): utterance is Utterance => utterance !== null)
        setResult({
          shareToken: token,
          status: 'ready',
          state: {
            roomTitle: payload.conversation?.title?.trim() || '',
            inviter: toInviter(payload.sharedBy),
            utterances,
          },
        })
      } catch {
        if (!cancelled) setResult({ shareToken: token, status: 'not_found', state: null })
      }
    }

    // Defer state updates past the effect body for react-hooks/set-state-in-effect.
    const schedule = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => { void Promise.resolve().then(callback) }

    schedule(() => {
      if (cancelled) return
      if (!shareToken) {
        setResult({ shareToken: null, status: 'loading', state: null })
        return
      }
      setResult({ shareToken, status: 'loading', state: null })
      void load(shareToken)
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [shareToken])

  // Hide the previous room during the render before the new effect starts.
  return result.shareToken === shareToken
    ? { status: result.status, state: result.state }
    : { status: 'loading' as const, state: null }
}
