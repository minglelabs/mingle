import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGame } from './engine/sim/game.js'
import { MAPS } from './engine/sim/map.js'
import { setLanguage } from './engine/client/i18n.js'
import { readStart, type HashRushRound } from './protocol'
import {
  PLAYED,
  ROUND_COLS,
  TOTAL_COLS,
  buildScoreboard,
  champions,
  isDeuce,
  roundOf,
  titleOf,
  verdictOf,
  type HashRushRecord,
} from './score'

const RULE = { wins: 10, lead: 2 }

// A round as the app holds it: four hamsters in seats 0-3, solo or two teams.
function round({ teams = false } = {}): HashRushRound {
  const g = createGame({
    map: MAPS.meadow,
    slots: [
      { name: 'Mia', kind: 'remote', look: 0, team: teams ? 0 : -1 },
      { name: 'Cloud', kind: 'bot:hard', look: 1, team: teams ? 1 : -1 },
      { name: 'Bo', kind: 'remote', look: 2, team: teams ? 0 : -1 },
      { name: 'Dusty', kind: 'bot:hard', look: 3, team: teams ? 1 : -1 },
    ],
    seed: 3,
  })
  const start = readStart({
    t: 'start',
    g: 1,
    map: g.map.id,
    players: g.players.map((p: { name: string, look: number, team: number, kind: string, nest: unknown }) => ({ name: p.name, look: p.look, team: p.team, kind: p.kind, nest: p.nest })),
    you: 0,
    wins: [],
  })!
  return start.game
}

const record = (over: Partial<HashRushRecord> = {}): HashRushRecord => ({
  wins: [0, 0, 0, 0, 0, 0, 0, 0],
  careers: Array.from({ length: 8 }, () => [0, 0, 0, 0, 0, 0, 0, 0]),
  rounds: 0,
  counted: false,
  rule: RULE,
  ...over,
})

// The round as the winning seed reaches home (or as time runs out).
function finish(r: HashRushRound, winners: number[], timeout = false) {
  r.phase = 'over'
  r.winners = winners
  r.winner = winners[0] ?? null
  r.timeout = timeout
}

describe('hash rush score table', () => {
  beforeEach(() => setLanguage('ko'))
  afterEach(() => setLanguage('en'))

  it('shows this round and the running totals in the page order, wins first and loudest', () => {
    const r = round()
    Object.assign(r.players[0], { kills: 3, deaths: 1, seeds: 2, supers: 1, throws: 1, stops: 2 })
    const board = buildScoreboard(r, 0, record({ wins: [2, 0, 1, 0], careers: [[5, 2, 1, 1, 0, 0, 0, 4]], rounds: 4 }))
    expect(board.gameNo).toBe('5번째 경기')
    expect(board.race).toBe('10승 먼저 하면 우승!')
    expect(board.tabRound).toBe('이번 라운드')
    expect(board.tabTotal).toBe('누적')
    expect(board.winsHead).toBe('승')
    expect(board.roundHeads).toEqual(['꿀밤', '던지기', '저지', '맞음', '해씨', '슈퍼'])
    expect(board.totalHeads).toEqual(['꿀밤', '던지기', '저지', '맞음', '해씨', '골인', '슈퍼', '패', '점수'])
    const mia = board.rows.find((row) => row.name === 'Mia')!
    expect(mia.me).toBe(true)
    expect(mia.winsText).toBe('2승')
    expect(mia.round).toEqual(ROUND_COLS.map((c) => roundOf(r, r.players[0])[c]))
    expect(mia.round).toEqual([3, 1, 2, 1, 2, 1])
    // Until the round is counted the totals show it as it stands: 5+3 bonks, 2+1 bonked...
    expect(mia.total.slice(0, TOTAL_COLS.length)).toEqual([8, 1, 2, 3, 3, 1, 1])
    // Losses: 4 played, 2 won. The score: 8 + 1x2 + 2x1 + 3x2 + 1x5 + 1x3 = 26.
    expect(mia.total.slice(TOTAL_COLS.length)).toEqual([2, 26])
    expect(mia.mvp).toBe(true)
    expect(board.rows.filter((row) => row.mvp)).toHaveLength(1)
    expect(board.rule).toBe('MVP는 누적 점수 1위 · 점수 = 꿀밤 ×1 + 던지기 ×2 + 저지 ×1 + 해씨 ×2 + 골인 ×5 + 슈퍼 ×3')
    expect(board.meTag).toBe('나')
  })

  it('takes the counted totals as they are once the round is in them', () => {
    const r = round()
    Object.assign(r.players[1], { kills: 2 })
    finish(r, [1])
    const careers = Array.from({ length: 8 }, (_, i) => (i === 1 ? [2, 0, 0, 1, 0, 0, 0, 1] : [0, 0, 0, 0, 0, 0, 0, 1]))
    const board = buildScoreboard(r, 0, record({ wins: [0, 1, 0, 0], careers, rounds: 1, counted: true }))
    expect(board.gameNo).toBe('1번째 경기')
    const cloud = board.rows.find((row) => row.name === '구름' || row.name === 'Cloud')!
    expect(cloud.winner).toBe(true)
    expect(cloud.goal).toBe(true)
    expect(cloud.total.slice(0, 2)).toEqual([2, 0])
    const mia = board.rows.find((row) => row.name === 'Mia')!
    // One round played, none won.
    expect(mia.total.at(-2)).toBe(1)
    expect(mia.winner).toBe(false)
  })

  it('has no goal in a round that ran out of time, and no winner rows before the end', () => {
    const r = round()
    expect(buildScoreboard(r, 0, record()).rows.some((row) => row.winner || row.goal)).toBe(false)
    finish(r, [2], true)
    const board = buildScoreboard(r, 0, record())
    expect(board.rows.find((row) => row.name === 'Bo')).toMatchObject({ winner: true, goal: false })
  })

  it('lists the hamsters by team', () => {
    const r = round({ teams: true })
    expect(buildScoreboard(r, 0, record()).rows.map((row) => row.name)).toEqual(['Mia', 'Bo', '구름', '먼지'])
  })

  it('says nothing of a race the server does not run', () => {
    expect(buildScoreboard(round(), 0, record({ rule: null })).race).toBe('')
  })
})

describe('hash rush title race', () => {
  beforeEach(() => setLanguage('ko'))
  afterEach(() => setLanguage('en'))

  it('takes ten wins two clear; two sides level at the top is deuce, not a title', () => {
    const players = round().players
    expect(champions(players, [10, 8, 0, 0], RULE).map((p) => p.name)).toEqual(['Mia'])
    expect(champions(players, [10, 9, 0, 0], RULE)).toEqual([])
    expect(isDeuce(players, [10, 9, 0, 0], RULE)).toBe(true)
    expect(isDeuce(players, [9, 9, 0, 0], RULE)).toBe(true)
    expect(isDeuce(players, [9, 7, 0, 0], RULE)).toBe(false)
    expect(champions(players, [11, 9, 0, 0], RULE).map((p) => p.name)).toEqual(['Mia'])
    expect(champions(players, [12, 12, 0, 0], RULE)).toEqual([])
    expect(champions(players, [12, 0, 0, 0], null)).toEqual([])
    const board = buildScoreboard(round(), 0, record({ wins: [9, 9, 0, 0] }))
    expect(board.deuce).toBe(true)
    expect(board.race).toBe('듀스! 2승 앞서야 우승')
  })

  it('lets team-mates level at the top share the title', () => {
    const players = round({ teams: true }).players
    expect(champions(players, [10, 7, 10, 7], RULE).map((p) => p.name)).toEqual(['Mia', 'Bo'])
    // A team-mate behind on wins does not share it.
    expect(champions(players, [10, 7, 9, 7], RULE).map((p) => p.name)).toEqual(['Mia'])
  })

  it('words the title card for the champion, for somebody else, and for a shared title', () => {
    const r = round()
    finish(r, [0])
    const mine = titleOf(r, 0, record({ wins: [10, 3, 0, 0], rounds: 17, counted: true }))!
    expect(mine).toMatchObject({ title: '🏆 내가 우승!', mine: true, wins: 10, note: '17경기 만에 10승 달성! 곧 로비로 돌아가 전적이 새로 시작돼요.' })
    expect(mine.champs).toEqual([{ name: 'Mia', seat: 0, team: -1, color: '#e5484d' }])
    expect(titleOf(r, 2, record({ wins: [10, 3, 0, 0], rounds: 17 }))!.title).toBe('🏆 Mia가 우승!')
    const teams = round({ teams: true })
    finish(teams, [0, 2])
    expect(titleOf(teams, 1, record({ wins: [10, 6, 10, 6] }))!.title).toBe('🏆 공동 우승!')
    expect(titleOf(r, 0, record({ wins: [9, 3, 0, 0] }))).toBeNull()
  })
})

describe('hash rush verdict', () => {
  beforeEach(() => setLanguage('ko'))
  afterEach(() => setLanguage('en'))

  it('says the player own result outright, then who won', () => {
    const r = round()
    finish(r, [1])
    expect(verdictOf(r, 0)).toEqual({ title: '패배', mine: 'lose', winner: '🏆 승자 - 구름', why: '' })
    expect(verdictOf(r, 1)).toMatchObject({ title: '승리!!', mine: 'win' })
    // Somebody watching has neither.
    expect(verdictOf(r, -1)).toMatchObject({ title: '경기 종료', mine: '' })
  })

  it('says what settled a round that ran out of time', () => {
    const r = round()
    Object.assign(r.players[2], { kills: 4 })
    finish(r, [2], true)
    expect(verdictOf(r, 0).why).toBe('⏰ 시간 초과 · 꿀밤 1위(4번)인 Bo의 승리')
    const level = round()
    finish(level, [0, 2], true)
    expect(verdictOf(level, 0)).toMatchObject({ mine: 'win', winner: '🏆 공동 승리 - Mia, Bo', why: '⏰ 시간 초과 · 끝까지 동률이라 공동 승리' })
  })

  it('names the winning team in a team game', () => {
    const r = round({ teams: true })
    finish(r, [0, 2])
    expect(verdictOf(r, 1)).toMatchObject({ mine: 'lose', winner: '🏆 승자 - 🔴 레드' })
  })
})

describe('hash rush score constants', () => {
  it('keeps the page order of the numbers', () => {
    // [bonks, bonked, seeds, goals, supers, throws, stops], then the rounds played.
    expect(PLAYED).toBe(7)
    expect([...ROUND_COLS]).toEqual([0, 5, 6, 1, 2, 4])
    expect([...TOTAL_COLS]).toEqual([0, 5, 6, 1, 2, 3, 4])
  })
})
