// Hash Rush in a chat room: this viewer's side of the room's game on the game
// server, played in the app's own page. It is the guest path of hash-rush's
// main.js (enterRoom, hostData, tick, playAhead, updateHud, onEvent) on the
// copied engine, with the DOM handed in by HashRushGame.tsx. The server runs
// the round; this sends the inputs, plays this viewer's own hamster a little
// ahead (engine/client/predict.js) and draws the snapshots.
//
// Between rounds it tells the component what to show (HashRushCards.tsx): the
// lobby with who is in, the countdown to the next round and the way to watch
// or join, then after a round its result with the score table, or the title
// card when the round decided the title. The room is the server's, with no
// host: every round starts by itself, and the cards say when.
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
import { colorOf, lookOf, LOOKS, TEAMS } from './engine/client/looks.js'
import { drawAvatar, drawTrophy } from './engine/client/cards.js'
import { setLanguage, t } from './engine/client/i18n.js'
import { joinServerRoom } from './engine/client/net.js'
import {
  IDLE_INPUT_READ,
  SIT_MESSAGE,
  STAND_MESSAGE,
  applySnapshot,
  createOthersSmoother,
  helloMessage,
  initialInputState,
  isSnapshot,
  laneHelpMemory,
  nextInputMessage,
  readLobby,
  readOver,
  readPlayerRow,
  readStart,
  shouldTakeSeat,
  type HashRushEvent,
  type HashRushLobby,
  type HashRushPlayer,
  type HashRushRound,
  type HashRushSession,
  type HashRushTitleRule,
} from './protocol'
import {
  PLAYED,
  buildScoreboard,
  isDeuce,
  roundOf,
  titleOf,
  verdictOf,
  type HashRushRecord,
  type HashRushScoreboard,
  type HashRushTitleWords,
  type HashRushVerdict,
} from './score'
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

/** A person in a seat, as the lobby card lists them. */
export type HashRushLobbySeat = {
  seat: number
  name: string
  /** -1 in a free-for-all. */
  team: number
  color: string
  me: boolean
  winsText: string
  /** Just came in: the row glows for a moment (UIUX-ISSUES #141). */
  fresh: boolean
}

/** Between rounds: who is in, what is next, and the way to watch or join. */
export type HashRushLobbyView = {
  kind: 'lobby'
  /** "🌻 Meadow · Free-for-all" (#35: team or not, plain to see). */
  mode: string
  seats: HashRushLobbySeat[]
  /** Free seats. */
  open: number
  /** Computers the next round brings in to fill seats. */
  bots: number
  /** "👀 2 watching: …", '' when nobody is. */
  spectators: string
  /** This viewer's seat, -1 while watching. */
  you: number
  /** Watching by their own choice: no seat is taken for them. */
  chose: boolean
  canSit: boolean
  canStand: boolean
  /** When the next round starts (Date.now() time), 0 when none is coming or the server does not say. */
  nextAt: number
  race: string
  deuce: boolean
  /** The last title won in the room, '' before the first. */
  lastTitle: string
  words: { sitIn: string, standUp: string, me: string, spectating: string }
}

/** What the component shows over the game. */
export type HashRushGameView =
  | { kind: 'connecting', again: boolean }
  | { kind: 'failed', reason: 'ticket' | 'connect' }
  | HashRushLobbyView
  | {
      kind: 'round'
      round: number
      /** This viewer has no hamster in this round. */
      watcher: boolean
      /** ...but a seat, and plays from the next one. */
      seated: boolean
      canSit: boolean
      sitIn: string
    }
  | {
      kind: 'result'
      round: number
      verdict: HashRushVerdict
      board: HashRushScoreboard
      nextAt: number
      /** When the card first came up (performance.now()), for taps meant for something else. */
      at: number
    }
  | {
      kind: 'title'
      round: number
      words: HashRushTitleWords
      board: HashRushScoreboard
      nextAt: number
      at: number
    }

/** Faces and the trophy for the cards, drawn by the engine. */
export const hashRushArt = {
  face(canvas: HTMLCanvasElement, seat: number, team: number, size?: number) {
    drawAvatar(canvas, lookOf({ look: seat % LOOKS.length, team: team >= 0 && TEAMS[team] ? team : -1 }), size)
  },
  trophy(canvas: HTMLCanvasElement, timeSec: number, wins: number) {
    drawTrophy(canvas, timeSec, wins)
  },
}

export type HashRushArt = typeof hashRushArt

// The page's picture for each map.
const MAP_ICONS: Record<string, string> = { meadow: '🌻', desert: '🌵', factory: '🏭', ice: '🧊', beach: '🏖️', graveyard: '👻', sky: '☁️' }

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
  /** Takes a free seat: in the lobby for the next round, mid-round from the one after. */
  sit(): void
  /** Gives the seat up to watch (not mid-round). No seat is taken for them until they sit again. */
  stand(): void
  /** The score table of the round on screen, null between rounds. */
  scoreboard(): HashRushScoreboard | null
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
// How long a newcomer's row glows in the lobby.
const FRESH_MS = 4_000
const blankCareer = () => [0, 0, 0, 0, 0, 0, 0, 0]
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
  // The room's record, as the server last said it (lobby, start, over).
  const wins: number[] = []
  let careers: number[][] = []
  let rounds = 0
  // The careers already have the round on screen in them.
  let counted = false
  let rule: HashRushTitleRule | null = null
  // The round on screen decided the title (the server's word).
  let champ = false
  // When the next round starts (Date.now() time), 0 when not known.
  let nextAt = 0
  // Chose to watch: no seat is taken for this viewer until they sit again.
  let watchWanted = false
  // The card up after a round, and when it first came up.
  let card: 'none' | 'result' | 'title' = 'none'
  let cardAt = 0
  // Seats somebody just came into, until when they glow.
  const freshUntil = new Map<number, number>()
  let freshTimer = 0
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

  // The record as the server says it. A server from before the totals sends
  // none (protocol.ts), and then the ones counted here stand.
  function takeRecord(said: { wins: number[], careers: number[][], rounds: number }) {
    wins.length = 0
    said.wins.forEach((n, i) => (wins[i] = n))
    if (said.careers.length) careers = said.careers.map((c) => [...c])
    rounds = said.rounds
  }

  function hear(message: unknown) {
    if (destroyed || !message || typeof message !== 'object') return
    const type = (message as { t?: unknown }).t
    if (type === 'lobby') {
      const next = readLobby(message)
      if (!next) return
      markFresh(lobby, next)
      lobby = next
      // Mid-round the round on screen is not in these yet; after it, it is.
      takeRecord(next)
      if (next.title) rule = next.title
      nextAt = next.nextInMs >= 0 ? Date.now() + next.nextInMs : 0
      // Somebody who opens the game came to play: a spectator sits in the first
      // free seat, unless they chose to watch.
      if (shouldTakeSeat(next, watchWanted) && performance.now() - sitAskedAt > SIT_EVERY_MS) {
        sitAskedAt = performance.now()
        line?.send(SIT_MESSAGE)
      }
      if (!game) showLobby()
      else if (card === 'none') showRound()
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
      takeRecord(started)
      counted = false
      champ = false
      game = started.game
      meId = started.you
      renderer.setMap(game.map)
      enterStage()
    } else if (type === 's') {
      if (game && isSnapshot(message)) takeSnapshot(game, message)
    } else if (type === 'over') {
      const over = readOver(message)
      if (!over || !game || over.round !== session.round) return
      takeRecord(over)
      counted = true
      champ = over.champ
      if (over.title) rule = over.title
      nextAt = over.nextInMs >= 0 ? Date.now() + over.nextInMs : 0
      // A card already up shows the record with the round in it.
      if (card !== 'none') showResult(game)
    } else if (type === 'lobbyscreen') {
      toLobby()
      showLobby()
    }
    // 'chat' and 'rename' are the game's own talk: in the app the talk is the room's.
  }

  // A seat somebody new has just come into glows for a moment, so everyone sees
  // who arrived. The first lobby is everyone already there, not newcomers.
  function markFresh(before: HashRushLobby | null, next: HashRushLobby) {
    if (!before) return
    const now = performance.now()
    next.seats.forEach((seat, i) => {
      const was = before.seats[i]
      const arrived = seat.kind === 'remote' && i !== next.you && (!was || was.kind !== 'remote' || was.name !== seat.name)
      if (arrived) freshUntil.set(i, now + FRESH_MS)
      else if (seat.kind !== 'remote') freshUntil.delete(i)
    })
    window.clearTimeout(freshTimer)
    const soonest = Math.min(...freshUntil.values())
    if (Number.isFinite(soonest)) freshTimer = window.setTimeout(() => !game && showLobby(), Math.max(0, soonest - now) + 50)
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

  function record(): HashRushRecord {
    return { wins, careers, rounds, counted, rule }
  }

  function seatColor(teams: boolean, team: number, seat: number) {
    return teams && TEAMS[team] ? TEAMS[team].color : LOOKS[seat % LOOKS.length].color
  }

  // Between rounds: who is in, the countdown, and the way to watch or to join.
  function showLobby() {
    if (!line) return
    const at = lobby
    const seats = at?.seats ?? []
    const you = at ? at.you : -1
    const teams = !!at?.teams
    const now = performance.now()
    const people = seats
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat }) => seat.kind === 'remote')
      .map(({ seat, index }) => ({
        seat: index,
        name: seat.name,
        team: teams ? seat.team : -1,
        color: seatColor(teams, seat.team, index),
        me: index === you,
        winsText: String(t('tally', wins[index] || 0)),
        fresh: (freshUntil.get(index) ?? 0) > now,
      }))
    const open = seats.filter((seat) => seat.kind === 'open').length
    const map = at?.map ?? 'meadow'
    // The race as the seats stand: everyone seated and any seat with wins in it.
    const sides = seats
      .map((seat, index) => ({ id: index, look: index, team: teams ? seat.team : -1, kind: seat.kind }))
      .filter((p) => p.kind === 'remote' || (wins[p.look] || 0) > 0) as unknown as HashRushPlayer[]
    const deuce = isDeuce(sides, wins, rule)
    const race = rule ? String(deuce ? t('deuce', rule.lead) : t('firstTo', rule.wins)) : ''
    const season = at?.seasons.at(-1)
    const champs = season?.rows.filter((row) => row.champ) ?? []
    const names = at?.spectators ?? []
    show({
      kind: 'lobby',
      mode: `${MAP_ICONS[map] ?? '🌻'} ${(t('mapNames') as Record<string, string>)[map] ?? map} · ${t(teams ? 'modeTeam' : 'modeSolo')}`,
      seats: people,
      open,
      bots: people.length && at?.fill ? Math.max(0, at.fill - people.length) : 0,
      spectators: names.length ? `👀 ${t('spectators', names.length)}: ${names.join(', ')}` : '',
      you,
      chose: watchWanted,
      canSit: you < 0 && open > 0,
      canStand: you >= 0,
      nextAt,
      race,
      deuce,
      lastTitle: champs.length ? `🏆 ${champs.map((row) => row.name).join(', ')} · ${t('tally', champs[0].wins)}` : '',
      words: { sitIn: String(t('sitIn')), standUp: String(t('standUp')), me: String(t('meTag')), spectating: String(t('spectating')) },
    })
  }

  function showRound() {
    const seated = !!lobby && lobby.you >= 0
    show({
      kind: 'round',
      round: session.round,
      watcher: meId < 0,
      seated,
      canSit: !seated && !!lobby && lobby.seats.some((seat) => seat.kind === 'open'),
      sitIn: String(t('sitIn')),
    })
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
    card = 'none'
    showRound()
  }

  function toLobby() {
    window.clearTimeout(resultTimer)
    inputWanted = false
    syncInput()
    game = null
    meId = -1
    mine = null
    card = 'none'
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

  // The round's result, with the score table; or, when the round decided the
  // title (the server's word), the title card with its fanfare.
  function showResult(round: HashRushRound) {
    if (game !== round) return
    const board = buildScoreboard(round, meId, record())
    const words = champ ? titleOf(round, meId, record()) : null
    if (card === 'none') cardAt = performance.now()
    if (words) {
      if (card !== 'title') {
        audio.setMusic(null)
        audio.play.fanfare()
        audio.play.cheer()
      }
      card = 'title'
      show({ kind: 'title', round: session.round, words, board, nextAt, at: cardAt })
      return
    }
    card = 'result'
    show({ kind: 'result', round: session.round, verdict: verdictOf(round, meId), board, nextAt, at: cardAt })
  }

  // A round's numbers go into the totals once, when it is won (main.js addCareer).
  // The server's `over` says the same right after, and its word stands.
  function countRound(round: HashRushRound) {
    if (counted) return
    counted = true
    rounds += 1
    for (const p of round.players) {
      const c = careers[p.look] ?? (careers[p.look] = blankCareer())
      roundOf(round, p).forEach((v, k) => (c[k] = (c[k] || 0) + v))
      c[PLAYED] = (c[PLAYED] || 0) + 1
    }
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
      if (!counted) for (const p of players) if (won(p)) wins[p.look] = (wins[p.look] || 0) + 1
      countRound(round)
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
    sit() {
      if (destroyed || !line) return
      watchWanted = false
      sitAskedAt = performance.now()
      line.send(SIT_MESSAGE)
    },
    stand() {
      // The server does not let a seat go mid-round: the round needs its hamster.
      if (destroyed || !line || (game && game.phase !== 'over')) return
      watchWanted = true
      line.send(STAND_MESSAGE)
    },
    scoreboard() {
      return game ? buildScoreboard(game, meId, record()) : null
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
      window.clearTimeout(freshTimer)
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
