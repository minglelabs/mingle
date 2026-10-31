import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DT } from './engine/sim/constants.js'
import { createGame, step } from './engine/sim/game.js'
import { MAPS } from './engine/sim/map.js'
import { setLanguage } from './engine/client/i18n.js'
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
  localHamsterName,
  nextInputMessage,
  phaseOf,
  readCareer,
  readLobby,
  readOver,
  readPlayerRow,
  readStart,
  shouldTakeSeat,
  type HashRushRound,
  type HashRushSession,
  type HashRushSnapshot,
} from './protocol'

// The simulation's hamsters and hazards as the server reads them.
type SimPlayer = {
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
  swing: { phase: string, t: number, dx: number, dy: number } | null
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
}
type SimHazard = { kind: string, x: number, y: number, dx?: number, dy?: number, age: number }
const simPlayers = (g: ReturnType<typeof createGame>) => g.players as unknown as SimPlayer[]

// A snapshot made the way the game server makes one (hash-rush server/room.js snapshot()).
function serverSnapshot(g: ReturnType<typeof createGame>, round: number, acks: number[] = [], events: unknown[] = []): HashRushSnapshot {
  const r = (v: number) => Math.round(v * 10) / 10
  const q = (v: number) => Math.round(v * 1000) / 1000
  return {
    t: 's',
    g: round,
    k: g.tick,
    ak: g.players.map((_: unknown, id: number) => acks[id] || 0),
    st: g.players.map(() => 0),
    ph: g.phase,
    cd: g.countdown,
    tm: g.time,
    hx: g.homeX,
    nb: g.nibbler,
    w: g.winner,
    ws: g.winners,
    to: g.timeout,
    p: simPlayers(g).map((p) => [
      r(p.x), r(p.y), r(p.vx), r(p.vy), q(p.fx), q(p.fy), p.carrying ? 1 : 0, q(p.gather), p.queued,
      p.swing ? [p.swing.phase, q(p.swing.t), q(p.swing.dx), q(p.swing.dy)] : 0, q(p.cooldown), p.kills, p.deaths, p.seeds, p.supers, q(p.charge), p.throws, r(p.wet), p.stops, q(p.dazed),
    ]),
    hz: (g.hazards as unknown as SimHazard[]).map((h) => [h.kind, r(h.x), r(h.y), h.dx || 0, h.dy || 0, Math.round(h.age * 100) / 100]),
    ev: events as HashRushSnapshot['ev'],
  }
}

// The `start` the server sends for that round (room.js startMessage()).
function serverStart(g: ReturnType<typeof createGame>, round: number, you: number) {
  return {
    t: 'start',
    g: round,
    map: g.map.id,
    players: simPlayers(g).map((p) => ({ name: p.name, look: p.look, team: p.team, kind: p.kind, nest: p.nest, pid: '', pub: '' })),
    you,
    wins: [1, 0, 2, 0, 0, 0, 0, 0],
    tot: [],
    rd: 3,
    hist: [],
    mid: 'match1',
    at: 1,
  }
}

function serverGame() {
  return createGame({
    map: MAPS.meadow,
    slots: [
      { name: 'Mia', kind: 'remote', look: 0, team: -1 },
      { name: 'Cloud', kind: 'bot:hard', look: 1, team: -1 },
      { name: 'Choco', kind: 'bot:hard', look: 2, team: -1 },
      { name: 'Dusty', kind: 'bot:hard', look: 3, team: -1 },
    ],
    seed: 7,
  })
}

describe('hash rush protocol: names', () => {
  beforeEach(() => setLanguage('ko'))
  afterEach(() => setLanguage('en'))

  it('shows a computer under its default name in the viewer language and a person as they are', () => {
    expect(localHamsterName('Cloud')).toBe('구름')
    expect(localHamsterName('くも')).toBe('구름')
    expect(localHamsterName('Mia')).toBe('Mia')
    const start = readStart(serverStart(serverGame(), 1, 0))
    expect(start?.game.players.map((p) => p.name)).toEqual(['Mia', '구름', '초코', '먼지'])
  })
})

describe('hash rush protocol: app to server', () => {
  it('says hello as a player, under the chat name cut to eight characters', () => {
    expect(helloMessage({ name: 'Christopher', pid: 'abcdefghijklmnop' })).toEqual({
      t: 'hello',
      name: 'Christop',
      watch: false,
      pw: '',
      pid: 'abcdefghijklmnop',
    })
  })

  it('sends a changed input at once and otherwise once a tick, numbered upwards', () => {
    const state = initialInputState()
    const first = nextInputMessage(state, { ...IDLE_INPUT_READ, mx: 1, stick: true }, 10)
    expect(first).toEqual({ t: 'i', n: 1, mx: 1, my: 0, ax: 0, ay: 0, seq: 0, th: 0, sk: 1 })
    // The same input within the tick is not sent again.
    expect(nextInputMessage(state, { ...IDLE_INPUT_READ, mx: 1, stick: true }, 10 + DT * 0.5)).toBeNull()
    // A tick later it goes again, so a lost one is made good.
    expect(nextInputMessage(state, { ...IDLE_INPUT_READ, mx: 1, stick: true }, 10 + DT)).toMatchObject({ n: 2, mx: 1 })
    // A change goes out at once.
    expect(nextInputMessage(state, { ...IDLE_INPUT_READ, my: -1 }, 10 + DT * 1.1)).toMatchObject({ n: 3, mx: 0, my: -1, sk: 0 })
  })

  it('counts a bonk press once however long it is held, and carries the throw', () => {
    const state = initialInputState()
    const press = { ...IDLE_INPUT_READ, bonk: true, ax: 0.6, ay: -0.8 }
    expect(nextInputMessage(state, press, 1)).toMatchObject({ seq: 1, ax: 0.6, ay: -0.8 })
    expect(nextInputMessage(state, press, 1 + DT)).toMatchObject({ seq: 1 })
    nextInputMessage(state, IDLE_INPUT_READ, 1 + DT * 2)
    expect(nextInputMessage(state, press, 1 + DT * 3)).toMatchObject({ seq: 2 })
    expect(nextInputMessage(state, { ...IDLE_INPUT_READ, throw: true }, 1 + DT * 4)).toMatchObject({ th: 1, seq: 2 })
  })
})

describe('hash rush protocol: server to app', () => {
  afterEach(() => setLanguage('en'))

  it('reads the lobby and seats a spectator in the first free seat', () => {
    setLanguage('en')
    const lobby = readLobby({
      t: 'lobby',
      slots: [
        { kind: 'remote', name: 'Mia', team: 0, pid: 'x', userId: 'user-1' },
        { kind: 'open', name: 'Cloud', team: 1, pid: '', userId: '' },
      ],
      spect: ['Noah'],
      teams: false,
      map: 'desert',
      pw: '',
      you: -1,
      wins: [2, 0],
      tot: [[3, 1, 2, 1, 0, 0, 1, 4], [0, 0, 0, 0, 0, 0, 0, 0]],
      rd: 4,
      hist: [{ games: 18, rows: [{ name: 'Cloud', look: 1, wins: 10, champ: true }, { name: 'Mia', look: 0, wins: 6, champ: false }] }],
      nx: 6500,
      fill: 4,
      title: { wins: 10, lead: 2 },
    })
    expect(lobby).toEqual({
      seats: [
        { kind: 'remote', name: 'Mia', team: 0, userId: 'user-1' },
        { kind: 'open', name: 'Cloud', team: 1, userId: '' },
      ],
      spectators: ['Noah'],
      teams: false,
      map: 'desert',
      you: -1,
      wins: [2, 0],
      careers: [[3, 1, 2, 1, 0, 0, 1, 4], [0, 0, 0, 0, 0, 0, 0, 0]],
      rounds: 4,
      nextInMs: 6500,
      fill: 4,
      title: { wins: 10, lead: 2 },
      seasons: [{ games: 18, stopped: false, rows: [{ name: 'Cloud', look: 1, wins: 10, champ: true }, { name: 'Mia', look: 0, wins: 6, champ: false }] }],
    })
    expect(shouldTakeSeat(lobby)).toBe(true)
    expect(shouldTakeSeat({ ...lobby!, you: 0 })).toBe(false)
    expect(shouldTakeSeat({ ...lobby!, seats: [lobby!.seats[0]] })).toBe(false)
    expect(readLobby({ t: 'start' })).toBeNull()
    expect(readLobby({ t: 'lobby', slots: [], map: 'nowhere' })?.map).toBe('meadow')
  })

  it('leaves somebody who chose to watch where they are', () => {
    const lobby = readLobby({ t: 'lobby', slots: [{ kind: 'open', name: 'Me' }], you: -1 })
    expect(shouldTakeSeat(lobby, false)).toBe(true)
    expect(shouldTakeSeat(lobby, true)).toBe(false)
    expect(SIT_MESSAGE).toEqual({ t: 'sit' })
    expect(STAND_MESSAGE).toEqual({ t: 'stand' })
  })

  it('reads a server from before the room said when and what: no countdown, no title, no totals', () => {
    const lobby = readLobby({ t: 'lobby', slots: [{ kind: 'remote', name: 'Mia' }], you: 0, wins: [1], tot: [3, 0, 0], rd: 3, hist: [] })!
    expect(lobby.nextInMs).toBe(-1)
    expect(lobby.fill).toBe(0)
    expect(lobby.title).toBeNull()
    // The older totals were the rounds played only: no totals at all.
    expect(lobby.careers).toEqual([])
    expect(readLobby({ t: 'lobby', slots: [], nx: -1, title: { wins: 0, lead: 2 } })).toMatchObject({ nextInMs: -1, title: null })
  })

  it('reads a seat total whatever shape it came in', () => {
    expect(readCareer([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(readCareer([1, 'x', -3])).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
    expect(readCareer(5)).toEqual([0, 0, 0, 0, 0, 0, 0, 5])
  })

  it('reads the server word on a finished round', () => {
    expect(readOver({ t: 'over', g: 7, wins: [3, 1], tot: [[1, 0, 0, 1, 0, 0, 0, 7], [0, 2, 0, 0, 0, 0, 0, 7]], rd: 7, champ: true, nx: 31000, title: { wins: 10, lead: 2 } })).toEqual({
      round: 7,
      wins: [3, 1],
      careers: [[1, 0, 0, 1, 0, 0, 0, 7], [0, 2, 0, 0, 0, 0, 0, 7]],
      rounds: 7,
      champ: true,
      nextInMs: 31000,
      title: { wins: 10, lead: 2 },
    })
    expect(readOver({ t: 'over', g: 2 })).toMatchObject({ round: 2, champ: false, nextInMs: -1, careers: [], title: null })
    expect(readOver({ t: 'over' })).toBeNull()
    expect(readOver({ t: 'lobby', g: 1 })).toBeNull()
  })

  it('reads the totals a round starts from', () => {
    const start = readStart({ ...serverStart(serverGame(), 4, 0), tot: Array.from({ length: 8 }, () => [1, 1, 0, 0, 0, 0, 0, 2]), rd: 3 })!
    expect(start.careers[0]).toEqual([1, 1, 0, 0, 0, 0, 0, 2])
    expect(start.rounds).toBe(3)
  })

  it('starts a round with every hamster at its nest and this viewer in their seat', () => {
    const g = serverGame()
    const start = readStart(serverStart(g, 5, 0))
    expect(start).not.toBeNull()
    expect(start!.round).toBe(5)
    expect(start!.you).toBe(0)
    expect(start!.wins.slice(0, 3)).toEqual([1, 0, 2])
    expect(start!.game.map).toBe(MAPS.meadow)
    expect(start!.game.phase).toBe('countdown')
    start!.game.players.forEach((p, id) => {
      expect(p.id).toBe(id)
      expect({ x: p.x, y: p.y }).toEqual({ x: g.players[id].nest.x, y: g.players[id].nest.y })
    })
    expect(readStart({ ...serverStart(g, 5, 9) })!.you).toBe(-1)
    expect(readStart({ t: 'start', g: 1, players: [{ name: 'x' }] })).toBeNull()
  })

  it('reads the server snapshots back into the same hamsters the simulation has', () => {
    const g = serverGame()
    const start = readStart(serverStart(g, 2, 0))!
    const game: HashRushRound = start.game
    const session: HashRushSession = { round: 2, tick: -1, snap: null }
    for (let i = 0; i < 400; i++) step(g, [{ mx: 1, my: 0.2, bonk: i % 50 === 0 }, null, null, null])
    const snap = serverSnapshot(g, 2, [41], [{ type: 'swing', id: 0 }])
    expect(isSnapshot(snap)).toBe(true)
    const result = applySnapshot(game, session, snap, 0)
    expect(result?.fresh).toBe(true)
    expect(result?.ack).toBe(41)
    expect(result?.events).toEqual([{ type: 'swing', id: 0 }])
    expect(result?.drawn?.[0]).toEqual({ x: g.players[0].nest.x, y: g.players[0].nest.y })
    expect(session).toMatchObject({ round: 2, tick: g.tick, snap })
    expect(game.phase).toBe(g.phase)
    expect(game.time).toBeCloseTo(g.time, 6)
    game.players.forEach((p, id) => {
      const real = g.players[id]
      expect(p.x).toBeCloseTo(real.x, 0)
      expect(p.y).toBeCloseTo(real.y, 0)
      expect(p.carrying).toBe(real.carrying)
      expect(p.kills).toBe(real.kills)
      expect(p.swing?.phase ?? null).toBe(real.swing?.phase ?? null)
    })
    expect(phaseOf(game)).toBe(g.phase === 'over' ? 'results' : 'round')
    expect(phaseOf(null)).toBe('lobby')
  })

  it('shows nothing of an older snapshot but keeps its events, and drops other rounds', () => {
    const g = serverGame()
    const game = readStart(serverStart(g, 3, 0))!.game
    const session: HashRushSession = { round: 3, tick: 120, snap: null }
    const older = serverSnapshot(g, 3, [], [{ type: 'bonk', by: 1, id: 0 }])
    older.k = 100
    const x = game.players[0].x
    const result = applySnapshot(game, session, older, 0)
    expect(result).toMatchObject({ fresh: false, drawn: null, events: [{ type: 'bonk', by: 1, id: 0 }] })
    expect(game.players[0].x).toBe(x)
    expect(session.tick).toBe(120)
    expect(applySnapshot(game, session, { ...older, g: 4, k: 200 }, 0)).toBeNull()
  })

  it('reads a snapshot row, a swing and older rows without the late fields', () => {
    const p = readStart(serverStart(serverGame(), 1, 0))!.game.players[0]
    readPlayerRow(p, [10, 20, 1, 2, 0.6, 0.8, 1, 0.5, 2, ['windup', 0.1, 1, 0], 0.4, 3, 1, 2])
    expect(p).toMatchObject({ x: 10, y: 20, vx: 1, vy: 2, fx: 0.6, fy: 0.8, carrying: true, gather: 0.5, queued: 2, cooldown: 0.4, kills: 3, deaths: 1, seeds: 2 })
    expect(p.swing).toEqual({ phase: 'windup', t: 0.1, dx: 1, dy: 0 })
    expect([p.supers, p.charge, p.throws, p.wet, p.stops, p.dazed]).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('reads what the server lane help remembered', () => {
    const snap = { st: [[1, 2, 0.5, 3, 4, 1], 0, [0, 0, 0, 0, 0, 2]] } as unknown as HashRushSnapshot
    expect(laneHelpMemory(snap, 0)).toEqual({ lx: 1, ly: 2, at: 0.5, px: 3, py: 4, turn: 'x' })
    expect(laneHelpMemory(snap, 1)).toBeNull()
    expect(laneHelpMemory(snap, 2)?.turn).toBe('y')
    expect(laneHelpMemory(null, 0)).toBeNull()
  })
})

describe('hash rush protocol: the others between snapshots', () => {
  function round(): HashRushRound {
    return readStart(serverStart(serverGame(), 1, 0))!.game
  }

  it('carries the others on at their speed for a tenth of a second at most, never into a wall', () => {
    const game = round()
    const other = game.players[1]
    other.x = 100
    other.y = 100
    other.vx = 50
    other.vy = 0
    const smoother = createOthersSmoother(() => true)
    smoother.heard(game, game.players.map((p) => ({ x: p.x, y: p.y })), 0, 10)
    smoother.draw(game, 0, 10.05, 0.016)
    expect(other.x).toBeCloseTo(102.5, 5)
    smoother.draw(game, 0, 11, 0.016)
    expect(other.x).toBeCloseTo(105, 5)
    const walled = createOthersSmoother(() => false)
    walled.heard(game, game.players.map((p) => ({ x: p.x, y: p.y })), 0, 10)
    walled.draw(game, 0, 10.05, 0.016)
    expect(other.x).toBeCloseTo(105, 5)
  })

  it('closes a small gap over a few frames and takes a big jump as it is', () => {
    const game = round()
    const other = game.players[1]
    const smoother = createOthersSmoother(() => true)
    other.vx = other.vy = 0
    other.x = 100
    other.y = 100
    smoother.heard(game, game.players.map((p) => ({ x: p.x, y: p.y })), 0, 1)
    // The next snapshot puts it 10 to the right of where it was drawn.
    const drawn = game.players.map((p) => ({ x: p.x, y: p.y }))
    other.x = 110
    smoother.heard(game, drawn, 0, 1.02)
    smoother.draw(game, 0, 1.02, 0.016)
    expect(other.x).toBeGreaterThan(100)
    expect(other.x).toBeLessThan(110)
    for (let i = 0; i < 30; i++) smoother.draw(game, 0, 1.02, 0.016)
    expect(other.x).toBeCloseTo(110, 1)
    // A respawn far away: no sliding across the map.
    const before = game.players.map((p) => ({ x: p.x, y: p.y }))
    other.x = 400
    smoother.heard(game, before, 0, 2)
    smoother.draw(game, 0, 2, 0.016)
    expect(other.x).toBe(400)
  })

  it('leaves this viewer own hamster to the prediction', () => {
    const game = round()
    const me = game.players[0]
    me.x = 50
    me.vx = 100
    const smoother = createOthersSmoother(() => true)
    smoother.heard(game, game.players.map((p) => ({ x: p.x, y: p.y })), 0, 1)
    smoother.draw(game, 0, 1.05, 0.016)
    expect(me.x).toBe(50)
  })
})
