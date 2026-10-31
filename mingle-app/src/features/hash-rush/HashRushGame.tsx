'use client'

// Hash Rush, played in the chat room itself: the map, the HUD over it and the
// touch controls (the doughnut pad, swipes on the map, the bonk button and the
// throw button), and the keyboard on a computer. The game runs on the Hash
// Rush game server, one game room per chat room; this joins it with the room
// member's entry ticket. The game itself is client.ts on the copied engine
// (engine/README.md), loaded once this is on screen. This component only lays
// out its DOM and shows what the client reports between rounds.
//
// The rules it keeps are hash-rush's docs/UIUX-ISSUES.md and this repo's
// docs/hash-rush-in-app-uiux.md: the map fills the width, the controls lie over
// its foot, a hamster under a button dims it by half, a swipe of 32px or more
// steers one of 16 ways, a tap stops, and the pad stays held while the thumb
// stays down.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Loader2 } from 'lucide-react'
import styles from './hash-rush-game.module.css'
import { HASH_RUSH_SERVER } from './config'
import { hashRushGameCopy } from './copy'
import { resolveHashRushField, type HashRushFieldLayout } from './layout'
import { requestHashRushTicket } from './ticket'
import type { HashRushGameClient, HashRushGameClasses, HashRushGameElements, HashRushGameView } from './client'

// The same key the web game keeps the side in.
const BONK_SIDE_STORE = 'hash-rush-bonk-left'

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
  /** This room's voice talk is connected: the game holds its music. */
  voiceActive: boolean
}

export default function HashRushGame({ conversationId, viewerKey, playerName, uiLocale, visible, voiceActive }: Props) {
  const copy = hashRushGameCopy(uiLocale)
  const stageRef = useRef<HTMLDivElement | null>(null)
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
  const clientRef = useRef<HashRushGameClient | null>(null)
  const latestRef = useRef({ viewerKey, playerName, uiLocale, visible, voiceActive })
  const [field, setField] = useState<HashRushFieldLayout | null>(null)
  const [view, setView] = useState<HashRushGameView>({ kind: 'connecting', again: false })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [soundOff, setSoundOff] = useState(false)
  const [bonkLeft, setBonkLeft] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)

  useEffect(() => {
    latestRef.current = { viewerKey, playerName, uiLocale, visible, voiceActive }
  }, [viewerKey, playerName, uiLocale, visible, voiceActive])

  // ---- Where the map goes: the whole width it can, at the top of a tall area ----
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      const next = resolveHashRushField(stage.clientWidth, stage.clientHeight)
      setField((current) => (
        current && next && current.tall === next.tall && current.widthPx === next.widthPx
          && current.heightPx === next.heightPx && current.topPx === next.topPx
          ? current
          : next
      ))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
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
    if (Object.values(parts).some((node) => !node) || !toolsMore) return
    const elements = { ...parts, overMap: [] } as unknown as HashRushGameElements
    elements.overMap = [elements.pad, elements.bonk, elements.throwButton, toolsMore]
    let cancelled = false
    let client: HashRushGameClient | null = null
    import('./client')
      .then(({ createHashRushGameClient }) => {
        if (cancelled) return
        const latest = latestRef.current
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
        client.start()
        setSoundOff(client.soundOff())
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

  useEffect(() => {
    clientRef.current?.setVisible(visible)
    if (!visible) setToolsOpen(false)
  }, [visible])

  useEffect(() => {
    clientRef.current?.setVoice(voiceActive)
  }, [voiceActive])

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

  const fieldStyle = field
    ? { width: field.widthPx, height: field.heightPx, top: field.topPx }
    : { width: 0, height: 0, top: 0, visibility: 'hidden' as const }
  // Where the map is, for what the stylesheet places by it (the touch hint).
  const stageStyle = field
    ? ({ '--hr-field-top': `${field.topPx}px`, '--hr-field-height': `${field.heightPx}px` } as CSSProperties)
    : undefined

  return (
    <div
      ref={stageRef}
      className={cx(styles.stage, field?.tall && styles.tall, bonkLeft && styles.bonkLeft, view.kind === 'result' && styles.resultUp)}
      style={stageStyle}
      data-qa="hash-rush-game"
    >
      <div className={styles.field} style={fieldStyle}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label={copy.title} />
        <div className={styles.hud}>
          <div ref={scoresRef} className={styles.scores} />
          <div className={styles.side}>
            <div ref={clockRef} className={styles.clock}>0:00</div>
            <div ref={pingRef} className={styles.ping} />
            <div ref={feedRef} className={styles.feed} />
          </div>
          <div ref={bannerRef} className={styles.banner} />
          <div ref={bigRef} className={styles.big} />
          <div ref={calloutRef} className={styles.callout} />
          <div ref={watchingRef} className={styles.watching} />
          <div ref={hintRef} className={styles.hint} />
          <div ref={toolsRef} className={cx(styles.tools, toolsOpen && styles.toolsOpen)}>
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
        </div>
      </div>

      <div ref={hintTouchRef} className={styles.hintTouch} />
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

      <HashRushGameCover view={view} uiLocale={uiLocale} onRetry={retry} />
    </div>
  )
}

/** What shows over the game between rounds: joining, a failure, the wait, the verdict. */
function HashRushGameCover({ view, uiLocale, onRetry }: { view: HashRushGameView, uiLocale: string, onRetry: () => void }) {
  const copy = hashRushGameCopy(uiLocale)
  if (view.kind === 'round') return null
  if (view.kind === 'connecting') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#24572f] text-white" data-qa="hash-rush-connecting">
        <Loader2 size={24} className="animate-spin" aria-hidden="true" />
        <p className="text-[0.92rem] font-semibold">{view.again ? copy.reconnecting : copy.opening}</p>
      </div>
    )
  }
  if (view.kind === 'failed') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#24572f] px-8 text-center text-white">
        <p className="text-[0.95rem] font-semibold leading-snug" data-qa="hash-rush-failure">
          {view.reason === 'ticket' ? copy.ticketFailed : copy.connectFailed}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-white px-5 py-2.5 text-[0.95rem] font-bold text-gray-900 shadow-sm active:bg-gray-100"
          data-qa="hash-rush-retry"
        >
          {copy.retry}
        </button>
      </div>
    )
  }
  if (view.kind === 'waiting') {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#24572f]/85 px-6" data-qa="hash-rush-waiting">
        <div className="w-full max-w-[320px] rounded-3xl border-[3px] border-[#ead9b5] bg-[#fff8e7] px-5 py-5 text-center text-[#3a2a1a] shadow-[0_10px_0_rgba(0,0,0,0.18)]">
          <p className="text-[1.05rem] font-extrabold">{copy.waitingRound}</p>
          <Loader2 size={20} className="mx-auto mt-3 animate-spin text-[#a07a45]" aria-hidden="true" />
          {view.players.length > 0 ? (
            <div className="mt-4">
              <p className="text-[0.8rem] font-bold text-[#a07a45]">{copy.waitingPlayers}</p>
              <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
                {view.players.map((player, index) => (
                  <li
                    key={`${index}-${player.name}`}
                    className={`rounded-full border-2 px-3 py-1 text-[0.9rem] font-bold ${player.me ? 'border-[#2f6fed] bg-white' : 'border-[#ead9b5] bg-white/70'}`}
                  >
                    {player.name}
                    {player.me ? <span className="ml-1 text-[0.75rem] text-[#2f6fed]">({copy.me})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {view.spectating ? <p className="mt-3 text-[0.85rem] font-bold text-[#2f6fed]">{copy.spectating}</p> : null}
        </div>
      </div>
    )
  }
  // The round's verdict, over the map and its confetti, until the server goes back to the lobby.
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6" data-qa="hash-rush-result">
      <div className="rounded-3xl border-[3px] border-[#ead9b5] bg-[#fff8e7]/95 px-6 py-4 text-center text-[#3a2a1a] shadow-[0_10px_0_rgba(0,0,0,0.18)]">
        <p className={`text-[1.6rem] font-black ${view.mine === 'win' ? 'text-[#e69a00]' : view.mine === 'lose' ? 'text-[#6b7280]' : ''}`}>{view.title}</p>
        {view.detail ? <p className="mt-1 text-[0.95rem] font-bold">{view.detail}</p> : null}
      </div>
    </div>
  )
}
