'use client'

// A room's Hash Rush game around the game itself, the same way as a voice
// talk (VoiceTalkPanel): a game that someone else started is offered once in a
// card low on the screen (Decline / Join), and its room message keeps a Join
// button while it runs. One game per room: the menu's Hash Rush page joins the
// running one instead of starting another.
//
// The app server knows a game runs while its players say so every 15 s
// (src/server/hash-rush/room-game.ts).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Gamepad2 } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { parseHashRushRoomGame, type HashRushRoomGame } from '@/lib/hash-rush-message'
import { useNativeBannerSuppression } from '@/lib/use-native-banner-suppression'
import { hashRushInviteCopy } from '@/features/hash-rush/invite-copy'

export const HASH_RUSH_ROOM_POLL_MS = 5_000
export const HASH_RUSH_CLIENT_HEARTBEAT_MS = 15_000

function gamePath(conversationId: string, suffix = ''): `/${string}` {
  return `/conversations/${encodeURIComponent(conversationId)}/hash-rush${suffix}` as `/${string}`
}

export async function fetchHashRushRoomGame(conversationId: string): Promise<HashRushRoomGame | null> {
  const response = await fetch(buildClientApiPath(gamePath(conversationId)), { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error(`hash_rush_game_${response.status}`)
  const body = await response.json().catch(() => null) as { game?: unknown } | null
  return parseHashRushRoomGame(body?.game)
}

/** Joins the room's game (starting one when none runs); `sessionId` keeps this phone in its game. */
export async function postHashRushRoomJoin(conversationId: string, sessionId?: string | null): Promise<HashRushRoomGame | null> {
  const response = await fetch(buildClientApiPath(gamePath(conversationId, '/join')), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  })
  if (!response.ok) throw new Error(`hash_rush_join_${response.status}`)
  const body = await response.json().catch(() => null) as { game?: unknown } | null
  return parseHashRushRoomGame(body?.game)
}

/**
 * The room's running game, kept fresh while the room is open: read every few
 * seconds and at once when a new announcement arrives. While this phone plays,
 * it tells the server so every 15 s (and stays in its own game).
 */
export function useHashRushRoomGame(input: {
  conversationId: string | null
  enabled: boolean
  playing: boolean
  /** The newest announcement in the room: a new one reads the game at once. */
  latestAnnouncedSessionId: string | null
}) {
  const { conversationId, enabled, playing, latestAnnouncedSessionId } = input
  // Kept with the room it is about: another room starts from nothing.
  const [known, setKnown] = useState<{ conversationId: string | null, game: HashRushRoomGame | null }>({ conversationId: null, game: null })
  const game = known.conversationId === conversationId ? known.game : null
  const setGame = useCallback((next: HashRushRoomGame | null) => setKnown({ conversationId, game: next }), [conversationId])
  const gameRef = useRef<HashRushRoomGame | null>(null)
  useEffect(() => { gameRef.current = game }, [game])

  const refresh = useCallback(async () => {
    if (!conversationId || !enabled) return
    try {
      setGame(await fetchHashRushRoomGame(conversationId))
    } catch {
      // Keep what was known; the next read tries again.
    }
  }, [conversationId, enabled, setGame])

  useEffect(() => {
    if (!conversationId || !enabled) return
    const first = setTimeout(() => { void refresh() }, 0)
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void refresh()
    }, HASH_RUSH_ROOM_POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [conversationId, enabled, refresh, latestAnnouncedSessionId])

  useEffect(() => {
    if (!conversationId || !enabled || !playing) return
    const beat = () => {
      postHashRushRoomJoin(conversationId, gameRef.current?.sessionId ?? null)
        .then((next) => { if (next) setGame(next) })
        .catch(() => undefined)
    }
    const timer = setInterval(beat, HASH_RUSH_CLIENT_HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [conversationId, enabled, playing, setGame])

  /** Joins (or starts) the game; resolves with it, or null when the server could not say. */
  const join = useCallback(async (): Promise<HashRushRoomGame | null> => {
    if (!conversationId) return null
    try {
      const next = await postHashRushRoomJoin(conversationId, null)
      if (next) setGame(next)
      return next
    } catch {
      return null
    }
  }, [conversationId, setGame])

  return { game, join, refresh }
}

/** The invite card, low on the screen where the thumb is: someone else's game, once. */
export function HashRushRoomPrompts(props: {
  uiLocale: string
  /** Someone else's game to offer in a card, or null. */
  invite: HashRushRoomGame | null
  onConfirm: () => void
  onDecline: () => void
}) {
  const copy = hashRushInviteCopy(props.uiLocale)
  useNativeBannerSuppression(props.invite !== null)

  if (!props.invite || typeof document === 'undefined') return null
  const starterName = (props.invite.startedBy?.name ?? '').trim()
  const title = starterName ? copy.startedBy(starterName) : copy.startedBySomeone
  // On the page itself, not inside the room screen: the room slides in
  // (a transform), and iOS WebKit draws a fixed card inside a transformed
  // layer but can miss its taps (the buttons did nothing on an iPhone 11).
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-[1000] flex justify-center px-5"
      data-qa="hash-rush-incoming"
    >
      <div
        role="dialog"
        aria-label={title}
        className="pointer-events-auto w-full max-w-[340px] rounded-2xl border border-emerald-100 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-40" />
            <Gamepad2 size={18} strokeWidth={2.3} className="relative" />
          </span>
          <p className="min-w-0 flex-1 text-[0.95rem] font-semibold leading-snug text-gray-900">{title}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            data-qa="hash-rush-incoming-decline"
            onClick={props.onDecline}
            className="h-12 touch-manipulation rounded-xl bg-gray-100 text-[0.95rem] font-semibold text-gray-700 active:bg-gray-200"
          >
            {copy.decline}
          </button>
          <button
            type="button"
            data-qa="hash-rush-incoming-join"
            onClick={props.onConfirm}
            className="h-12 touch-manipulation rounded-xl bg-emerald-500 text-[0.95rem] font-semibold text-white active:bg-emerald-600"
          >
            {copy.join}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
