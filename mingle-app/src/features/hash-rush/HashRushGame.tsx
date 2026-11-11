'use client'

// Hash Rush, played in the chat room itself: the map, the HUD over it and the
// touch controls (the doughnut pad, swipes on the map, the bonk button and the
// throw button), and the keyboard on a computer. The game runs on the Hash
// Rush game server, one game room per chat room; this joins it with the room
// member's entry ticket. The game itself is client.ts on the copied engine
// (engine/README.md), loaded once this is on screen. This component lays out
// its DOM and shows what the client reports between rounds (HashRushCards.tsx):
// the lobby, the result, the title, and the score table over a round.
//
// The rules it keeps are hash-rush's docs/UIUX-ISSUES.md and this repo's
// docs/hash-rush-in-app-uiux.md: the game takes the whole screen; on a phone
// the map is as wide as it can be above the strip of touch controls, so they
// never lie over the burrow; the way back to the chat is a pill over the map's
// top left corner, over every card too; a hamster under a button dims it by
// half; a swipe of 32px or more steers one of 16 ways, a tap stops, and the
// pad stays held while the thumb stays down. The score table has a button of
// its own (and Tab held with a keyboard, #39, #182); a result card put away
// comes back with it (#42).
//
// The chat room's talk is part of the game (room-chat.ts): the room's own
// messages float over the map in the room's one-bubble look and go up over
// the speaker's hamster, and the 💬 button puts the room's own composer up
// over the game. While it is up the controls take nothing and the map keeps
// its size; a tap on the game puts it away again (#181, #183, #188).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, Loader2, LogOut } from 'lucide-react'
import styles from './hash-rush-game.module.css'
import { HASH_RUSH_SERVER } from './config'
import { hashRushGameCopy } from './copy'
import { hashRushInviteCopy } from './invite-copy'
import { resolveHashRushField, type HashRushFieldLayout } from './layout'
import {
  advanceHashRushChatFeed,
  floatLines,
  HASH_RUSH_CHAT_REPLAY_COUNT,
  liveLines,
  nextFloatChange,
  refloatLines,
  startHashRushChatFeed,
  type FloatingLine,
  type HashRushChatEntry,
  type HashRushChatFeed,
  type HashRushRoomChat,
} from './room-chat'
import { requestHashRushTicket } from './ticket'
import {
  HashRushBoard,
  HashRushLobbyCard,
  HashRushResultCard,
  HashRushTitleCard,
  useSecondsLeft,
  type HashRushScoreView,
} from './HashRushCards'
import type { HashRushArt, HashRushGameClient, HashRushGameClasses, HashRushGameElements, HashRushGameView } from './client'
import type { HashRushScoreboard } from './score'
import type { HashRushSetup } from './protocol'

// The same key the web game keeps the side in.
const BONK_SIDE_STORE = 'hash-rush-bonk-left'
// The table over a round follows the round as it goes.
const BOARD_REFRESH_MS = 400
// The conversation opened from a floating line folds back once left alone this long.
const TALK_BROWSE_IDLE_MS = 8000
// After the room's composer goes down, the page has this long to grow back
// from under the keyboard before the map is measured anew.
const CHAT_RESIZE_HOLD_MS = 600
// A touch on the conversation that moves less than this, and is let go sooner
// than a long press (which opens a bubble's own menu), is a tap.
const TALK_TAP_SLOP_PX = 10
const TALK_TAP_MAX_MS = 400

const landed = (entry: HashRushChatEntry) => !entry.pending && !!entry.text

const CLASSES: HashRushGameClasses = {
  chip: styles.chip,
  chipMe: styles.chipMe,
  chipCarry: styles.chipCarry,
  chipDot: styles.chipDot,
  scoresMany: styles.scoresMany,
  feedLine: styles.feedLine,
  calloutSuper: styles.calloutSuper,
  bannerShow: styles.bannerShow,
  bannerAlarm: styles.bannerAlarm,
  clockOvertime: styles.clockOvertime,
  pingSlow: styles.pingSlow,
  under: styles.under,
  off: styles.off,
  ended: styles.ended,
}

// One quarter of the pad: a slice of the doughnut with its arrow (hash-rush index.html).
const PAD_SLICE = 'M14.64 14.64A50 50 0 0 1 85.36 14.64L55.66 44.34A8 8 0 0 0 44.34 44.34Z'
const PAD_ARROW = 'M50 13L40 28H60Z'
const PAD_KEYS = [
  { className: styles.padUp, turn: 0 },
  { className: styles.padRight, turn: 90 },
  { className: styles.padDown, turn: 180 },
  { className: styles.padLeft, turn: 270 },
]

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

type Props = {
  conversationId: string
  /** Who is playing; entry tickets are kept per viewer and room. */
  viewerKey: string
  /** The chat name, for a ticket that carries none. */
  playerName: string
  uiLocale: string
  /** On screen. Out of sight the round goes on, silent, and this hamster stands still. */
  visible: boolean
  /** This room's voice talk is connected: the game holds its music, the back pill shows a green dot. */
  voiceActive: boolean
  /** The chat room's talk and composer (room-chat.ts); none, no talk in the game. */
  chat?: HashRushRoomChat
  /** Back to the chat: lowers the game. */
  onBack: () => void
  /** Quit: asks, then ends the game for this phone. */
  onQuit?: () => void
  /** How to play, from the lobby. */
  onHowTo?: () => void
}

/** Where the map is, kept only when it moved. */
function sameField(a: HashRushFieldLayout | null, b: HashRushFieldLayout | null) {
  return !!a && !!b && a.tall === b.tall && a.widthPx === b.widthPx && a.heightPx === b.heightPx && a.topPx === b.topPx
}

/** Which card a view is: the result or the title of round N, '' for none. */
const cardKeyOf = (view: HashRushGameView) => (view.kind === 'result' || view.kind === 'title' ? `${view.kind}:${view.round}` : '')

const typing = () => {
  const node = document.activeElement
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || (node instanceof HTMLElement && node.isContentEditable)
}

export default function HashRushGame({ conversationId, viewerKey, playerName, uiLocale, visible, voiceActive, chat, onBack, onQuit, onHowTo }: Props) {
  const copy = hashRushGameCopy(uiLocale)
  const inviteCopy = hashRushInviteCopy(uiLocale)
  const chatOpen = !!chat?.open
  const chatEntries = chat?.entries
  const stageRef = useRef<HTMLDivElement | null>(null)
  const arenaRef = useRef<HTMLDivElement | null>(null)
  const backRef = useRef<HTMLButtonElement | null>(null)
  const quitRef = useRef<HTMLButtonElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const padRef = useRef<HTMLDivElement | null>(null)
  const bonkRef = useRef<HTMLButtonElement | null>(null)
  const throwRef = useRef<HTMLButtonElement | null>(null)
  const scoresRef = useRef<HTMLDivElement | null>(null)
  const clockRef = useRef<HTMLDivElement | null>(null)
  const pingRef = useRef<HTMLDivElement | null>(null)
  const feedRef = useRef<HTMLDivElement | null>(null)
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const bigRef = useRef<HTMLDivElement | null>(null)
  const calloutRef = useRef<HTMLDivElement | null>(null)
  const watchingRef = useRef<HTMLDivElement | null>(null)
  const hintRef = useRef<HTMLDivElement | null>(null)
  const hintTouchRef = useRef<HTMLDivElement | null>(null)
  const toolsRef = useRef<HTMLDivElement | null>(null)
  const toolsMoreRef = useRef<HTMLButtonElement | null>(null)
  const scoreButtonRef = useRef<HTMLButtonElement | null>(null)
  const boardCardRef = useRef<HTMLDivElement | null>(null)
  const chatButtonRef = useRef<HTMLButtonElement | null>(null)
  const talkPanelRef = useRef<HTMLDivElement | null>(null)
  const clientRef = useRef<HashRushGameClient | null>(null)
  const latestRef = useRef({ viewerKey, playerName, uiLocale, visible, voiceActive, chatOpen, chatEntries, onCloseChat: chat?.onClose })
  // The screen's own shape: a tall one shows the map turned, with the touch
  // controls in a strip of their own under it.
  const [tall, setTall] = useState<boolean | null>(null)
  const [field, setField] = useState<HashRushFieldLayout | null>(null)
  // The arena's box in the stage, for what is placed by the map from outside it.
  const [arenaAt, setArenaAt] = useState({ left: 0, top: 0, width: 0 })
  const [view, setView] = useState<HashRushGameView>({ kind: 'connecting', again: false })
  const [art, setArt] = useState<HashRushArt | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [soundOff, setSoundOff] = useState(false)
  const [bonkLeft, setBonkLeft] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  // The score table over a round: which round it was opened in, and what it shows.
  const [boardRound, setBoardRound] = useState(-1)
  const [board, setBoard] = useState<HashRushScoreboard | null>(null)
  // This round or the running totals; the totals first (#182).
  const [scoreView, setScoreView] = useState<HashRushScoreView>('total')
  // The result or title card put away, by its key; a new card comes up again.
  const [hiddenCard, setHiddenCard] = useState('')
  // A new game client each time one loads: the room's talk is told to it afresh.
  const [clientEpoch, setClientEpoch] = useState(0)
  // The room's talk: what the game has heard of it, the lines floating over the
  // map (as of `floatAt`), and the conversation opened from them to read back.
  const chatFeedRef = useRef<HashRushChatFeed | null>(null)
  const [floating, setFloating] = useState<FloatingLine[]>([])
  const [floatAt, setFloatAt] = useState(0)
  const [browsing, setBrowsing] = useState(false)
  const browseTimerRef = useRef(0)
  const talkTapRef = useRef<{ id: number, x: number, y: number, top: number, at: number } | null>(null)
  const talkAtEndRef = useRef(true)
  // The page's height while the room's composer is up, and how long it is kept
  // once the composer is down: a smaller page in that time is the keyboard's.
  const heldSizeRef = useRef<{ height: number, until: number } | null>(null)
  const measureRef = useRef<(() => void) | null>(null)

  const cardKey = cardKeyOf(view)
  const cardHidden = !!cardKey && hiddenCard === cardKey
  const cardUp = !!cardKey && !cardHidden
  const boardShown = view.kind === 'round' && boardRound === view.round && !!board
  const nextSeconds = useSecondsLeft(view.kind === 'result' || view.kind === 'title' ? view.nextAt : 0)
  const viewRef = useRef(view)
  const cardHiddenRef = useRef(cardHidden)

  useEffect(() => {
    latestRef.current = { viewerKey, playerName, uiLocale, visible, voiceActive, chatOpen, chatEntries, onCloseChat: chat?.onClose }
  }, [viewerKey, playerName, uiLocale, visible, voiceActive, chatOpen, chatEntries, chat?.onClose])

  useEffect(() => {
    viewRef.current = view
    cardHiddenRef.current = cardHidden
  }, [view, cardHidden])

  // ---- Where the map goes: the whole width it can, at the top of the arena ----
  // The stage is the whole screen; the arena is what the stylesheet leaves of
  // it for the map (under the status bar, over a phone's controls).
  // While the room's composer is up the map keeps its place and size: a
  // keyboard only covers the foot of the screen, it never squeezes the game
  // (Android resizes the page for it). Once it is down the page grows back
  // first, so the map never shrinks for a moment either (#181, #187).
  useLayoutEffect(() => {
    const stage = stageRef.current
    const arena = arenaRef.current
    if (!stage || !arena) return
    const measure = () => {
      const held = heldSizeRef.current
      if (held) {
        const now = performance.now()
        if (stage.clientHeight < held.height - 1 && now < held.until) return
        if (now >= held.until) heldSizeRef.current = null
      }
      const shapeTall = stage.clientHeight > stage.clientWidth
      setTall(shapeTall)
      const next = resolveHashRushField(arena.clientWidth, arena.clientHeight, shapeTall)
      setField((current) => (sameField(current, next) ? current : next))
      const box = { left: arena.offsetLeft, top: arena.offsetTop, width: arena.clientWidth }
      setArenaAt((current) => (
        current.left === box.left && current.top === box.top && current.width === box.width ? current : box
      ))
    }
    measure()
    measureRef.current = measure
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => {
        measureRef.current = null
        window.removeEventListener('resize', measure)
      }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    observer.observe(arena)
    return () => {
      measureRef.current = null
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    clientRef.current?.resize()
  }, [field])

  // ---- The game: loaded once on screen, dropped with the room ----
  useEffect(() => {
    const parts = {
      stage: stageRef.current,
      canvas: canvasRef.current,
      pad: padRef.current,
      bonk: bonkRef.current,
      throwButton: throwRef.current,
      scores: scoresRef.current,
      clock: clockRef.current,
      ping: pingRef.current,
      feed: feedRef.current,
      banner: bannerRef.current,
      big: bigRef.current,
      callout: calloutRef.current,
      watching: watchingRef.current,
      hint: hintRef.current,
      hintTouch: hintTouchRef.current,
    }
    const toolsMore = toolsMoreRef.current
    const back = backRef.current
    const scoreButton = scoreButtonRef.current
    const chatButton = chatButtonRef.current
    if (Object.values(parts).some((node) => !node) || !toolsMore || !back || !scoreButton) return
    const elements = { ...parts, overMap: [] } as unknown as HashRushGameElements
    elements.overMap = [elements.pad, elements.bonk, elements.throwButton, toolsMore, back, scoreButton]
    if (quitRef.current) elements.overMap.push(quitRef.current)
    // On a wide screen the chat button lies over the map as well.
    if (chatButton) elements.overMap.push(chatButton)
    let cancelled = false
    let client: HashRushGameClient | null = null
    import('./client')
      .then(({ createHashRushGameClient, hashRushArt }) => {
        if (cancelled) return
        const latest = latestRef.current
        setArt(hashRushArt)
        client = createHashRushGameClient(elements, {
          server: HASH_RUSH_SERVER,
          language: latest.uiLocale || 'en',
          playerName: latest.playerName,
          getTicket: (fresh) => requestHashRushTicket({ conversationId, viewerKey: latestRef.current.viewerKey, fresh }),
          classes: CLASSES,
          onView: setView,
        })
        clientRef.current = client
        client.setVisible(latest.visible)
        client.setVoice(latest.voiceActive)
        client.setChatting(latest.chatOpen)
        // The last few lines of the room's talk go up over their speakers' hamsters, quietly.
        for (const entry of (latest.chatEntries ?? []).filter(landed).slice(-HASH_RUSH_CHAT_REPLAY_COUNT)) {
          client.hearRoom(entry, { quiet: true })
        }
        client.start()
        setSoundOff(client.soundOff())
        setClientEpoch((epoch) => epoch + 1)
      })
      .catch(() => {
        // The game's code could not be loaded (offline, a deploy in between).
        if (!cancelled) setView({ kind: 'failed', reason: 'connect' })
      })
    return () => {
      cancelled = true
      client?.destroy()
      if (clientRef.current === client) clientRef.current = null
    }
  }, [conversationId, loadAttempt])

  // The last few lines of the room's talk float up again, crisp for a few
  // seconds however old: the composer went down, the conversation folded, or
  // the game came back into sight (#188).
  const refloat = useCallback(() => {
    const now = Date.now()
    setFloating(refloatLines(latestRef.current.chatEntries ?? [], now))
    setFloatAt(now)
  }, [])

  const wasVisibleRef = useRef(visible)
  useEffect(() => {
    clientRef.current?.setVisible(visible)
    const was = wasVisibleRef.current
    wasVisibleRef.current = visible
    if (!visible) {
      setToolsOpen(false)
      setBoardRound(-1)
      setBrowsing(false)
    } else if (!was) refloat()
  }, [refloat, visible])

  useEffect(() => {
    clientRef.current?.setVoice(voiceActive)
  }, [voiceActive])

  // ---- The room's talk ----
  // What the game has not heard yet goes up in the bubble over the speaker's
  // hamster, in this viewer's language (a translation landing later only
  // changes its words), and floats over the map in the room's own bubble.
  useEffect(() => {
    if (!chatEntries) return
    const now = Date.now()
    const started = !chatFeedRef.current
    const step = chatFeedRef.current
      ? advanceHashRushChatFeed(chatFeedRef.current, chatEntries)
      : startHashRushChatFeed(chatEntries, now)
    chatFeedRef.current = step.feed
    if (!step.posts.length) return
    // A chime for what somebody else says; none for this viewer's own lines,
    // nor for the few replayed as the game opens (told to a client still
    // loading once it is there).
    const client = clientRef.current
    for (const post of step.posts) {
      client?.hearRoom(post, { quiet: started || post.userId === latestRef.current.viewerKey })
    }
    setFloating((lines) => floatLines(lines, step.posts, now))
    setFloatAt(now)
  }, [chatEntries])

  // Crisp lines go faint, faint ones go away, each in its time.
  useEffect(() => {
    const next = nextFloatChange(floating, floatAt)
    if (!Number.isFinite(next)) return
    const timer = window.setTimeout(() => {
      const now = Date.now()
      setFloating((lines) => liveLines(lines, now))
      setFloatAt(now)
    }, Math.max(0, next - floatAt) + 20)
    return () => window.clearTimeout(timer)
  }, [floating, floatAt])

  // The room's composer up over the game: the controls take nothing (they lie
  // under it or the keyboard) and this hamster stands still.
  useEffect(() => {
    clientRef.current?.setChatting(chatOpen)
  }, [chatOpen, clientEpoch])

  const wasChatOpenRef = useRef(chatOpen)
  useEffect(() => {
    const was = wasChatOpenRef.current
    wasChatOpenRef.current = chatOpen
    if (chatOpen) {
      const stage = stageRef.current
      heldSizeRef.current = stage ? { height: stage.clientHeight, until: Number.POSITIVE_INFINITY } : null
      // The conversation stands over the composer instead; the table and the settings go.
      setBoardRound(-1)
      setToolsOpen(false)
      setBrowsing(false)
      talkAtEndRef.current = true
      return
    }
    if (!was) return
    refloat()
    // The page grows back from under the keyboard first, then the map is measured.
    const held = heldSizeRef.current
    if (held) held.until = performance.now() + CHAT_RESIZE_HOLD_MS
    measureRef.current?.()
    const timer = window.setTimeout(() => measureRef.current?.(), CHAT_RESIZE_HOLD_MS + 20)
    return () => window.clearTimeout(timer)
  }, [chatOpen, refloat])

  // A tap anywhere on the game puts the composer and its keyboard away, and
  // is no move: the controls are off until a moment after (client.ts).
  useEffect(() => {
    if (!chatOpen) return
    const away = (event: PointerEvent) => {
      const target = event.target as Node
      if (!stageRef.current?.contains(target) || talkPanelRef.current?.contains(target)) return
      latestRef.current.onCloseChat?.()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [chatOpen])

  // A touch on a floating line opens the whole conversation in its place, to
  // read back without the keyboard (#190). It folds on a tap, inside it or
  // anywhere else, or once left alone for a while.
  const stayBrowsing = useCallback(() => {
    window.clearTimeout(browseTimerRef.current)
    browseTimerRef.current = window.setTimeout(() => setBrowsing(false), TALK_BROWSE_IDLE_MS)
  }, [])

  const openTalk = useCallback(() => {
    talkAtEndRef.current = true
    setBrowsing(true)
    stayBrowsing()
  }, [stayBrowsing])

  const wasBrowsingRef = useRef(false)
  useEffect(() => {
    const was = wasBrowsingRef.current
    wasBrowsingRef.current = browsing
    if (browsing) {
      const away = (event: PointerEvent) => {
        if (!talkPanelRef.current?.contains(event.target as Node)) setBrowsing(false)
      }
      window.addEventListener('pointerdown', away, true)
      return () => window.removeEventListener('pointerdown', away, true)
    }
    window.clearTimeout(browseTimerRef.current)
    if (was && !latestRef.current.chatOpen) refloat()
  }, [browsing, refloat])

  useEffect(() => () => window.clearTimeout(browseTimerRef.current), [])

  // Lines floating over the map: a tap anywhere but on them puts them away at
  // once (a tap on one opens the conversation instead).
  const floatingUp = floating.length > 0 && !(chat && (chatOpen || browsing))
  useEffect(() => {
    if (!floatingUp) return
    const away = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.('[data-qa="hash-rush-talk-line"]')) return
      setFloating([])
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [floatingUp])

  // On the conversation a tap folds it (or, over the composer, puts the
  // composer away: #188); a slide scrolls it, a long press opens a bubble's
  // own menu, and a bubble's own buttons keep their taps.
  const onTalkPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    talkTapRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, top: event.currentTarget.scrollTop, at: event.timeStamp }
    if (!latestRef.current.chatOpen) stayBrowsing()
  }, [stayBrowsing])

  const onTalkPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const tap = talkTapRef.current
    talkTapRef.current = null
    if (!tap || tap.id !== event.pointerId) return
    const still = Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < TALK_TAP_SLOP_PX
      && Math.abs(event.currentTarget.scrollTop - tap.top) < 4
      && event.timeStamp - tap.at < TALK_TAP_MAX_MS
    if (!still || (event.target as Element).closest?.('button, a, [role="button"]')) return
    if (latestRef.current.chatOpen) latestRef.current.onCloseChat?.()
    else setBrowsing(false)
  }, [])

  const onTalkScroll = useCallback(() => {
    const panel = talkPanelRef.current
    if (!panel) return
    talkAtEndRef.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 30
    if (!latestRef.current.chatOpen) stayBrowsing()
  }, [stayBrowsing])

  // Opened, it shows the newest lines, and keeps to them as more come.
  const talkPanelUp = !!chat && (chatOpen || browsing)
  useLayoutEffect(() => {
    const panel = talkPanelRef.current
    if (panel && talkAtEndRef.current) panel.scrollTop = panel.scrollHeight
  }, [talkPanelUp, chatEntries, chat?.dockHeightPx])

  // ---- Settings ----
  useEffect(() => {
    try {
      setBonkLeft(window.localStorage.getItem(BONK_SIDE_STORE) === '1')
    } catch {
      // storage is blocked: the button stays on the right
    }
  }, [])

  const swapSides = useCallback(() => {
    setBonkLeft((left) => {
      try {
        window.localStorage.setItem(BONK_SIDE_STORE, left ? '0' : '1')
      } catch {
        // not remembered, still swapped for now
      }
      return !left
    })
  }, [])

  const toggleSound = useCallback(() => {
    const client = clientRef.current
    if (client) setSoundOff(client.toggleSound())
  }, [])

  // A touch anywhere off the settings folds them away again. Captured: the room
  // layer keeps touches on the game from bubbling up to the room.
  useEffect(() => {
    if (!toolsOpen) return
    const fold = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false)
    }
    window.addEventListener('pointerdown', fold, true)
    return () => window.removeEventListener('pointerdown', fold, true)
  }, [toolsOpen])

  const retry = useCallback(() => {
    if (clientRef.current) clientRef.current.retry()
    else {
      setView({ kind: 'connecting', again: false })
      setLoadAttempt((attempt) => attempt + 1)
    }
  }, [])

  // ---- The score table ----
  const openBoard = useCallback(() => {
    const current = viewRef.current
    if (current.kind !== 'round') return
    setBoard(clientRef.current?.scoreboard() ?? null)
    setBoardRound(current.round)
  }, [])
  const closeBoard = useCallback(() => setBoardRound(-1), [])

  // Over a round it follows the numbers as they change.
  useEffect(() => {
    if (!boardShown) return
    const timer = window.setInterval(() => {
      const next = clientRef.current?.scoreboard() ?? null
      setBoard((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
    }, BOARD_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [boardShown])

  // The scores lie over the map without blocking it: a touch anywhere off them
  // puts them away, as their own button and their ✕ do.
  useEffect(() => {
    if (!boardShown) return
    const away = (event: PointerEvent) => {
      const target = event.target as Node
      if (boardCardRef.current?.contains(target) || scoreButtonRef.current?.contains(target)) return
      setBoardRound(-1)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [boardShown])

  // The 🏆 button: the table over a round; after it, the result card put away and back.
  const onScoreButton = useCallback(() => {
    const current = viewRef.current
    const key = cardKeyOf(current)
    if (key) {
      setHiddenCard((hidden) => (hidden === key ? '' : key))
      return
    }
    if (current.kind !== 'round') return
    if (boardRound === current.round) closeBoard()
    else openBoard()
  }, [boardRound, closeBoard, openBoard])

  // With a keyboard, Tab held brings the table up and letting go puts it away;
  // after a round it brings back the result card put away (#39, #46).
  useEffect(() => {
    if (!visible) return
    let heldCard = ''
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || typing()) return
      const current = viewRef.current
      const key = cardKeyOf(current)
      if (current.kind !== 'round' && !key) return
      event.preventDefault()
      if (event.repeat) return
      if (key) {
        if (cardHiddenRef.current) {
          heldCard = key
          setHiddenCard('')
        }
      } else openBoard()
    }
    const up = (event: KeyboardEvent | FocusEvent) => {
      if (event instanceof KeyboardEvent && event.code !== 'Tab') return
      setBoardRound(-1)
      if (heldCard) {
        const key = heldCard
        heldCard = ''
        setHiddenCard(key)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', up)
    }
  }, [openBoard, visible])

  const sit = useCallback(() => clientRef.current?.sit(), [])
  const stand = useCallback(() => clientRef.current?.stand(), [])
  const setup = useCallback((patch: HashRushSetup) => clientRef.current?.setup(patch), [])
  const go = useCallback(() => clientRef.current?.go(), [])
  const handHost = useCallback((seat: number) => clientRef.current?.handHost(seat), [])
  const pickTeam = useCallback((team: number) => clientRef.current?.pickTeam(team), [])
  const hideCard = useCallback(() => setHiddenCard(cardKeyOf(viewRef.current)), [])

  const fieldStyle = field
    ? { width: field.widthPx, height: field.heightPx, top: field.topPx }
    : { width: 0, height: 0, top: 0, visibility: 'hidden' as const }
  // Where the map is, for what the stylesheet places by it: in the arena (the
  // touch hint) and in the stage (the back pill, the buttons by the map).
  const stageStyle = field
    ? ({
        '--hr-field-top': `${field.topPx}px`,
        '--hr-field-height': `${field.heightPx}px`,
        '--hr-field-y': `${arenaAt.top + field.topPx}px`,
        '--hr-field-x': `${arenaAt.left + Math.max(0, Math.round((arenaAt.width - field.widthPx) / 2))}px`,
        '--hr-field-width': `${field.widthPx}px`,
      } as CSSProperties)
    : undefined
  const inGame = view.kind === 'round' || !!cardKey
  const watcher = view.kind === 'round' && view.watcher

  return (
    <div
      ref={stageRef}
      className={cx(
        styles.stage,
        tall && styles.tall,
        bonkLeft && styles.bonkLeft,
        cardUp && styles.resultUp,
        watcher && styles.watcher,
        view.kind !== 'round' && styles.offRound,
        boardShown && styles.boardUp,
        chat?.canWrite && styles.hasChat,
        chatOpen && styles.chatting,
      )}
      style={stageStyle}
      data-qa="hash-rush-game"
    >
      <div ref={arenaRef} className={styles.arena}>
        <div className={styles.field} style={fieldStyle} data-qa="hash-rush-field">
          <canvas ref={canvasRef} className={styles.canvas} aria-label={copy.title} />
          <div className={styles.hud}>
            <div ref={scoresRef} className={styles.scores} />
            <div className={styles.side}>
              <div ref={clockRef} className={styles.clock}>0:00</div>
              <div ref={pingRef} className={styles.ping} />
              <div ref={feedRef} className={styles.feed} />
              {/* The result put away: when the next round starts, by the clock. */}
              {cardHidden && nextSeconds != null ? (
                <div className={styles.nextChip} data-qa="hash-rush-next-chip">{copy.nextChip(nextSeconds)}</div>
              ) : null}
            </div>
            <div ref={bannerRef} className={styles.banner} data-qa="hash-rush-banner" />
            <div ref={bigRef} className={styles.big} />
            <div ref={calloutRef} className={styles.callout} />
            <div ref={hintRef} className={styles.hint} />
          </div>
        </div>
        <div ref={hintTouchRef} className={styles.hintTouch} />
      </div>

      {/* The round's own buttons: on a phone in the gap between the pad and the
          bonk button, with a mouse along the map's bottom. */}
      <div ref={toolsRef} className={cx(styles.dock, toolsOpen && styles.toolsOpen)} data-qa="hash-rush-dock">
        <button
          ref={scoreButtonRef}
          type="button"
          className={cx(styles.toolButton, styles.scoreButton)}
          aria-label={copy.scoreboard}
          title={copy.scoreboard}
          aria-pressed={boardShown || cardUp}
          hidden={!inGame}
          onClick={onScoreButton}
          data-qa="hash-rush-score-button"
        >
          🏆<span className={styles.toolLabel}> {copy.scoreboard}<span className={styles.tabHint}> (Tab)</span></span>
        </button>
        <button
          ref={toolsMoreRef}
          type="button"
          className={cx(styles.toolButton, styles.toolsMore)}
          aria-label={copy.settings}
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((open) => !open)}
        >
          ⚙️
        </button>
        <div className={styles.toolsMenu} onClick={() => setToolsOpen(false)}>
          <button type="button" className={styles.toolButton} aria-label={copy.sound} title={copy.sound} onClick={toggleSound}>
            {soundOff ? '🔇' : '🔊'}
          </button>
          <button type="button" className={cx(styles.toolButton, styles.touchOnly)} aria-label={copy.swapSides} title={copy.swapSides} onClick={swapSides}>
            ⇄
          </button>
        </div>
      </div>

      <div ref={padRef} className={styles.pad} data-qa="hash-rush-pad">
        <svg viewBox="-1 -1 102 102" aria-hidden="true">
          {PAD_KEYS.map((key) => (
            <g key={key.turn} className={key.className} transform={`rotate(${key.turn} 50 50)`}>
              <path d={PAD_SLICE} />
              <path className={styles.arrow} d={PAD_ARROW} />
            </g>
          ))}
        </svg>
      </div>
      <button ref={throwRef} type="button" className={styles.throw} data-qa="hash-rush-throw" />
      <button ref={bonkRef} type="button" className={styles.bonk} data-qa="hash-rush-bonk" />

      {/* Watching a round: there are no controls, so their strip says what is
          going on and holds the way into the next round. Off the sunflower. */}
      <div className={styles.watchStrip} data-qa="hash-rush-watch-strip">
        <div ref={watchingRef} className={styles.watching} data-qa="hash-rush-watching" />
        {view.kind === 'round' && view.watcher && view.canSit ? (
          <button type="button" className={styles.sitStrip} onClick={sit} data-qa="hash-rush-sit-next">
            {copy.sitNextRound}
          </button>
        ) : null}
      </div>

      {/* The room's composer, up over the game in one tap: at the foot of the
          gap between the pad and the bonk button (#189), over every card,
          plain outside a round (#221). A red dot while voice interpretation is on. */}
      {chat ? (
        <button
          ref={chatButtonRef}
          type="button"
          className={cx(styles.chatButton, view.kind !== 'round' && styles.chatButtonSolid)}
          aria-label={copy.chat}
          title={copy.chat}
          hidden={!chat.canWrite}
          onClick={chat.onOpen}
          data-qa="hash-rush-chat-button"
        >
          <span aria-hidden="true">💬</span>
          {chat.interpreting ? (
            <i role="img" aria-label={copy.interpreting} title={copy.interpreting} className={styles.chatDot} data-qa="hash-rush-interpreting-dot" />
          ) : null}
        </button>
      ) : null}

      {boardShown && board ? (
        <HashRushBoard
          board={board}
          copy={copy}
          scoreView={scoreView}
          onScoreView={setScoreView}
          onClose={closeBoard}
          cardRef={(node) => {
            boardCardRef.current = node
          }}
        />
      ) : null}

      {view.kind === 'connecting' || view.kind === 'failed' ? <HashRushGameCover view={view} uiLocale={uiLocale} onRetry={retry} /> : null}
      {view.kind === 'lobby' ? (
        <HashRushLobbyCard
          view={view}
          copy={copy}
          art={art}
          onSit={sit}
          onStand={stand}
          onSetup={setup}
          onGo={go}
          onHandHost={handHost}
          onPickTeam={pickTeam}
          onHowTo={onHowTo}
        />
      ) : null}
      {view.kind === 'result' && cardUp ? (
        <HashRushResultCard
          verdict={view.verdict}
          board={view.board}
          nextAt={view.nextAt}
          at={view.at}
          copy={copy}
          scoreView={scoreView}
          onScoreView={setScoreView}
          onClose={hideCard}
        />
      ) : null}
      {view.kind === 'title' && cardUp ? (
        <HashRushTitleCard words={view.words} board={view.board} nextAt={view.nextAt} at={view.at} copy={copy} art={art} onClose={hideCard} />
      ) : null}

      {/* The room's talk, over every card too (#214): the room's own bubbles,
          one per message in this viewer's language. New lines float just over
          the controls, crisp, then faint (#196, #198), nearly gone over a
          hamster (#203). Opened, the whole conversation: over the composer
          while it is up (#183), else in the lines' place to read back (#190). */}
      {chat && talkPanelUp ? (
        <div
          ref={talkPanelRef}
          className={cx(styles.talk, styles.talkPanel, chatOpen && styles.talkDocked)}
          style={chatOpen ? { bottom: chat.dockHeightPx } : undefined}
          onPointerDown={onTalkPointerDown}
          onPointerUp={onTalkPointerUp}
          onPointerCancel={() => (talkTapRef.current = null)}
          onScroll={onTalkScroll}
          data-qa="hash-rush-room-talk"
          data-open={chatOpen ? 'composer' : 'read'}
        >
          {(chatEntries ?? []).filter(landed).map((entry) => (
            <div key={entry.id} className={styles.talkRow} data-qa="hash-rush-talk-row">
              {chat.renderMessage(entry.id)}
            </div>
          ))}
        </div>
      ) : chat && floating.length ? (
        <div className={styles.talk} data-qa="hash-rush-room-talk" data-open="none">
          {floating.map((line) => (
            <div
              key={line.id}
              className={cx(styles.talkRow, styles.talkLine, line.crispUntil <= floatAt && styles.talkFaint)}
              onPointerDown={openTalk}
              data-hr-fade=""
              data-qa="hash-rush-talk-line"
            >
              {chat.renderMessage(line.id)}
            </div>
          ))}
        </div>
      ) : null}

      {/* The way back to the chat, over the map's top left corner and over every card; then Quit. */}
      <div className={styles.topLeft}>
      <button
        ref={backRef}
        type="button"
        onClick={onBack}
        className={styles.back}
        aria-label={copy.backToChat}
        title={copy.backToChat}
        data-qa="hash-rush-game-back"
      >
        <ChevronLeft size={20} strokeWidth={2.6} aria-hidden="true" />
        <span>{copy.backShort}</span>
        {voiceActive ? (
          <i role="img" aria-label={copy.voiceOn} title={copy.voiceOn} className={styles.voiceDot} data-qa="hash-rush-voice-dot" />
        ) : null}
      </button>
      {onQuit ? (
        <button
          ref={quitRef}
          type="button"
          onClick={onQuit}
          className={styles.quit}
          aria-label={inviteCopy.quit}
          title={inviteCopy.quit}
          data-qa="hash-rush-game-quit"
        >
          <LogOut size={16} strokeWidth={2.6} aria-hidden="true" />
          <span>{inviteCopy.quit}</span>
        </button>
      ) : null}
      </div>
    </div>
  )
}

/** What shows over the game while it joins, or when it could not. */
function HashRushGameCover({ view, uiLocale, onRetry }: { view: Extract<HashRushGameView, { kind: 'connecting' | 'failed' }>, uiLocale: string, onRetry: () => void }) {
  const copy = hashRushGameCopy(uiLocale)
  // Under the status bar, whose strip stays pale so its dark words still read.
  const cover = 'absolute inset-x-0 bottom-0 flex flex-col items-center justify-center gap-3 bg-[#24572f] text-white'
  const top = { top: 'env(safe-area-inset-top, 0px)' }
  if (view.kind === 'connecting') {
    return (
      <div className={cover} style={top} data-qa="hash-rush-connecting">
        <Loader2 size={24} className="animate-spin" aria-hidden="true" />
        <p className="text-[0.92rem] font-semibold">{view.again ? copy.reconnecting : copy.opening}</p>
      </div>
    )
  }
  return (
    <div className={`${cover} px-8 text-center`} style={top}>
      <p className="text-[0.95rem] font-semibold leading-snug" data-qa="hash-rush-failure">
        {view.reason === 'ticket' ? copy.ticketFailed : copy.connectFailed}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-full bg-white px-5 py-2.5 text-[0.95rem] font-bold text-gray-900 shadow-sm active:bg-gray-100"
        data-qa="hash-rush-retry"
      >
        {copy.retry}
      </button>
    </div>
  )
}
