// The score table and the verdicts between rounds, worked out from the round
// and the room's record the way the web page does it (hash-rush main.js
// fillScores, showResult, showChampions, champions, deuce). No DOM here:
// client.ts hands the results to the cards (HashRushCards.tsx), every word in
// the viewer's language already.
//
// The rules it keeps are hash-rush's docs/UIUX-ISSUES.md: the wins come first
// and loudest (#182), this round and the running totals are two tabs on a phone
// (#104) with the totals first, the table says which game of the room this is
// and what the race is (#44, #61, #142), the losses have a column (#167), the
// MVP badge sits at the far right (#71, #76), and a round that ran out of time
// says what settled it (#95).

import { MVP_POINTS, mvpScore, pickMvp } from './engine/client/mvp.js'
import { colorOf } from './engine/client/looks.js'
import { t } from './engine/client/i18n.js'
import { allied, timeoutReason } from './engine/sim/game.js'
import type { HashRushPlayer, HashRushRound, HashRushTitleRule } from './protocol'

/** Where a seat's totals keep the rounds played, after [bonks, bonked, seeds, goals, supers, throws, stops]. */
export const PLAYED = 7
// The order the table shows them in. This round leaves the goal out: its badge says it.
export const ROUND_COLS = [0, 5, 6, 1, 2, 4] as const
export const TOTAL_COLS = [0, 5, 6, 1, 2, 3, 4] as const

/** What the room has kept so far, as the server last said it. */
export type HashRushRecord = {
  /** By seat (a hamster's `look`). */
  wins: number[]
  careers: number[][]
  /** Rounds finished in the room. */
  rounds: number
  /** The totals already have the round on screen in them. */
  counted: boolean
  rule: HashRushTitleRule | null
}

export type HashRushScoreRow = {
  id: number
  name: string
  color: string
  me: boolean
  winner: boolean
  goal: boolean
  mvp: boolean
  winsText: string
  /** This round, in ROUND_COLS order. */
  round: number[]
  /** The totals in TOTAL_COLS order, then the losses and the MVP score. */
  total: number[]
}

export type HashRushScoreboard = {
  gameNo: string
  /** "First to 10 wins!", or deuce; '' when the server keeps no title race. */
  race: string
  deuce: boolean
  tabRound: string
  tabTotal: string
  winsHead: string
  roundHeads: string[]
  totalHeads: string[]
  rows: HashRushScoreRow[]
  rule: string
  goalBadge: string
  /** The tag on the viewer's own row, so they find themselves (#224). */
  meTag: string
}

const won = (round: HashRushRound, p: HashRushPlayer) => round.winners.includes(p.id)

/** A goal is a seed brought home: one hamster's, in a round that did not run out of time. */
export const goalOf = (round: HashRushRound, p: HashRushPlayer) => (round.phase === 'over' && !round.timeout && round.winner === p.id ? 1 : 0)

/** A hamster's numbers this round: [bonks, bonked, seeds, goals, supers, throws, stops]. */
export const roundOf = (round: HashRushRound, p: HashRushPlayer) => [p.kills, p.deaths, p.seeds, goalOf(round, p), p.supers, p.throws || 0, p.stops || 0]

// Each side's wins: a team's (its best seat, as team-mates win together) or one
// hamster's own in a free-for-all.
const sideOf = (p: HashRushPlayer) => (p.team >= 0 ? `t${p.team}` : `p${p.id}`)

export function standing(players: HashRushPlayer[], wins: number[]) {
  const sides = new Map<string, number>()
  for (const p of players) sides.set(sideOf(p), Math.max(sides.get(sideOf(p)) ?? 0, wins[p.look] || 0))
  const [top = 0, next = 0] = [...sides.values()].sort((a, b) => b - a)
  return { top, next, sides }
}

/**
 * Whoever has the most wins once somebody reaches the title, `lead` clear of
 * every other side. Team-mates level at the top share it; two sides level at
 * the top is no title (the same rule as the server's and the page's).
 */
export function champions(players: HashRushPlayer[], wins: number[], rule: HashRushTitleRule | null): HashRushPlayer[] {
  if (!rule) return []
  const { top, next, sides } = standing(players, wins)
  if (top < rule.wins || top - next < rule.lead) return []
  return players.filter((p) => sides.get(sideOf(p)) === top && (wins[p.look] || 0) === top)
}

/** Both leaders within a win of the title and nobody clear: play on until somebody is. */
export function isDeuce(players: HashRushPlayer[], wins: number[], rule: HashRushTitleRule | null): boolean {
  if (!rule) return false
  const { top, next } = standing(players, wins)
  return top >= rule.wins - 1 && next >= rule.wins - 1 && !champions(players, wins, rule).length
}

/** The score table: this round, then the room's running totals, each player a row. */
export function buildScoreboard(round: HashRushRound, meId: number, record: HashRushRecord): HashRushScoreboard {
  const cols = t('columns') as string[]
  const career = (p: HashRushPlayer) => record.careers[p.look] || []
  // Until the round is in the totals, they show it as it stands.
  const totalOf = (p: HashRushPlayer) => roundOf(round, p).map((v, k) => (career(p)[k] || 0) + (record.counted ? 0 : v))
  // Rounds finished and not won. A round still going is not counted either way.
  const losses = (p: HashRushPlayer) => Math.max(0, (career(p)[PLAYED] || 0) - (record.wins[p.look] || 0))
  const mvps = pickMvp(round.players.map((p) => [p.id, totalOf(p)])) as number[]
  const deuce = isDeuce(round.players, record.wins, record.rule)
  const rows = [...round.players].sort((a, b) => a.team - b.team).map((p): HashRushScoreRow => {
    const now = roundOf(round, p)
    const total = totalOf(p)
    return {
      id: p.id,
      name: p.name,
      color: colorOf(p),
      me: p.id === meId,
      winner: round.phase === 'over' && won(round, p),
      goal: !!goalOf(round, p),
      mvp: mvps.includes(p.id),
      winsText: String(t('tally', record.wins[p.look] || 0)),
      round: ROUND_COLS.map((c) => now[c]),
      total: [...TOTAL_COLS.map((c) => total[c]), losses(p), mvpScore(total)],
    }
  })
  return {
    gameNo: String(t('gameNo', record.rounds + (record.counted ? 0 : 1))),
    race: record.rule ? String(deuce ? t('deuce', record.rule.lead) : t('firstTo', record.rule.wins)) : '',
    deuce,
    tabRound: String(t('thisRound')),
    tabTotal: String(t('totals')),
    winsHead: String(t('colWins')),
    roundHeads: ROUND_COLS.map((c) => cols[c]),
    totalHeads: [...TOTAL_COLS.map((c) => cols[c]), String(t('colLosses')), String(t('colScore'))],
    rows,
    rule: `${t('mvpRule')} = ${TOTAL_COLS.filter((c) => MVP_POINTS[c]).map((c) => `${cols[c]} ×${MVP_POINTS[c]}`).join(' + ')}`,
    goalBadge: String(t('goalBadge')),
    meTag: String(t('meTag')),
  }
}

export type HashRushVerdict = {
  /** Victory, defeat, or the round is over (a spectator has neither). */
  title: string
  mine: 'win' | 'lose' | ''
  /** "🏆 Winner - Mia", or the ones who share it. */
  winner: string
  /** What settled a round that ran out of time, '' otherwise. */
  why: string
}

/** The round's verdict, the player's own: a win or a loss, said outright, then who won and why. */
export function verdictOf(round: HashRushRound, meId: number): HashRushVerdict {
  const players = round.players
  const winners = round.winners.map((id) => players[id]).filter(Boolean)
  const winner = (round.winner != null ? players[round.winner] : undefined) ?? winners[0]
  const mine: HashRushVerdict['mine'] = meId >= 0 && players[meId] ? (won(round, players[meId]) ? 'win' : 'lose') : ''
  const title = String(t(mine === 'win' ? 'victory' : mine === 'lose' ? 'defeat' : 'roundOver'))
  if (!winner) return { title, mine, winner: '', why: '' }
  // Time ran out with the top sides level: they share the round.
  const shared = winners.some((p) => !allied(p, winner) && p !== winner)
  const who = shared ? winners.map((p) => p.name).join(', ') : winner.team >= 0 ? (t('teamNames') as string[])[winner.team] : winner.name
  const reason = round.timeout ? timeoutReason(players) as { by: 'bonks' | 'bonked' | 'seeds' | 'tie', n: number } : null
  const whyKey = reason ? { bonks: 'whyBonks', bonked: 'whyBonked', seeds: 'whySeeds', tie: 'whyTie' }[shared ? 'tie' : reason.by] : ''
  return {
    title,
    mine,
    winner: `🏆 ${t(shared ? 'winnersShared' : 'winnerIs', who)}`,
    why: reason ? String(t(whyKey, who, reason.n)) : '',
  }
}

export type HashRushChampion = { name: string, seat: number, team: number, color: string }

export type HashRushTitleWords = {
  title: string
  champs: HashRushChampion[]
  mine: boolean
  note: string
  /** The winning number of wins, on the cup. */
  wins: number
}

/** The title card's words, when the record says the title has just been won. */
export function titleOf(round: HashRushRound, meId: number, record: HashRushRecord): HashRushTitleWords | null {
  const champs = champions(round.players, record.wins, record.rule)
  if (!champs.length) return null
  const mine = champs.some((p) => p.id === meId)
  const wins = record.wins[champs[0].look] || 0
  return {
    title: String(champs.length > 1 ? t('champShared') : mine ? t('champMe') : t('champOther', champs[0].name)),
    champs: champs.map((p) => ({ name: p.name, seat: p.look, team: p.team, color: colorOf(p) })),
    mine,
    note: String(t('champNote', record.rounds, wins)),
    wins,
  }
}
