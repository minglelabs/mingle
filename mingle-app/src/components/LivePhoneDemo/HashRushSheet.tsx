'use client'

// Hash Rush inside the chat room. The game runs on the Hash Rush game server
// (one game room per chat room); this sheet slides up over the chat with the
// game page in an iframe. The app gives an entry ticket, so only room members
// get in, under their chat name. A voice talk that is on keeps going while the
// game is open. The plain rules (messages, tickets, words) are in
// HashRushSheet.logic.ts; the requirements are docs/hash-rush-in-app-uiux.md.
//
// - The sheet covers everything below the status bar. Only its top row drags
//   it down; swipes on the game belong to the game, so the room's edge swipe,
//   the iOS swipe-back and Android back (which closes the sheet first) never
//   take them.
// - Lowered, the sheet keeps the game running out of sight (the game hears
//   `visibility: false` and goes quiet). It is dropped when the room is left;
//   the room's owner unmounts it then.
// - While it is up, the ad banner and the app's toasts stay hidden.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useDragControls, type PanInfo } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import { registerNativeEdgeSwipeSuppression } from '@/components/slide-surface'
import { buildClientApiPath } from '@/lib/api-contract'
import { registerNativeBackHandler } from '@/lib/native-back-handler'
import { useNativeBannerSuppression } from '@/lib/use-native-banner-suppression'
import {
  buildHashRushUrl,
  hashRushCopy,
  hashRushGameOrigin,
  hashRushVisibilityMessage,
  hashRushVoiceMessage,
  isHashRushTicketReusable,
  parseHashRushTicketResponse,
  readHashRushGameMessage,
  resolveHashRushKeyboardInsetPx,
  type HashRushAppMessage,
  type HashRushTicketGrant,
} from './HashRushSheet.logic'

const GAME_URL = (process.env.NEXT_PUBLIC_HASH_RUSH_URL || '').trim()
const GAME_SERVER = (process.env.NEXT_PUBLIC_HASH_RUSH_SERVER || '').trim()
const GAME_ORIGIN = hashRushGameOrigin(GAME_URL)

// Android back closes the sheet before the room's own layers (composer and
// menus at 10, the room at 4-5) and after screens opened over the room (20+).
const NATIVE_BACK_PRIORITY = 15
// The game page says `ready` once it is up. Without it by then, the page did
// not come up (no network, game host down); the sheet offers to try again.
const READY_TIMEOUT_MS = 20_000
const CLOSE_DRAG_OFFSET_PX = 120
const CLOSE_DRAG_VELOCITY_PX_PER_S = 600

export function isHashRushConfigured(): boolean {
  return !!GAME_ORIGIN && !!GAME_SERVER
}

export function hashRushMenuLabel(locale: string): string {
  return hashRushCopy(locale).menuLabel
}

// Tickets by viewer and room for this page's life, so opening the game again in
// a room reuses a ticket that is still good instead of asking for a new one.
const ticketCache = new Map<string, HashRushTicketGrant>()

// App toasts are portaled above every app layer; the global stylesheet hides
// them while this flag is on, so nothing floats over the game.
let toastHoldCount = 0
function holdToastsHidden(): () => void {
  toastHoldCount += 1
  document.documentElement.dataset.hashRushOpen = 'true'
  let released = false
  return () => {
    if (released) return
    released = true
    toastHoldCount = Math.max(0, toastHoldCount - 1)
    if (toastHoldCount === 0) delete document.documentElement.dataset.hashRushOpen
  }
}

type Launch = { grant: HashRushTicketGrant, src: string, attempt: number }

function launchFor(grant: HashRushTicketGrant, attempt: number, who: { playerName: string, uiLocale: string }): Launch {
  return {
    grant,
    attempt,
    src: buildHashRushUrl({
      gameUrl: GAME_URL,
      server: GAME_SERVER,
      room: grant.room,
      ticket: grant.ticket,
      name: grant.name || who.playerName,
      lang: (who.uiLocale || 'en').split('-')[0],
    }),
  }
}

type Props = {
  /** Up over the chat. Lowered, the game keeps running out of sight. */
  open: boolean
  conversationId: string
  /** Who is playing; tickets are kept per viewer and room. */
  viewerKey: string
  playerName: string
  uiLocale: string
  /** This room's voice talk is connected; the game then holds its music. */
  voiceActive: boolean
  onClose: () => void
}

export default function HashRushSheet({ open, conversationId, viewerKey, playerName, uiLocale, voiceActive, onClose }: Props) {
  const copy = hashRushCopy(uiLocale)
  const cacheKey = `${viewerKey}|${conversationId}`
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const dragControls = useDragControls()
  const whoRef = useRef({ playerName, uiLocale })
  const stateRef = useRef({ open, voiceActive })
  const [launch, setLaunch] = useState<Launch | null>(() => {
    const cached = ticketCache.get(cacheKey)
    return isHashRushTicketReusable(cached, Date.now()) ? launchFor(cached, 0, { playerName, uiLocale }) : null
  })
  const [ticketAttempt, setTicketAttempt] = useState(0)
  const [ticketFailed, setTicketFailed] = useState(false)
  const [frameReady, setFrameReady] = useState(false)
  const [frameTimedOut, setFrameTimedOut] = useState(false)
  const [gameKeyboardOpen, setGameKeyboardOpen] = useState(false)
  const [keyboardInsetPx, setKeyboardInsetPx] = useState(0)

  useEffect(() => {
    whoRef.current = { playerName, uiLocale }
  }, [playerName, uiLocale])

  useEffect(() => {
    stateRef.current = { open, voiceActive }
  }, [open, voiceActive])

  // ---- Ticket: reuse a good one, otherwise ask the app server ----
  const needsTicket = launch === null
  useEffect(() => {
    if (!needsTicket || !isHashRushConfigured()) return
    let cancelled = false
    fetch(buildClientApiPath(`/conversations/${encodeURIComponent(conversationId)}/hash-rush/ticket` as `/${string}`), {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`ticket_${response.status}`)
        const grant = parseHashRushTicketResponse(await response.json(), Date.now())
        if (!grant) throw new Error('ticket_missing')
        if (cancelled) return
        ticketCache.set(cacheKey, grant)
        setLaunch(launchFor(grant, 0, whoRef.current))
      })
      .catch(() => {
        if (!cancelled) setTicketFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey, conversationId, needsTicket, ticketAttempt])

  // ---- Game page: wait for `ready`, then keep it told how things stand ----
  useEffect(() => {
    if (!launch) return
    const timer = window.setTimeout(() => setFrameTimedOut(true), READY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [launch])

  const postToGame = useCallback((message: HashRushAppMessage) => {
    const target = frameRef.current?.contentWindow
    if (!target || !GAME_ORIGIN) return
    try {
      target.postMessage(message, GAME_ORIGIN)
    } catch {
      // The page is gone or elsewhere; the next load or `ready` tells it again.
    }
  }, [])

  // On load and on `ready`: the game follows the last values it heard.
  const syncGame = useCallback(() => {
    postToGame(hashRushVisibilityMessage(stateRef.current.open))
    postToGame(hashRushVoiceMessage(stateRef.current.voiceActive))
  }, [postToGame])

  useEffect(() => {
    postToGame(hashRushVisibilityMessage(open))
  }, [open, postToGame])

  useEffect(() => {
    postToGame(hashRushVoiceMessage(voiceActive))
  }, [voiceActive, postToGame])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = readHashRushGameMessage(event, { frame: frameRef.current?.contentWindow ?? null, origin: GAME_ORIGIN })
      if (!message) return
      if (message.type === 'ready') {
        setFrameReady(true)
        syncGame()
      } else if (message.type === 'keyboard') {
        setGameKeyboardOpen(message.open)
        if (!message.open) setKeyboardInsetPx(0)
      }
      // 'phase' is only on record for now; nothing in the app follows it yet.
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [syncGame])

  const retry = useCallback(() => {
    setFrameReady(false)
    setFrameTimedOut(false)
    setGameKeyboardOpen(false)
    setKeyboardInsetPx(0)
    setTicketFailed(false)
    if (launch && isHashRushTicketReusable(launch.grant, Date.now())) {
      // The ticket is fine; load the page again with it.
      setLaunch(launchFor(launch.grant, launch.attempt + 1, whoRef.current))
      return
    }
    ticketCache.delete(cacheKey)
    setLaunch(null)
    setTicketAttempt((attempt) => attempt + 1)
  }, [cacheKey, launch])

  // ---- While the sheet is up ----
  useNativeBannerSuppression(open)

  useEffect(() => {
    if (!open) return
    return registerNativeEdgeSwipeSuppression()
  }, [open])

  useEffect(() => {
    if (!open) return
    return registerNativeBackHandler(() => {
      onClose()
      return true
    }, NATIVE_BACK_PRIORITY)
  }, [onClose, open])

  useEffect(() => {
    if (!open) return
    return holdToastsHidden()
  }, [open])

  // The game's keyboard never moves the sheet: hold the page at the top if the
  // WebView tries to pan it to the focused box.
  useEffect(() => {
    if (!open) return
    const pin = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
    }
    pin()
    window.addEventListener('scroll', pin, { passive: true })
    return () => window.removeEventListener('scroll', pin)
  }, [open])

  // While the game's keyboard is up, its area ends where the keyboard begins
  // (see resolveHashRushKeyboardInsetPx); the sheet keeps its place and size.
  const keyboardCutActive = open && gameKeyboardOpen
  useEffect(() => {
    if (!keyboardCutActive) return
    const viewport = window.visualViewport
    const sheet = sheetRef.current
    if (!viewport || !sheet) return
    let frameId = 0
    const measure = () => {
      frameId = 0
      const rect = sheet.getBoundingClientRect()
      const next = resolveHashRushKeyboardInsetPx({
        sheetBottomPx: rect.bottom,
        sheetRenderedHeightPx: rect.height,
        sheetLayoutHeightPx: sheet.offsetHeight,
        visibleBottomPx: viewport.offsetTop + viewport.height,
      })
      setKeyboardInsetPx((current) => (Math.abs(current - next) < 2 ? current : next))
    }
    const schedule = () => {
      if (!frameId) frameId = window.requestAnimationFrame(measure)
    }
    schedule()
    viewport.addEventListener('resize', schedule)
    viewport.addEventListener('scroll', schedule)
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      viewport.removeEventListener('resize', schedule)
      viewport.removeEventListener('scroll', schedule)
    }
  }, [keyboardCutActive])

  // Lowering the sheet puts the game's keyboard away with it.
  useEffect(() => {
    if (open) return
    const frame = frameRef.current
    if (frame && document.activeElement === frame) frame.blur()
  }, [open])

  const onDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.y > CLOSE_DRAG_OFFSET_PX || info.velocity.y > CLOSE_DRAG_VELOCITY_PX_PER_S) onClose()
  }, [onClose])

  const failure = ticketFailed
    ? copy.ticketFailed
    : launch && frameTimedOut && !frameReady ? copy.connectFailed : null
  const loading = !failure && !frameReady

  return (
    <motion.div
      ref={sheetRef}
      initial={{ y: '100%' }}
      animate={{ y: open ? 0 : '100%' }}
      transition={{ type: 'spring', stiffness: 360, damping: 38 }}
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 1 }}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      // Touches on the sheet are the sheet's: the room's left-edge swipe (an
      // ancestor) must not start from here.
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      className={`absolute inset-x-0 bottom-0 z-[90] flex flex-col overflow-hidden rounded-t-2xl bg-white ${
        open ? 'shadow-[0_-12px_32px_rgba(15,23,42,0.18)]' : ''
      }`}
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
      role="dialog"
      aria-modal={open ? true : undefined}
      aria-label={copy.title}
      aria-hidden={!open}
      inert={!open}
      data-qa="hash-rush-sheet"
    >
      <div
        onPointerDown={(event) => dragControls.start(event)}
        className="relative flex h-11 shrink-0 cursor-grab touch-none select-none items-center gap-2 px-4 pt-1.5"
        data-qa="hash-rush-sheet-header"
      >
        <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-gray-200" />
        <span className="min-w-0 truncate text-[0.92rem] font-semibold text-gray-900">{copy.title}</span>
        {voiceActive ? (
          <span
            role="img"
            aria-label={copy.voiceOn}
            title={copy.voiceOn}
            className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
            data-qa="hash-rush-voice-dot"
          />
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          aria-label={copy.backToChat}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 bg-[#cfe9a8]">
        {launch ? (
          <div className="absolute inset-x-0 top-0" style={{ bottom: keyboardCutActive ? keyboardInsetPx : 0 }}>
            <iframe
              key={launch.attempt}
              ref={frameRef}
              src={launch.src}
              title="Hash Rush"
              className="block h-full w-full border-0"
              allow="autoplay; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-popups"
              onLoad={syncGame}
            />
          </div>
        ) : null}
        {failure || loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#cfe9a8] px-8 text-center">
            {failure ? (
              <>
                <p className="text-[0.92rem] font-medium leading-snug text-gray-800" data-qa="hash-rush-failure">{failure}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-full bg-white px-4 py-2 text-[0.88rem] font-semibold text-gray-900 shadow-sm active:bg-gray-50"
                  data-qa="hash-rush-retry"
                >
                  {copy.retry}
                </button>
              </>
            ) : (
              <Loader2 size={22} className="animate-spin text-gray-600" aria-label={copy.opening} />
            )}
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
