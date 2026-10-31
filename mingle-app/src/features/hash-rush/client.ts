// Hash Rush in a chat room: this viewer's side of the room's game on the game
// server, played in the app's own page. It is the guest path of hash-rush's
// main.js (enterRoom, hostData, tick, playAhead, updateHud, onEvent) on the
// copied engine, with the DOM handed in by HashRushGame.tsx. The server runs
// the round; this sends the inputs, plays this viewer's own hamster a little
// ahead (engine/client/predict.js) and draws the snapshots.
//
// Phase 1 of the port: between rounds the component shows a short waiting card,
// and a round's end a short verdict. The lobby, the score table and the result
// card come in phase 2.
//
// Browser-only: HashRushGame.tsx loads it with import() once it is on screen.

import { BONK, OVERTIME } from './engine/sim/constants.js'
import { allied, inHome } from './engine/sim/game.js'
import { MAP, isFree } from './engine/sim/map.js'
import { createRenderer, nearHome } from './engine/client/render.js'
import { createInput } from './engine/client/input.js'
import { createPredictor } from './engine/client/predict.js'
import { createAudio } from './engine/client/audio.js'
import { createHaptics } from './engine/client/haptics.js'
import { colorOf } from './engine/client/looks.js'
import { setLanguage, t } from './engine/client/i18n.js'
import { joinServerRoom } from './engine/client/net.js'
import {
  IDLE_INPUT_READ,
  SIT_MESSAGE,
  applySnapshot,
  createOthersSmoother,
  helloMessage,
  initialInputState,
  isSnapshot,
  laneHelpMemory,
  nextInputMessage,
  readLobby,
  readPlayerRow,
  readStart,
  shouldTakeSeat,
  type HashRushEvent,
  type HashRushLobby,
  type HashRushPlayer,
  type HashRushRound,
  type HashRushSession,
} from './protocol'
import type { HashRushTicketGrant } from './ticket'

export type HashRushGameElements = {
  /** The whole game area: a swipe anywhere on it steers. */
  stage: HTMLElement
  canvas: HTMLCanvasElement
  pad: HTMLElement
  bonk: HTMLElement
  throwButton: HTMLElement
  scores: HTMLElement
  clock: HTMLElement
  ping: HTMLElement
  feed: HTMLElement
  banner: HTMLElement
  big: HTMLElement
  callout: HTMLElement
  watching: HTMLElement
  hint: HTMLElement
  hintTouch: HTMLElement
  /** What lies over the map and fades while a hamster runs under it. */
  overMap: HTMLElement[]
}

/** The stylesheet's class names for what this draws and toggles. */
export type HashRushGameClasses = {
  chip: string
  chipMe: string
  chipCarry: string
  chipDot: string
  scoresMany: string
  feedLine: string
  calloutSuper: string
  bannerShow: string
  bannerAlarm: string
  clockOvertime: string
  pingSlow: string
  under: string
  off: string
  ended: string
}

export type HashRushWaitingPlayer = { name: string, me: boolean }

/** What the component shows over the game. */
export type HashRushGameView =
  | { kind: 'connecting', again: boolean }
  | { kind: 'failed', reason: 'ticket' | 'connect' }
  | { kind: 'waiting', players: HashRushWaitingPlayer[], spectating: boolean }
  | { kind: 'round' }
  | { kind: 'result', title: string, mine: 'win' | 'lose' | '', detail: string }

export type HashRushGameOptions = {
  /** The game server's ws(s) address. */
  server: string
  /** The app's language; the game's strings follow it. */
  language: string
  /** The chat name, for a ticket that carries none. */
  playerName: string
  /** An entry ticket: a good one held, or a new one when `fresh`. */
  getTicket: (fresh: boolean) => Promise<HashRushTicketGrant>
  classes: HashRushGameClasses
  onView: (view: HashRushGameView) => void
}

export type HashRushGameClient = {
  start(): void
  /** After a failure: a fresh ticket and one more try. */
  retry(): void
  /** Out of sight the round goes on, silent, and this hamster stands still. */
  setVisible(visible: boolean): void
  /** A voice talk is on in the room: the music makes way, the effects stay. */
  setVoice(active: boolean): void
  /** Turns the sound on or off; returns whether it is off now. */
  toggleSound(): boolean
  soundOff(): boolean
  /** The map's box changed size. */
  resize(): void
  destroy(): void
}

// A dropped line is tried again for this long before the game gives up.
const RECONNECT_FOR_MS = 20_000
const RECONNECT_EVERY_MS = 1_500
// The verdict comes up a moment after the winning seed, over the confetti.
const RESULT_AFTER_MS = 1_500
const SIT_EVERY_MS = 2_000
const LINE_CHECK_EVERY_MS = 2_000
const FADE_CHECK_EVERY_MS = 100
// A swing heard ahead of the server's word is not heard again when its word comes.
const OWN_SWING_HEARD_S = 1.5
// Browsers allow sound only after a tap; these all count as one somewhere.
const TAP_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'] as const

// One haptics per page: on iPhones it keeps a hidden switch in the page.
let sharedHaptics: ReturnType<typeof createHaptics> | null = null
const haptics = () => (sharedHaptics ??= createHaptics())

// The server replaces a line of the same `pid` with a new one, so a game that
// reconnects does not leave its old hamster behind. Each game makes its own.
function newPid(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// The keyboard hint is written as HTML for the web page.
const plain = (html: unknown) => String(html ?? '').replace(/&nbsp;/g, '\u00a0').replace(/<[^>]*>/g, '')

type Line = Awaited<ReturnType<typeof joinServerRoom>>
// predict.js gives `steer` a null default, so TypeScript would read that parameter as null only.
type PredictorView = (now: number, round: HashRushRound, me: number, steer: ReturnType<typeof laneHelpMemory>) => Partial<HashRushPlayer> | null

export function createHashRushGameClient(el: HashRushGameElements, options: HashRushGameOptions): HashRushGameClient {
  setLanguage(options.language)
  const { classes } = options
  const renderer = createRenderer(el.canvas, MAP)
  const input = createInput({
    stage: el.stage,
    canvas: el.canvas,
    pad: el.pad,
    bonkBtn: el.bonk,
    throwBtn: el.throwButton,
    toWorldDir: renderer.toWorldDir,
  })
  const predictor = createPredictor()
  const viewAhead = predictor.view as unknown as PredictorView
  const audio = createAudio({ audioSession: false })
  const buzz = haptics()
  const others = createOthersSmoother(isFree)
  // Over whose hamster something was said; the room's talk comes in a later phase.
  const bubbles = new Map()
  const pid = newPid()
  const listening = new AbortController()

  el.bonk.textContent = t('bonk')
  el.throwButton.textContent = t('throwBtn')
  el.throwButton.hidden = true
  el.hint.textContent = plain(t('hint'))
  el.hintTouch.textContent = plain(t('hintTouch'))
  el.watching.hidden = true
  el.ping.hidden = true

  let destroyed = false
  let line: Line | null = null
  let connecting = false
  let lobby: HashRushLobby | null = null
  let game: HashRushRound | null = null
  let meId = -1
  const wins: number[] = []
  const session: HashRushSession = { round: 0, tick: -1, snap: null }
  // Where this hamster was played ahead to (main.js net.mine).
  let mine: Partial<HashRushPlayer> | null = null
  const inputState = initialInputState()
  // Steering is on from a round's start to its winning seed; seen or not.
  let inputWanted = false
  let visible = true
  let raf = 0
  let lastFrame = 0
  let retryTimer = 0
  let resultTimer = 0
  let bannerTimer = 0
  let sitAskedAt = Number.NEGATIVE_INFINITY
  let swungAt = Number.NEGATIVE_INFINITY
  let swinging = false
  let bonkCool = -1
  let bonkOff = false
  let scoreKey = ''
  let clockKey = ''
  let alarmKey = ''
  let portalSaid = false
  let tickBeat = -1
  let fadedAt = 0
  let calloutAt = 0
  let calloutLines: string[] = []

  const show = (view: HashRushGameView) => {
    if (!destroyed) options.onView(view)
  }

  // ---------- the line ----------

  async function connect(until: number, freshTicket: boolean) {
    if (destroyed || line || connecting) return
    connecting = true
    let grant: HashRushTicketGrant
    try {
      grant = await options.getTicket(freshTicket)
    } catch {
      connecting = false
      if (destroyed) return
      if (Date.now() < until) return tryAgainLater(until)
      show({ kind: 'failed', reason: 'ticket' })
      return
    }
    try {
      const joined = await joinServerRoom(options.server, grant.room, { data: hear, close: lost }, { ticket: grant.ticket })
      connecting = false
      if (destroyed) {
        joined.close()
        return
      }
      line = joined
      // The server answers with the lobby (and the round, if one is on); until then it is still joining.
      joined.send(helloMessage({ name: grant.name || options.playerName, pid }))
    } catch {
      connecting = false
      if (destroyed) return
      if (Date.now() < until) return tryAgainLater(until)
      show({ kind: 'failed', reason: 'connect' })
    }
  }

  function tryAgainLater(until: number) {
    window.clearTimeout(retryTimer)
    retryTimer = window.setTimeout(() => void connect(until, false), RECONNECT_EVERY_MS)
  }

  // The server went away or the line dropped: knock for a while before giving up.
  function lost() {
    line = null
    lobby = null
    toLobby()
    if (destroyed) return
    show({ kind: 'connecting', again: true })
    void connect(Date.now() + RECONNECT_FOR_MS, false)
  }

  function hear(message: unknown) {
    if (destroyed || !message || typeof message !== 'object') return
    const type = (message as { t?: unknown }).t
    if (type === 'lobby') {
      const next = readLobby(message)
      if (!next) return
      lobby = next
      next.wins.forEach((n, i) => (wins[i] = n))
      // Phase 1 has no lobby to choose a seat in: a spectator sits in the first free one.
      if (shouldTakeSeat(next) && performance.now() - sitAskedAt > SIT_EVERY_MS) {
        sitAskedAt = performance.now()
        line?.send(SIT_MESSAGE)
      }
      if (!game) showWaiting()
      syncWatching()
    } else if (type === 'start') {
      const started = readStart(message)
      if (!started) return
      session.round = started.round
      session.snap = null
      session.tick = -1
      mine = null
      others.clear()
      predictor.reset()
      started.wins.forEach((n, i) => (wins[i] = n))
      game = started.game
      meId = started.you
      renderer.setMap(game.map)
      enterStage()
    } else if (type === 's') {
      if (game && isSnapshot(message)) takeSnapshot(game, message)
    } else if (type === 'lobbyscreen') {
      toLobby()
      showWaiting()
    }
    // 'chat' and 'rename' are the game's own talk: in the app the talk is the room's.
  }

  function takeSnapshot(round: HashRushRound, snap: Parameters<typeof applySnapshot>[2]) {
    const result = applySnapshot(round, session, snap, meId)
    if (!result) return
    if (result.fresh && result.drawn) {
      const now = performance.now() / 1000
      others.heard(round, result.drawn, meId, now)
      if (snap.k >= 0) predictor.heard(now, snap.k, result.ack)
      // My own hamster stays where it was last drawn until the next frame works it out again.
      if (mine && meId >= 0) Object.assign(round.players[meId], mine)
    }
    for (const ev of result.events) {
      if (game !== round) return
      onEvent(round, ev)
    }
  }

  // ---------- screens ----------

  function showWaiting() {
    if (!line) return
    const seats = lobby?.seats ?? []
    const players = seats
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat }) => seat.kind === 'remote')
      .map(({ seat, index }) => ({ name: seat.name, me: index === lobby?.you }))
    show({ kind: 'waiting', players, spectating: !!lobby && lobby.you < 0 })
  }

  function enterStage() {
    window.clearTimeout(resultTimer)
    el.feed.textContent = ''
    el.callout.textContent = ''
    el.banner.classList.remove(classes.bannerShow)
    scoreKey = ''
    clockKey = ''
    alarmKey = ''
    bonkCool = -1
    portalSaid = false
    tickBeat = -1
    renderer.clear()
    input.reset()
    inputWanted = meId >= 0
    syncInput()
    syncWatching()
    renderer.resize()
    big('3')
    audio.play.count()
    audio.setMusic('game')
    show({ kind: 'round' })
  }

  function toLobby() {
    window.clearTimeout(resultTimer)
    inputWanted = false
    syncInput()
    game = null
    meId = -1
    mine = null
    syncWatching()
    el.throwButton.hidden = true
    audio.setMusic('lobby')
  }

  function syncInput() {
    input.enable(inputWanted && visible)
  }

  function syncWatching() {
    el.watching.hidden = !game || meId >= 0
    // Somebody who came in during a round has a seat already and plays from the next one.
    el.watching.textContent = t(lobby && lobby.you >= 0 ? 'watchThisRound' : 'spectating')
  }

  function showResult(round: HashRushRound) {
    if (game !== round) return
    const players = round.players
    const won = (p: HashRushPlayer) => round.winners.includes(p.id)
    const winners = round.winners.map((id) => players[id]).filter(Boolean)
    const winner = (round.winner != null ? players[round.winner] : undefined) ?? winners[0]
    const mineResult = meId >= 0 && players[meId] ? (won(players[meId]) ? 'win' : 'lose') : ''
    const title = t(mineResult === 'win' ? 'victory' : mineResult === 'lose' ? 'defeat' : 'roundOver')
    let detail = ''
    if (winner) {
      // Time ran out with the top sides level: they share the round.
      const shared = winners.some((p) => !allied(p, winner) && p !== winner)
      const who = shared ? winners.map((p) => p.name).join(', ') : winner.team >= 0 ? t('teamNames')[winner.team] : winner.name
      detail = `🏆 ${t(shared ? 'winnersShared' : 'winnerIs', who)}`
    }
    show({ kind: 'result', title: String(title), mine: mineResult, detail })
  }

  // ---------- what happens in a round ----------

  function big(word: string) {
    const span = document.createElement('span')
    span.textContent = word
    el.big.replaceChildren(span)
    span.addEventListener('animationend', () => span.remove())
  }

  function banner(words: string, alarm = false) {
    el.banner.textContent = words
    el.banner.classList.add(classes.bannerShow)
    el.banner.classList.toggle(classes.bannerAlarm, alarm)
    window.clearTimeout(bannerTimer)
    bannerTimer = window.setTimeout(() => el.banner.classList.remove(classes.bannerShow), 2200)
  }

  function nameTag(p: HashRushPlayer) {
    const b = document.createElement('b')
    b.textContent = p.name
    b.style.color = colorOf(p)
    return b
  }

  // The shout for a big play. Plays within a moment of each other share one shout.
  function callout(by: HashRushPlayer, lines: string[]) {
    const now = performance.now()
    calloutLines = now - calloutAt < 400 ? [...new Set([...calloutLines, ...lines])] : lines
    calloutAt = now
    const box = document.createElement('div')
    box.append(nameTag(by))
    for (const words of calloutLines) {
      const span = document.createElement('span')
      span.textContent = words
      if (words === t('superPlay')) span.className = classes.calloutSuper
      box.append(span)
    }
    box.addEventListener('animationend', () => box.remove())
    el.callout.replaceChildren(box)
  }

  function feed(...parts: (Node | string)[]) {
    const row = document.createElement('div')
    row.className = classes.feedLine
    row.append(...parts)
    row.addEventListener('animationend', () => row.remove())
    el.feed.prepend(row)
    while (el.feed.children.length > 4) el.feed.lastChild?.remove()
  }

  function onEvent(round: HashRushRound, ev: HashRushEvent) {
    renderer.onEvent(ev, round, meId)
    const players = round.players
    const id = typeof ev.id === 'number' ? ev.id : -1
    const by = typeof ev.by === 'number' ? ev.by : -1
    if (ev.type === 'count') {
      big(String(ev.n))
      audio.play.count()
    } else if (ev.type === 'go') {
      big(String(t('go')))
      audio.play.go()
    } else if (ev.type === 'swing') {
      // This hamster's own swing was already heard and felt when the button went down.
      if (id === meId && performance.now() / 1000 - swungAt > OWN_SWING_HEARD_S) {
        audio.play.swing()
        buzz.buzz(12)
      }
    } else if (ev.type === 'bonk') {
      audio.play.bonk()
      // Felt in the hand: a thump for a bonk landed, a longer rattle for one taken.
      if (by === meId) buzz.buzz(35)
      if (id === meId) buzz.buzz([70, 50, 110])
      if (players[by] && players[id]) feed(nameTag(players[by]), ev.seed ? ` 🌻${t('bonkWord')} ` : ` ${t('bonkWord')} `, nameTag(players[id]))
      if (ev.seed && id === meId) banner(t('lostSeed'))
      if (ev.close && players[by]) {
        callout(players[by], [t('superPlay')])
        audio.play.superplay()
      }
    } else if (ev.type === 'zap') {
      // The map got somebody: a pit or a cannon.
      audio.play.zap()
      if (id === meId) buzz.buzz([70, 50, 110])
      if (players[id]) feed(ev.kind === 'trap' ? '🕳️ ' : '💥 ', nameTag(players[id]))
      if (ev.seed && id === meId) banner(t('lostSeed'))
    } else if (ev.type === 'omen') {
      audio.play.omen()
    } else if (ev.type === 'cannon' || ev.type === 'throw') {
      audio.play.toss()
    } else if (ev.type === 'splash') {
      audio.play.splash()
    } else if (ev.type === 'multi') {
      const names = t('killNames') as string[]
      const n = typeof ev.n === 'number' ? ev.n : 2
      const name = names[Math.min(n, names.length + 1) - 2]
      // Three at once is a super play in its own right.
      if (players[by]) callout(players[by], n >= 3 ? [name, t('superPlay')] : [name])
      if (n >= 3) audio.play.triple()
      else audio.play.double()
    } else if (ev.type === 'spawn' || ev.type === 'warp') {
      if (id === meId) audio.play.spawn()
    } else if (ev.type === 'seed') {
      audio.play.seed()
      if (id === meId) buzz.buzz([20, 40, 20])
      const mate = meId >= 0 && !!players[meId] && !!players[id] && allied(players[meId], players[id])
      if (players[id]) banner(id === meId ? t('gotSeedMe') : t(mate ? 'gotSeedMate' : 'gotSeedOther', players[id].name))
    } else if (ev.type === 'overtime') {
      audio.play.overtime()
      banner(t('overtime'))
    } else if (ev.type === 'rush') {
      audio.play.overtime()
      banner(t('rush'))
    } else if (ev.type === 'win') {
      const won = (p: HashRushPlayer) => round.winners.includes(p.id)
      // A team wins together: everyone on it gets the win.
      for (const p of players) if (won(p)) wins[p.look] = (wins[p.look] || 0) + 1
      if (meId < 0 || !players[meId] || won(players[meId])) audio.play.win()
      else audio.play.lose()
      inputWanted = false
      syncInput()
      window.clearTimeout(resultTimer)
      resultTimer = window.setTimeout(() => showResult(round), RESULT_AFTER_MS)
    }
  }

  // ---------- every frame ----------

  // Draws this hamster where its inputs have taken it by now, ahead of the
  // snapshot, which only knows the ones that had reached the server.
  function playAhead(round: HashRushRound, at: number) {
    const snap = session.snap
    if (!snap || !snap.p[meId]) return
    const me = round.players[meId]
    readPlayerRow(me, snap.p[meId])
    mine = viewAhead(at, round, meId, laneHelpMemory(snap, meId))
    if (mine) Object.assign(me, mine)
    // The swing is heard and felt as the button goes down, not when the server says so.
    const now = !!(mine && mine.swing)
    if (now && !swinging) {
      audio.play.swing()
      buzz.buzz(12)
      swungAt = at
    }
    swinging = now
  }

  // Tells everyone, once per carry, when a seed is about to reach home.
  function watchCarrier(round: HashRushRound) {
    const p = round.phase === 'playing' ? round.players.find((c) => nearHome(round, c)) : undefined
    const key = p ? `${p.id}:${p.seeds}` : ''
    if (p && key !== alarmKey) {
      const mate = meId >= 0 && !!round.players[meId] && allied(round.players[meId], p)
      banner(p.id === meId ? t('alarmMe') : t(mate ? 'alarmMate' : 'alarmOther', p.name), true)
      audio.play.siren()
    }
    // Stepping back out and in again does not repeat it; a new seed does.
    if (key || !round.players.some((c) => c.carrying)) alarmKey = key
  }

  function updateHud(round: HashRushRound) {
    watchCarrier(round)
    const me = meId >= 0 && round.phase === 'playing' ? round.players[meId] : null
    // The throw button is only there while this player has a seed to throw.
    el.throwButton.hidden = !(me && me.carrying)
    // The bonk button shows the wait for the next swing, and that there is none at home.
    const cool = me ? Math.ceil((me.cooldown / BONK.cooldown) * 24) / 24 : 0
    if (cool !== bonkCool) {
      bonkCool = cool
      el.bonk.style.setProperty('--cool', String(cool))
    }
    const off = !!me && inHome(round, me)
    if (off !== bonkOff) {
      bonkOff = off
      el.bonk.classList.toggle(classes.off, off)
    }
    // Stepping onto a portal with a seed does nothing; say why, once per visit.
    const onPortal = !!me && me.carrying && round.map.warps.some((w: { x: number, y: number, r: number }) => Math.hypot(me.x - w.x, me.y - w.y) <= w.r)
    if (onPortal && !portalSaid) banner(t('portalNoSeed'), true)
    portalSaid = onPortal
    const key = round.players.map((p) => `${p.carrying ? 1 : 0}${wins[p.look] || 0}`).join()
    if (key !== scoreKey) {
      scoreKey = key
      el.scores.classList.toggle(classes.scoresMany, round.players.length > 4)
      el.scores.replaceChildren(
        ...[...round.players].sort((a, b) => a.team - b.team).map((p) => {
          const chip = document.createElement('span')
          chip.className = [classes.chip, p.id === meId ? classes.chipMe : '', p.carrying ? classes.chipCarry : ''].filter(Boolean).join(' ')
          chip.style.setProperty('--c', colorOf(p))
          const dot = document.createElement('i')
          dot.className = classes.chipDot
          const name = document.createElement('span')
          name.textContent = (p.carrying ? '🌻 ' : '') + p.name
          const tally = document.createElement('small')
          tally.textContent = String(t('tally', wins[p.look] || 0))
          chip.append(dot, name, tally)
          return chip
        }),
      )
    }
    const seconds = Math.floor(round.time)
    const overtime = round.time > OVERTIME.start
    // The clock is heard ticking all through overtime, twice a second.
    const beat = overtime && round.phase === 'playing' ? Math.floor(round.time * 2) : -1
    if (beat !== tickBeat) {
      tickBeat = beat
      if (beat >= 0) audio.play.tick(beat % 2)
    }
    const clock = `${overtime ? `${t('overtimeClock')} ` : ''}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    if (clock !== clockKey) {
      clockKey = clock
      el.clock.textContent = clock
      el.clock.classList.toggle(classes.clockOvertime, overtime)
    }
  }

  // The buttons lie over the map. Whenever a hamster runs under one it fades by
  // half on a phone (the buttons are the only way to play there), so nobody loses
  // sight of a hamster behind it. Once the round is over they stay clear.
  function fadeOverHamsters(round: HashRushRound) {
    const over = round.phase === 'over'
    el.stage.classList.toggle(classes.ended, over)
    if (over) {
      for (const node of el.overMap) node.classList.remove(classes.under)
      return
    }
    const spots = round.players.map((p) => renderer.toScreen(p.x, p.y))
    for (const node of el.overMap) {
      const r = node.getBoundingClientRect()
      const under = r.width > 0 && spots.some(({ x, y, unit }: { x: number, y: number, unit: number }) => {
        const pad = 22 * unit
        return x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad
      })
      node.classList.toggle(classes.under, under)
    }
  }

  function frame(now: number) {
    raf = window.requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - lastFrame) / 1000)
    lastFrame = now
    const round = game
    if (!round) return
    const at = performance.now() / 1000
    if (meId >= 0 && line && round.players[meId]) {
      const read = input.read(round, meId)
      const message = nextInput(read, at)
      if (message) predictor.sent(at, message)
      playAhead(round, at)
    }
    others.draw(round, meId, at, dt)
    // Out of sight the round goes on; it is only not drawn.
    if (!visible || document.hidden) return
    renderer.draw(round, { dt, meId, bubbles })
    updateHud(round)
    if (now - fadedAt > FADE_CHECK_EVERY_MS) {
      fadedAt = now
      fadeOverHamsters(round)
    }
  }

  // A change goes out at once, otherwise once a tick (protocol.ts).
  function nextInput(read: typeof IDLE_INPUT_READ, at: number) {
    const message = nextInputMessage(inputState, read, at)
    if (message && line) line.fast(message)
    return message
  }

  // Stops this hamster at once (the game went out of sight): no frame may come for a while.
  function standStill() {
    if (!line || meId < 0 || !game) return
    const at = performance.now() / 1000
    const message = nextInput(IDLE_INPUT_READ, at)
    if (message) predictor.sent(at, message)
  }

  // ---------- the line's quality ----------

  async function checkLine() {
    const current = line
    if (!current || document.hidden || !visible) return
    const route = await current.route()
    if (destroyed || current !== line) return
    el.ping.hidden = !route
    if (!route) return
    const ms = route.ms || Math.round((predictor.lag() || 0) * 1000)
    el.ping.textContent = ms ? `📶 ${ms}ms` : '📶'
    el.ping.classList.toggle(classes.pingSlow, route.ms >= 150)
  }

  // ---------- sound ----------

  const tryUnlock = () => {
    audio.unlock()
    if (audio.ready()) for (const type of TAP_EVENTS) window.removeEventListener(type, tryUnlock, true)
  }

  // Sound waits for a tap; coming back into sight or a voice talk starting or
  // ending can leave it asleep the same way, so it is woken now or by the next tap.
  function wakeSound() {
    if (destroyed || audio.ready()) return
    for (const type of TAP_EVENTS) window.addEventListener(type, tryUnlock, true)
    tryUnlock()
  }

  // ---------- page events ----------

  // Mashing the bonk button must never count as a double tap.
  el.bonk.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false, signal: listening.signal })
  window.addEventListener('resize', () => renderer.resize(), { signal: listening.signal })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      input.reset()
      standStill()
      return
    }
    lastFrame = performance.now()
    wakeSound()
  }, { signal: listening.signal })
  const lineCheck = window.setInterval(() => void checkLine(), LINE_CHECK_EVERY_MS)

  return {
    start() {
      if (destroyed || raf) return
      show({ kind: 'connecting', again: false })
      lastFrame = performance.now()
      raf = window.requestAnimationFrame(frame)
      wakeSound()
      audio.setMusic('lobby')
      void connect(0, false)
    },
    retry() {
      if (destroyed || line || connecting) return
      window.clearTimeout(retryTimer)
      show({ kind: 'connecting', again: false })
      void connect(0, true)
    },
    setVisible(next) {
      if (visible === next) return
      visible = next
      audio.setAway(!next)
      if (next) {
        lastFrame = performance.now()
        wakeSound()
        renderer.resize()
      }
      syncInput()
      if (!next) standStill()
    },
    setVoice(active) {
      audio.setVoice(active)
      wakeSound()
    },
    toggleSound() {
      audio.unlock()
      audio.toggle()
      return audio.muted()
    },
    soundOff: () => audio.muted(),
    resize() {
      renderer.resize()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      window.cancelAnimationFrame(raf)
      window.clearTimeout(retryTimer)
      window.clearTimeout(resultTimer)
      window.clearTimeout(bannerTimer)
      window.clearInterval(lineCheck)
      listening.abort()
      for (const type of TAP_EVENTS) window.removeEventListener(type, tryUnlock, true)
      input.destroy()
      audio.dispose()
      const current = line
      line = null
      current?.close()
    },
  }
}
