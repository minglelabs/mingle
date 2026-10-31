// The Hash Rush game server's messages as the app's game hears and speaks them.
//
// The game server (hash-rush server/room.js) plays the host's part of the web
// page's own protocol (hash-rush src/client/main.js), so the app joins a room
// the way the page does:
//   app -> server  { t: 'hello', name, watch, pw, pid }   once the line is up
//                  { t: 'i', n, mx, my, ax, ay, seq, th, sk }   inputs, numbered
//                  { t: 'sit' }   a spectator takes a free seat
//                  { t: 'stand' }   a player gives up the seat to watch (not mid-round)
//   server -> app  { t: 'lobby', slots, spect, teams, map, you, wins, tot, rd, hist, nx, fill, title }
//                  { t: 'start', g, map, players, you, wins, tot, rd, ... }   a round
//                  { t: 's', g, k, ak, st, ph, cd, tm, hx, nb, w, ws, to, p, hz, ev }
//                  { t: 'over', g, wins, tot, rd, champ, nx, title }   right after a round's last snapshot
//                  { t: 'lobbyscreen' }   the round is over, back to the lobby
// (`chat`, `rename` and pings are the line's business or not the app's.)
//
// Nobody is the host of a server room: it starts every round by itself. `nx`
// says how long until the next one starts (ms, -1 when none is coming), `fill`
// how many hamsters a round has at least (computers take the empty seats) and
// `title` the race to the title. A server from before these (no `over`, no
// `nx`) still plays: the app then shows no countdown and no title.
//
// No DOM here, so it can be tested on its own. client.ts puts it to work.

import { COUNTDOWN, DT, HAMSTER_R } from './engine/sim/constants.js'
import { MAP, MAPS } from './engine/sim/map.js'
import { LANGUAGES, stringsFor, t } from './engine/client/i18n.js'

export type HashRushMap = typeof MAP

export type HashRushSeat = {
  /** 'remote' (a person), 'open' (free), or a computer such as 'bot:hard'. */
  kind: string
  name: string
  team: number
  /** The mingle user in the seat (from their ticket), '' otherwise. */
  userId: string
}

/** The race to the title: the first to `wins` wins, `lead` clear of every other side. */
export type HashRushTitleRule = { wins: number, lead: number }

/** A title won in this room (the page's "past championships"). */
export type HashRushSeason = {
  games: number
  stopped: boolean
  rows: { name: string, look: number, wins: number, champ: boolean }[]
}

export type HashRushLobby = {
  seats: HashRushSeat[]
  spectators: string[]
  teams: boolean
  map: string
  /** This viewer's seat, -1 while watching. */
  you: number
  wins: number[]
  /** Each seat's totals: [bonks, bonked, seeds, goals, supers, throws, stops, rounds played]. */
  careers: number[][]
  rounds: number
  /** How long until the next round starts, -1 when none is coming or the server does not say. */
  nextInMs: number
  /** A round has at least this many hamsters (computers fill the seats), 0 when the server does not say. */
  fill: number
  title: HashRushTitleRule | null
  seasons: HashRushSeason[]
}

export type HashRushSwing = { phase: string, t: number, dx: number, dy: number }

export type HashRushPlayer = {
  id: number
  name: string
  look: number
  team: number
  kind: string
  nest: { x: number, y: number }
  x: number
  y: number
  vx: number
  vy: number
  fx: number
  fy: number
  carrying: boolean
  gather: number
  queued: number
  swing: HashRushSwing | null
  cooldown: number
  kills: number
  deaths: number
  seeds: number
  supers: number
  charge: number
  throws: number
  wet: number
  stops: number
  dazed: number
  pid: string
  pub: string
}

export type HashRushHazard = { kind: string, x: number, y: number, dx: number, dy: number, age: number }

/** A round as a viewer draws it: only what the snapshots carry. */
export type HashRushRound = {
  map: HashRushMap
  hazards: HashRushHazard[]
  phase: string
  countdown: number
  time: number
  homeX: number
  nibbler: number
  winner: number | null
  winners: number[]
  timeout: boolean
  players: HashRushPlayer[]
}

export type HashRushEvent = { type: string, [field: string]: unknown }

/** A player in a snapshot: [x, y, vx, vy, fx, fy, carrying, gather, queued, swing, cooldown, kills, deaths, seeds, supers, charge, throws, wet, stops, dazed]. */
export type HashRushPlayerRow = unknown[]

export type HashRushSnapshot = {
  t: 's'
  g: number
  k: number
  ak?: number[]
  /** What the server's lane help remembers per player: [lx, ly, at, px, py, turn] or 0. */
  st?: (number[] | 0)[]
  ph: string
  cd: number
  tm: number
  hx: number
  nb: number
  w: number | null
  ws?: number[]
  to?: boolean
  p: HashRushPlayerRow[]
  hz?: unknown[][]
  ev?: HashRushEvent[]
}

/** Where a viewer stands with the room's rounds (main.js's `net.round`, `net.tick`, `net.snap`). */
export type HashRushSession = {
  round: number
  tick: number
  snap: HashRushSnapshot | null
}

export type HashRushInputRead = {
  mx: number
  my: number
  ax?: number
  ay?: number
  bonk: boolean
  throw: boolean
  stick: boolean
}

export type HashRushInputMessage = {
  t: 'i'
  n: number
  mx: number
  my: number
  ax: number
  ay: number
  seq: number
  th: 0 | 1
  sk: 0 | 1
}

export type HashRushInputState = {
  /** Bonk presses so far; a new count is one press to the server. */
  bonkSeq: number
  bonkWas: boolean
  sent: HashRushInputMessage | null
  sentAt: number
}

const MAP_BY_ID = MAPS as Record<string, HashRushMap>
const record = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const text = (value: unknown, max = 8): string => (typeof value === 'string' ? value.slice(0, max) : '')

// ---------------------------------------------------------------------------
// Names: a computer goes by its default name in this viewer's language (the
// server sends the English ones), a person by their own.
// ---------------------------------------------------------------------------

const PEOPLE_KINDS = new Set(['human', 'remote', 'open', 'closed'])
let defaultNames: Map<string, number> | null = null

function defaultNameIndex(): Map<string, number> {
  if (defaultNames) return defaultNames
  const names = new Map<string, number>()
  for (const code of LANGUAGES) {
    const list = (stringsFor(code) as { names?: unknown }).names
    if (!Array.isArray(list)) continue
    list.forEach((name, index) => {
      if (typeof name === 'string' && !names.has(name)) names.set(name, index)
    })
  }
  defaultNames = names
  return names
}

/** A default hamster name ("Cloud", "구름") in the strings' current language; any other name as it is. */
export function localHamsterName(name: string): string {
  const index = defaultNameIndex().get(name)
  if (index === undefined) return name
  const names = t('names') as unknown
  return Array.isArray(names) && typeof names[index] === 'string' ? names[index] : name
}

const isComputer = (kind: string) => kind.startsWith('bot')

// ---------------------------------------------------------------------------
// app -> server
// ---------------------------------------------------------------------------

/** The first word on a new line. `pid` lets the server replace this game's own stale line. */
export function helloMessage(input: { name: string, pid: string }) {
  return { t: 'hello' as const, name: input.name.slice(0, 8), watch: false, pw: '', pid: input.pid }
}

export const SIT_MESSAGE = { t: 'sit' as const }

/** Gives the seat up to watch; the server keeps the record in the seat for when they sit again. */
export const STAND_MESSAGE = { t: 'stand' as const }

const INPUT_KEYS = ['mx', 'my', 'ax', 'ay', 'seq', 'th', 'sk'] as const

export function initialInputState(): HashRushInputState {
  return { bonkSeq: 0, bonkWas: false, sent: null, sentAt: 0 }
}

export const IDLE_INPUT_READ: HashRushInputRead = { mx: 0, my: 0, bonk: false, throw: false, stick: false }

/**
 * This frame's input, as main.js sends it: a change goes out at once, otherwise
 * once a tick, which is all the server can use. Inputs are numbered so the
 * server's snapshots can say which one it had (`ak`); the numbers keep counting
 * up for as long as the game lives. Returns the message to send now, or null.
 */
export function nextInputMessage(state: HashRushInputState, read: HashRushInputRead, nowSec: number): HashRushInputMessage | null {
  if (read.bonk && !state.bonkWas) state.bonkSeq += 1
  state.bonkWas = read.bonk
  const message: HashRushInputMessage = {
    t: 'i',
    n: 0,
    mx: read.mx,
    my: read.my,
    ax: read.ax || 0,
    ay: read.ay || 0,
    seq: state.bonkSeq,
    th: read.throw ? 1 : 0,
    sk: read.stick ? 1 : 0,
  }
  const was = state.sent
  const changed = !was || INPUT_KEYS.some((key) => message[key] !== was[key])
  if (!changed && nowSec - state.sentAt <= DT * 0.9) return null
  message.n = was ? was.n + 1 : 1
  state.sent = message
  state.sentAt = nowSec
  return message
}

// ---------------------------------------------------------------------------
// server -> app
// ---------------------------------------------------------------------------

/** The eight numbers of a seat's totals, whatever came (a server from before them sent the rounds played only). */
export function readCareer(raw: unknown): number[] {
  if (Array.isArray(raw)) return Array.from({ length: 8 }, (_, k) => Math.max(0, num(raw[k])))
  return [0, 0, 0, 0, 0, 0, 0, Math.max(0, num(raw))]
}

// A server from before the totals sent each seat's rounds played only: no totals, then.
const readCareers = (raw: unknown): number[][] => (Array.isArray(raw) && raw.length > 0 && raw.every(Array.isArray) ? raw.map(readCareer) : [])
const readWins = (raw: unknown): number[] => (Array.isArray(raw) ? raw.map((n) => num(n)) : [])
const readNextIn = (raw: unknown): number => (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : -1)

function readTitleRule(raw: unknown): HashRushTitleRule | null {
  const rule = record(raw)
  const wins = num(rule?.wins)
  const lead = num(rule?.lead)
  return wins > 0 && lead > 0 ? { wins, lead } : null
}

function readSeasons(raw: unknown): HashRushSeason[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): HashRushSeason[] => {
    const season = record(entry)
    if (!season || !Array.isArray(season.rows)) return []
    const rows = season.rows.flatMap((r) => {
      const row = record(r)
      return row ? [{ name: localHamsterName(text(row.name)), look: num(row.look), wins: num(row.wins), champ: !!row.champ }] : []
    })
    return [{ games: num(season.games), stopped: !!season.stopped, rows }]
  })
}

export function readLobby(message: unknown): HashRushLobby | null {
  const m = record(message)
  if (!m || m.t !== 'lobby' || !Array.isArray(m.slots)) return null
  const seats = m.slots.map((raw): HashRushSeat => {
    const seat = record(raw) ?? {}
    const kind = typeof seat.kind === 'string' ? seat.kind : 'open'
    const name = text(seat.name)
    return {
      kind,
      name: PEOPLE_KINDS.has(kind) ? name : localHamsterName(name),
      team: num(seat.team, -1),
      userId: typeof seat.userId === 'string' ? seat.userId : '',
    }
  })
  return {
    seats,
    spectators: Array.isArray(m.spect) ? m.spect.map((name) => String(name).slice(0, 8)) : [],
    teams: !!m.teams,
    map: typeof m.map === 'string' && MAP_BY_ID[m.map] ? m.map : 'meadow',
    you: Number.isInteger(m.you) ? m.you as number : -1,
    wins: readWins(m.wins),
    careers: readCareers(m.tot),
    rounds: num(m.rd),
    nextInMs: readNextIn(m.nx),
    fill: Math.max(0, Math.floor(num(m.fill))),
    title: readTitleRule(m.title),
    seasons: readSeasons(m.hist),
  }
}

export type HashRushOver = {
  round: number
  wins: number[]
  careers: number[][]
  rounds: number
  /** The round decided the title. */
  champ: boolean
  nextInMs: number
  title: HashRushTitleRule | null
}

/** The server's word on a round just finished, with it counted into the record. */
export function readOver(message: unknown): HashRushOver | null {
  const m = record(message)
  if (!m || m.t !== 'over' || typeof m.g !== 'number') return null
  return {
    round: m.g,
    wins: readWins(m.wins),
    careers: readCareers(m.tot),
    rounds: num(m.rd),
    champ: !!m.champ,
    nextInMs: readNextIn(m.nx),
    title: readTitleRule(m.title),
  }
}

/**
 * A spectator takes the first free seat: somebody who opens the game in their
 * room came to play. Once they choose to watch (`watching`), they are left to.
 */
export function shouldTakeSeat(lobby: HashRushLobby | null, watching = false): boolean {
  return !watching && !!lobby && lobby.you < 0 && lobby.seats.some((seat) => seat.kind === 'open')
}

export type HashRushStart = {
  round: number
  /** This viewer's hamster this round, -1 when watching it. */
  you: number
  wins: number[]
  /** The totals before this round. */
  careers: number[][]
  rounds: number
  game: HashRushRound
}

/** A new round (main.js hostData 'start'): every hamster at its nest, the clock at the countdown. */
export function readStart(message: unknown): HashRushStart | null {
  const m = record(message)
  if (!m || m.t !== 'start' || !Array.isArray(m.players)) return null
  const map = (typeof m.map === 'string' && MAP_BY_ID[m.map]) || MAP
  const players = m.players.map((raw, id): HashRushPlayer | null => {
    const p = record(raw)
    const nest = record(p?.nest)
    if (!p || !nest) return null
    const kind = typeof p.kind === 'string' ? p.kind : ''
    const name = text(p.name)
    const x = num(nest.x)
    const y = num(nest.y)
    return {
      id,
      name: isComputer(kind) ? localHamsterName(name) : name,
      look: num(p.look),
      team: num(p.team, -1),
      kind,
      nest: { x, y },
      x,
      y,
      vx: 0,
      vy: 0,
      fx: 1,
      fy: 0,
      carrying: false,
      gather: 0,
      queued: -1,
      swing: null,
      cooldown: 0,
      kills: 0,
      deaths: 0,
      seeds: 0,
      supers: 0,
      charge: 0,
      throws: 0,
      wet: 0,
      stops: 0,
      dazed: 0,
      pid: typeof p.pid === 'string' ? p.pid : '',
      pub: typeof p.pub === 'string' ? p.pub : '',
    }
  })
  if (players.some((p) => !p)) return null
  return {
    round: num(m.g),
    you: Number.isInteger(m.you) && (m.you as number) < players.length ? m.you as number : -1,
    wins: readWins(m.wins),
    careers: readCareers(m.tot),
    rounds: num(m.rd),
    game: {
      map,
      hazards: [],
      phase: 'countdown',
      countdown: COUNTDOWN,
      time: 0,
      homeX: map.home.x2,
      nibbler: -1,
      winner: null,
      winners: [],
      timeout: false,
      players: players as HashRushPlayer[],
    },
  }
}

/** One hamster as a snapshot has it (main.js readPlayer). */
export function readPlayerRow(p: HashRushPlayer, row: HashRushPlayerRow): void {
  const s = row as number[]
  ;[p.x, p.y, p.vx, p.vy, p.fx, p.fy] = s
  p.carrying = !!s[6]
  p.gather = s[7]
  p.queued = s[8]
  const swing = row[9] as unknown
  p.swing = Array.isArray(swing) ? { phase: swing[0], t: swing[1], dx: swing[2], dy: swing[3] } : null
  p.cooldown = s[10]
  p.kills = s[11]
  p.deaths = s[12]
  p.seeds = s[13]
  p.supers = s[14] ?? 0
  p.charge = s[15] ?? 0
  p.throws = s[16] ?? 0
  p.wet = s[17] ?? 0
  p.stops = s[18] ?? 0
  p.dazed = s[19] ?? 0
}

export function isSnapshot(message: unknown): message is HashRushSnapshot {
  const m = record(message)
  return !!m && m.t === 's' && typeof m.g === 'number' && typeof m.k === 'number' && Array.isArray(m.p)
}

export type HashRushSnapshotResult = {
  /** The snapshot was newer than the last one and now shows. */
  fresh: boolean
  /** Where everyone was drawn before it (for smoothing the others), when fresh. */
  drawn: { x: number, y: number }[] | null
  /** What happened in it: an older snapshot shows nothing, but its events still happened. */
  events: HashRushEvent[]
  /** The last of this viewer's inputs the server had used by then. */
  ack: number
}

/**
 * Takes in a snapshot (main.js hostData 's'). Null when it belongs to another
 * round (one left over, or one of the next round ahead of its start).
 */
export function applySnapshot(game: HashRushRound, session: HashRushSession, snap: HashRushSnapshot, meId: number): HashRushSnapshotResult | null {
  if (snap.g !== session.round) return null
  const events = Array.isArray(snap.ev) ? snap.ev.filter((ev) => !!record(ev) && typeof ev.type === 'string') : []
  const ack = (meId >= 0 && Array.isArray(snap.ak) && num(snap.ak[meId])) || 0
  // Snapshots can overtake each other. An older one has nothing to show.
  if (snap.k < session.tick || snap.p.length !== game.players.length) return { fresh: false, drawn: null, events, ack }
  game.phase = snap.ph
  game.countdown = snap.cd
  game.time = snap.tm
  game.homeX = snap.hx
  game.nibbler = snap.nb
  game.winner = snap.w
  game.hazards = (snap.hz || []).map(([kind, x, y, dx, dy, age]) => ({
    kind: String(kind),
    x: num(x),
    y: num(y),
    dx: num(dx),
    dy: num(dy),
    age: num(age),
  }))
  game.winners = Array.isArray(snap.ws) ? snap.ws : []
  game.timeout = !!snap.to
  const drawn = game.players.map((p) => ({ x: p.x, y: p.y }))
  snap.p.forEach((row, i) => readPlayerRow(game.players[i], row))
  session.snap = snap
  if (snap.k >= 0) session.tick = snap.k
  return { fresh: true, drawn, events, ack }
}

/** What the server's lane help remembered for hamster `id` in the snapshot (predict.js `steer`). */
export function laneHelpMemory(snap: HashRushSnapshot | null, id: number) {
  const m = snap?.st?.[id]
  if (!Array.isArray(m)) return null
  return { lx: m[0], ly: m[1], at: m[2], px: m[3], py: m[4], turn: m[5] === 1 ? 'x' : m[5] === 2 ? 'y' : null }
}

/** Where the room stands: no round, a round on, or its result. */
export function phaseOf(game: HashRushRound | null): 'lobby' | 'round' | 'results' {
  return !game ? 'lobby' : game.phase === 'over' ? 'results' : 'round'
}

// ---------------------------------------------------------------------------
// Everyone else on this viewer's screen (main.js heardOthers / drawOthers).
// Snapshots come about once a frame, but one can be late or lost, and drawing
// each as it lands stops the others dead for a moment and jumps them on. So
// between snapshots they carry on at the speed the last one gave them (a tenth
// of a second at most, never into a wall), and where a new one puts them a
// little elsewhere the gap closes over a few frames. A big jump (a respawn, a
// portal) is taken as it is.
// ---------------------------------------------------------------------------

type OtherTrack = { x: number, y: number, at: number, ox: number, oy: number }

export function createOthersSmoother(isFree: (map: HashRushMap, x: number, y: number, pad: number) => boolean) {
  const others = new Map<number, OtherTrack>()
  return {
    clear() {
      others.clear()
    },
    heard(game: HashRushRound, drawn: { x: number, y: number }[], meId: number, nowSec: number) {
      game.players.forEach((p, id) => {
        if (id === meId) return
        const was = others.get(id)
        const ox = was ? drawn[id].x - p.x : 0
        const oy = was ? drawn[id].y - p.y : 0
        const near = Math.hypot(ox, oy) < 40
        others.set(id, { x: p.x, y: p.y, at: nowSec, ox: near ? ox : 0, oy: near ? oy : 0 })
      })
    },
    draw(game: HashRushRound, meId: number, nowSec: number, dt: number) {
      const ease = Math.exp(-dt / 0.07)
      game.players.forEach((p, id) => {
        const o = others.get(id)
        if (id === meId || !o) return
        const e = Math.min(0.1, nowSec - o.at)
        let x = o.x + p.vx * e
        let y = o.y + p.vy * e
        if (!isFree(game.map, x, y, HAMSTER_R * 0.8)) {
          x = o.x
          y = o.y
        }
        o.ox *= ease
        o.oy *= ease
        p.x = x + o.ox
        p.y = y + o.oy
      })
    },
  }
}
