'use client'

// The cards between rounds and the score table, over the game (HashRushGame.tsx):
// the lobby, the see-through table over a round, the result, and the title.
// Everything they say comes from client.ts in the viewer's language; these
// only lay it out. The faces and the trophy are drawn by the engine (`art`),
// which arrives with the game's code.
//
// The room is the game server's, with no host: the lobby and the result say
// when the next round starts by itself, and nothing asks anybody for one.
// The rules they keep are hash-rush's docs/UIUX-ISSUES.md (see the stylesheet's
// head and score.ts): a card can be put away and brought back (#42, #125, #144),
// its close button is big (#142), and a tap in its first moments, from a thumb
// on its way to the bonk button, does not put it away (#147).

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import styles from './hash-rush-cards.module.css'
import type { HashRushGameCopy } from './copy'
import type { HashRushArt, HashRushLobbyView } from './client'
import type { HashRushSetup } from './protocol'
import type { HashRushScoreboard, HashRushScoreHead, HashRushTitleWords, HashRushVerdict } from './score'

export type HashRushScoreView = 'round' | 'total'

/** A card that has just come up ignores taps for this long. */
export const HASH_RUSH_CARD_TAP_GUARD_MS = 700

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

/** Whole seconds left until `deadline` (a Date.now() time), ticking; null without one. */
export function useSecondsLeft(deadline: number): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [deadline])
  if (!deadline) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}

function Face({ art, seat, team, size, className }: { art: HashRushArt | null, seat: number, team: number, size: number, className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (ref.current && art) art.face(ref.current, seat, team, size)
  }, [art, seat, team, size])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}

// A gold cup with its rays turning and confetti coming down, for as long as the card is up.
function Trophy({ art, wins }: { art: HashRushArt | null, wins: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !art) return
    let frame = 0
    const start = performance.now()
    const loop = (now: number) => {
      art.trophy(canvas, (now - start) / 1000, wins)
      frame = window.requestAnimationFrame(loop)
    }
    frame = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(frame)
  }, [art, wins])
  return <canvas ref={ref} className={styles.trophy} aria-hidden="true" />
}

// ---------- the lobby ----------

type LobbyProps = {
  view: HashRushLobbyView
  copy: HashRushGameCopy
  art: HashRushArt | null
  onSit: () => void
  onStand: () => void
  /** A hosted room (the app's): the host's controls, a side to pick, how to play. */
  onSetup?: (patch: HashRushSetup) => void
  onGo?: () => void
  onHandHost?: (seat: number) => void
  onPickTeam?: (team: number) => void
  onHowTo?: () => void
}

export function HashRushLobbyCard({ view, copy, art, onSit, onStand, onSetup, onGo, onHandHost, onPickTeam, onHowTo }: LobbyProps) {
  const seconds = useSecondsLeft(view.nextAt)
  const [handTo, setHandTo] = useState<number | null>(null)
  const hosting = view.hosting
  const seated = view.you >= 0
  const nobody = view.seats.length === 0
  const heading = hosting
    ? hosting.amHost ? copy.hostReady : copy.waitingHostNamed(hosting.hostName || copy.host)
    : nobody ? copy.nobodySeated : seated ? copy.waitingRound : view.words.spectating
  const total = view.seats.length + view.open
  const handSeat = handTo == null ? null : view.seats.find((seat) => seat.seat === handTo) ?? null
  return (
    <div className={cx(styles.cover, styles.coverLobby)} data-qa="hash-rush-lobby">
      <div className={cx(styles.card, styles.lobbyCard)}>
        <div className={styles.lobbyChips}>
          <span className={styles.chip} data-qa="hash-rush-mode">{view.mode}</span>
          {view.race ? <span className={cx(styles.chip, styles.chipRace, view.deuce && styles.chipDeuce)}>{view.race}</span> : null}
          {onHowTo ? (
            <button type="button" className={cx(styles.chip, styles.chipButton)} onClick={onHowTo} data-qa="hash-rush-lobby-howto">
              ? {copy.howTo}
            </button>
          ) : null}
        </div>
        <h2 className={styles.lobbyTitle}>
          <span>{heading}</span>
          {seconds != null && !nobody && !hosting ? (
            <span className={styles.countdown} data-qa="hash-rush-countdown">{copy.startsIn(seconds)}</span>
          ) : null}
        </h2>
        <p className={styles.listHead}>{copy.waitingPlayers} · {view.seats.length}/{total}</p>
        <ul className={styles.seats}>
          {view.seats.map((seat) => (
            <li
              key={seat.seat}
              className={cx(styles.seat, seat.me && styles.seatMe, seat.fresh && styles.seatFresh)}
              style={{ '--c': seat.color } as CSSProperties}
              data-qa={seat.me ? 'hash-rush-seat-me' : 'hash-rush-seat'}
            >
              <Face art={art} seat={seat.seat} team={seat.team} size={40} className={styles.face} />
              <span className={styles.seatName}>
                <b>{seat.name}</b>
                {seat.host ? <i className={styles.hostTag} data-qa="hash-rush-host-tag">👑 {copy.host}</i> : null}
                {seat.me ? <i className={styles.meTag}>{view.words.me}</i> : null}
                {seat.team >= 0 ? <i className={styles.teamDot} style={{ '--t': seat.color } as CSSProperties} /> : null}
              </span>
              {hosting?.amHost && !seat.me && onHandHost ? (
                <button type="button" className={styles.handHost} onClick={() => setHandTo(seat.seat)} data-qa="hash-rush-hand-host">
                  {copy.handHost}
                </button>
              ) : (
                <span className={styles.winsCell}>{seat.winsText}</span>
              )}
            </li>
          ))}
          {view.open > 0 ? <li className={cx(styles.seat, styles.seatOpen)}>{copy.openSeats(view.open)}</li> : null}
        </ul>
        {handSeat && onHandHost ? (
          <div className={styles.confirmRow} data-qa="hash-rush-hand-host-confirm">
            <p>{copy.handHostTo(handSeat.name)}</p>
            <div>
              <button type="button" className={styles.button} onClick={() => setHandTo(null)}>{copy.close}</button>
              <button type="button" className={cx(styles.button, styles.primary)} onClick={() => { onHandHost(handSeat.seat); setHandTo(null) }}>
                {copy.handHostConfirm}
              </button>
            </div>
          </div>
        ) : null}

        {hosting?.teams && seated && onPickTeam ? (
          <div className={styles.setupRow} data-qa="hash-rush-pick-team">
            <span className={styles.setupLabel}>{copy.pickTeam}</span>
            <div className={styles.options}>
              {hosting.teamChoices.map((choice) => (
                <button
                  key={choice.team}
                  type="button"
                  aria-pressed={hosting.myTeam === choice.team}
                  className={cx(styles.option, hosting.myTeam === choice.team && styles.optionOn)}
                  onClick={() => onPickTeam(choice.team)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {hosting?.amHost && onSetup ? (
          <div className={styles.setup} data-qa="hash-rush-host-setup">
            <div className={styles.setupRow}>
              <div className={styles.options}>
                <button type="button" aria-pressed={!hosting.teams} className={cx(styles.option, !hosting.teams && styles.optionOn)} onClick={() => onSetup({ teams: false })} data-qa="hash-rush-setup-solo">
                  {hosting.words.solo}
                </button>
                <button type="button" aria-pressed={hosting.teams} className={cx(styles.option, hosting.teams && styles.optionOn)} onClick={() => onSetup({ teams: true })} data-qa="hash-rush-setup-team">
                  {hosting.words.team}
                </button>
              </div>
            </div>
            <div className={styles.setupRow}>
              <span className={styles.setupLabel}>{hosting.words.map}</span>
              <div className={styles.options}>
                {hosting.maps.map((map) => (
                  <button key={map.id} type="button" aria-pressed={hosting.map === map.id} className={cx(styles.option, hosting.map === map.id && styles.optionOn)} onClick={() => onSetup({ map: map.id })}>
                    {map.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.setupRow}>
              <span className={styles.setupLabel}>{copy.botLevel}</span>
              <div className={styles.options}>
                {hosting.botLevels.map((level) => (
                  <button key={level.id} type="button" aria-pressed={hosting.botLevel === level.id} className={cx(styles.option, hosting.botLevel === level.id && styles.optionOn)} onClick={() => onSetup({ bots: level.id })}>
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.setupRow}>
              <span className={styles.setupLabel}>{copy.hamsters}</span>
              <div className={styles.stepper}>
                <button type="button" aria-label="−" disabled={hosting.fill <= hosting.fillMin} onClick={() => onSetup({ fill: hosting.fill - 1 })}>−</button>
                <b data-qa="hash-rush-setup-fill">{hosting.fill}</b>
                <button type="button" aria-label="+" disabled={hosting.fill >= hosting.fillMax} onClick={() => onSetup({ fill: hosting.fill + 1 })}>+</button>
              </div>
            </div>
            {hosting.notice ? <p className={styles.notice} data-qa="hash-rush-start-notice">{hosting.notice}</p> : null}
            {onGo ? (
              <button type="button" className={cx(styles.button, styles.primary, styles.startButton)} onClick={onGo} data-qa="hash-rush-start">
                {hosting.words.start}
              </button>
            ) : null}
          </div>
        ) : null}

        {view.spectators ? <p className={styles.note}>{view.spectators}</p> : null}
        {!seated && !view.canSit ? <p className={styles.note}>{copy.seatsFull}</p> : null}
        {view.canStand || (!seated && view.canSit) ? (
          <div className={styles.switchRow}>
            {view.canStand ? (
              <button type="button" className={styles.button} onClick={onStand} data-qa="hash-rush-stand">
                {view.words.standUp}
              </button>
            ) : (
              <button type="button" className={cx(styles.button, styles.primary)} onClick={onSit} data-qa="hash-rush-sit">
                {view.words.sitIn}
              </button>
            )}
          </div>
        ) : null}
        <p className={styles.note}>
          {hosting ? '' : copy.autoStart}
          {view.bots > 0 ? `${hosting ? '' : ' · '}${copy.botsFill(view.bots)}` : ''}
        </p>
        {view.lastTitle ? <p className={styles.note}>{copy.lastTitle} {view.lastTitle}</p> : null}
      </div>
    </div>
  )
}

// ---------- the score table ----------

type TableProps = {
  board: HashRushScoreboard
  scoreView: HashRushScoreView
  onScoreView: (view: HashRushScoreView) => void
}

/**
 * This round's numbers, then the room's running totals. On a phone they are
 * two tabs, the totals first; on a wide screen side by side. The table scrolls
 * sideways inside its card when it is wider.
 */
export function HashRushScoreTable({ board, scoreView, onScoreView }: TableProps) {
  // The tabs and the MVP rule stay put over and under the table, which scrolls
  // sideways on its own when it is wider than the card.
  return (
    <div className={styles.scoreBox}>
      <div className={styles.tabs} data-qa="hash-rush-score-tabs">
        {(['round', 'total'] as const).map((view) => (
          <button
            key={view}
            type="button"
            className={scoreView === view ? styles.on : undefined}
            aria-pressed={scoreView === view}
            onClick={(event) => {
              event.stopPropagation()
              onScoreView(view)
            }}
          >
            {view === 'round' ? board.tabRound : board.tabTotal}
          </button>
        ))}
      </div>
      {/* Which game of the room this is and the race, over the table: in the
          name column they would make it as wide as themselves. */}
      <p className={styles.tableMeta}>
        {board.gameNo}
        {board.race ? <span className={board.deuce ? styles.deuce : undefined}> · {board.race}</span> : null}
      </p>
      <div className={styles.tableWrap}>
        <ScoreRows board={board} scoreView={scoreView} />
      </div>
      <p className={cx(styles.ruleLine, styles.legend)} data-qa="hash-rush-score-legend">{board.legend}</p>
      <p className={cx(styles.ruleLine, styles.ruleLong)}>{board.rule}</p>
      <p className={cx(styles.ruleLine, styles.ruleShort)}>{board.ruleShort}</p>
    </div>
  )
}

/** A heading: the words on a wide screen; on a phone the icon or short word, on one line. */
function Head({ head }: { head: HashRushScoreHead }) {
  return (
    <>
      <span className={styles.headLong}>{head.text}</span>
      <span className={styles.headShort} aria-hidden="true">{head.short}</span>
    </>
  )
}

// A row per hamster: its name (the viewer's own tagged, this round's goal
// stamped under it), its wins, this round's numbers, the totals, and the MVP
// badge last.
function ScoreRows({ board, scoreView }: { board: HashRushScoreboard, scoreView: HashRushScoreView }) {
  return (
    <table className={styles.table} data-view={scoreView} data-qa="hash-rush-score-table">
      <thead>
        <tr className={styles.groups}>
          <th />
          <th className={styles.wins} />
          <th className={styles.round} colSpan={board.roundHeads.length}>{board.tabRound}</th>
          <th className={cx(styles.total, styles.split)} colSpan={board.totalHeads.length + 1}>{board.tabTotal}</th>
        </tr>
        <tr>
          <th />
          <th className={styles.wins} title={board.winsHead.text}><Head head={board.winsHead} /></th>
          {board.roundHeads.map((head, k) => <th key={`r${k}`} className={styles.round} title={head.text}><Head head={head} /></th>)}
          {board.totalHeads.map((head, k) => (
            <th key={`t${k}`} className={cx(styles.total, k === 0 && styles.split)} title={head.text}><Head head={head} /></th>
          ))}
          <th className={styles.total} />
        </tr>
      </thead>
      <tbody>
        {board.rows.map((row) => (
          <tr key={row.id} className={cx(row.winner && styles.winner)} data-qa={row.me ? 'hash-rush-score-me' : undefined}>
            <td className={styles.who}>
              <b style={{ color: row.color }}>{row.name}</b>
              {row.me ? <i className={styles.meTag}>{board.meTag}</i> : null}
              {row.goal ? <span className={styles.goalBadge}>{board.goalBadge}</span> : null}
            </td>
            <td className={styles.wins}>
              <span className={styles.headLong}>{row.winsText}</span>
              <span className={styles.headShort} aria-hidden="true">{row.wins}</span>
            </td>
            {row.round.map((value, k) => <td key={`r${k}`} className={styles.round}>{value}</td>)}
            {row.total.map((value, k) => (
              <td key={`t${k}`} className={cx(styles.total, k === 0 && styles.split, k === row.total.length - 1 && styles.score)}>{value}</td>
            ))}
            <td className={cx(styles.total, styles.prize)}>{row.mvp ? <span className={styles.mvp}>MVP</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The table over a round, see-through so the map stays in view (the 🏆 button, or Tab held). */
export function HashRushBoard({ board, copy, scoreView, onScoreView, onClose, cardRef }: TableProps & {
  copy: HashRushGameCopy
  onClose: () => void
  cardRef: (node: HTMLDivElement | null) => void
}) {
  return (
    <div className={styles.boardLayer} data-qa="hash-rush-board">
      <div ref={cardRef} className={styles.boardCard}>
        <button type="button" className={styles.close} aria-label={copy.close} onClick={onClose} data-qa="hash-rush-board-close">
          ✕
        </button>
        <HashRushScoreTable board={board} scoreView={scoreView} onScoreView={onScoreView} />
      </div>
    </div>
  )
}

// ---------- after a round ----------

// Put away by its button or a tap on the dimmed map around it, but not by a tap
// in its first moments: that thumb was on its way to something else.
function useCardClose(at: number, onClose: () => void) {
  const close = () => {
    if (performance.now() - at < HASH_RUSH_CARD_TAP_GUARD_MS) return
    onClose()
  }
  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close()
  }
  return { close, onBackdrop }
}

type ResultProps = TableProps & {
  verdict: HashRushVerdict
  nextAt: number
  at: number
  copy: HashRushGameCopy
  onClose: () => void
}

/** The round's verdict and its table, until the room goes back to the lobby by itself. */
export function HashRushResultCard({ verdict, board, nextAt, at, copy, scoreView, onScoreView, onClose }: ResultProps) {
  const seconds = useSecondsLeft(nextAt)
  const { close, onBackdrop } = useCardClose(at, onClose)
  return (
    <div className={cx(styles.cover, styles.coverResult)} onClick={onBackdrop} data-qa="hash-rush-result">
      <div className={cx(styles.card, styles.resultCard)}>
        <button type="button" className={styles.close} aria-label={copy.close} onClick={close} data-qa="hash-rush-card-close">
          ✕
        </button>
        <h2
          className={cx(styles.verdict, verdict.mine === 'win' && styles.verdictWin, verdict.mine === 'lose' && styles.verdictLose)}
          data-qa="hash-rush-verdict"
        >
          {verdict.title}
        </h2>
        {verdict.winner ? <p className={styles.winnerLine}>{verdict.winner}</p> : null}
        {verdict.why ? <p className={styles.why}>{verdict.why}</p> : null}
        <HashRushScoreTable board={board} scoreView={scoreView} onScoreView={onScoreView} />
        <p className={styles.nextLine} data-qa="hash-rush-next-round">
          {seconds != null ? copy.nextRoundIn(seconds) : copy.nextRoundSoon}
        </p>
      </div>
    </div>
  )
}

type TitleProps = {
  words: HashRushTitleWords
  board: HashRushScoreboard
  nextAt: number
  at: number
  copy: HashRushGameCopy
  art: HashRushArt | null
  onClose: () => void
}

/** The title won: the cup, the champions, the room's whole record, and the room starting over. */
export function HashRushTitleCard({ words, board, nextAt, at, copy, art, onClose }: TitleProps) {
  const seconds = useSecondsLeft(nextAt)
  // The title is won on the totals: the table opens on them.
  const [scoreView, setScoreView] = useState<HashRushScoreView>('total')
  const { close, onBackdrop } = useCardClose(at, onClose)
  return (
    <div className={cx(styles.cover, styles.coverTitle)} onClick={onBackdrop} data-qa="hash-rush-title">
      <div className={cx(styles.card, styles.titleCard)}>
        <button type="button" className={styles.close} aria-label={copy.close} onClick={close} data-qa="hash-rush-card-close">
          ✕
        </button>
        <Trophy art={art} wins={words.wins} />
        <h2 className={styles.champTitle} data-qa="hash-rush-champ-title">{words.title}</h2>
        <div className={styles.champNames}>
          {words.champs.map((champ) => (
            <div key={champ.seat}>
              <Face art={art} seat={champ.seat} team={champ.team} size={52} />
              <b style={{ color: champ.color }}>{champ.name}</b>
            </div>
          ))}
        </div>
        <HashRushScoreTable board={board} scoreView={scoreView} onScoreView={setScoreView} />
        <p className={styles.champNote}>{words.note}</p>
        <p className={styles.nextLine} data-qa="hash-rush-next-round">
          {seconds != null ? copy.nextRoundIn(seconds) : copy.nextRoundSoon}
        </p>
      </div>
    </div>
  )
}
