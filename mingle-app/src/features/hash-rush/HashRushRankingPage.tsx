'use client'

// Hash Rush rankings: everyone's, or this chat room's. Most wins first; the
// viewer's own row is marked, and shown under the list when outside it.

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { hashRushInviteCopy } from './invite-copy'

export type HashRushRankingRow = {
  rank: number
  userId: string
  name: string | null
  image: string | null
  wins: number
  rounds: number
  seeds: number
  bonks: number
}

type Scope = 'all' | 'room'
type Loaded = { rows: HashRushRankingRow[], me: HashRushRankingRow | null }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function parseHashRushRankings(body: unknown): Loaded {
  const b = (body && typeof body === 'object' ? body : {}) as { rows?: unknown, me?: unknown }
  const row = (raw: unknown): HashRushRankingRow | null => {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    if (typeof r.userId !== 'string') return null
    return {
      rank: num(r.rank),
      userId: r.userId,
      name: typeof r.name === 'string' ? r.name : null,
      image: typeof r.image === 'string' ? r.image : null,
      wins: num(r.wins),
      rounds: num(r.rounds),
      seeds: num(r.seeds),
      bonks: num(r.bonks),
    }
  }
  return {
    rows: Array.isArray(b.rows) ? b.rows.map(row).filter((r): r is HashRushRankingRow => !!r) : [],
    me: row(b.me),
  }
}

function rankingPath(scope: Scope, conversationId: string): `/${string}` {
  return (scope === 'room'
    ? `/conversations/${encodeURIComponent(conversationId)}/hash-rush/rankings`
    : '/hash-rush/rankings') as `/${string}`
}

const MEDALS = ['🥇', '🥈', '🥉']

function RankRow({ row, me, copy }: { row: HashRushRankingRow, me: boolean, copy: ReturnType<typeof hashRushInviteCopy> }) {
  return (
    <li
      data-qa="hash-rush-ranking-row"
      data-me={me ? 'true' : 'false'}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${me ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}
    >
      <span className="w-7 shrink-0 text-center text-[0.95rem] font-bold text-gray-500">
        {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
      </span>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-[0.8rem] font-bold text-amber-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {row.image ? <img src={row.image} alt="" className="h-full w-full object-cover" /> : (row.name || '?').slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem] font-semibold text-gray-900">
          {row.name || '—'}{me ? <span className="ml-1.5 text-[0.78rem] font-semibold text-amber-700">{copy.rankingMe}</span> : null}
        </span>
        <span className="block text-[0.78rem] text-gray-500">
          {row.rounds} {copy.rankingRounds} · {copy.rankingSeeds} {row.seeds} · {copy.rankingBonks} {row.bonks}
        </span>
      </span>
      <span className="shrink-0 text-[1.05rem] font-bold tabular-nums text-gray-900">
        {row.wins}<span className="ml-0.5 text-[0.75rem] font-semibold text-gray-500">{copy.rankingWins}</span>
      </span>
    </li>
  )
}

export default function HashRushRankingPage({ uiLocale, conversationId, viewerUserId, active }: {
  uiLocale: string
  conversationId: string
  viewerUserId: string | null
  /** The page is up: it loads then. */
  active: boolean
}) {
  const copy = hashRushInviteCopy(uiLocale)
  const [scope, setScope] = useState<Scope>('room')
  const [state, setState] = useState<{ key: string, loaded: Loaded | null, failed: boolean }>({ key: '', loaded: null, failed: false })
  const key = `${scope}|${conversationId}`

  const load = useCallback(async (forScope: Scope) => {
    const forKey = `${forScope}|${conversationId}`
    try {
      const response = await fetch(buildClientApiPath(rankingPath(forScope, conversationId)), { credentials: 'include', cache: 'no-store' })
      if (!response.ok) throw new Error(String(response.status))
      setState({ key: forKey, loaded: parseHashRushRankings(await response.json()), failed: false })
    } catch {
      setState({ key: forKey, loaded: null, failed: true })
    }
  }, [conversationId])

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => { void load(scope) }, 0)
    return () => clearTimeout(timer)
  }, [active, load, scope])

  const current = state.key === key ? state : null
  const loaded = current?.loaded ?? null
  const meOutside = loaded?.me && !loaded.rows.some((row) => row.userId === loaded.me?.userId) ? loaded.me : null

  return (
    <div className="px-4 py-4" data-qa="hash-rush-ranking-page">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        {(['room', 'all'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={scope === tab}
            data-qa={`hash-rush-ranking-tab-${tab}`}
            onClick={() => setScope(tab)}
            className={`h-9 rounded-lg text-[0.88rem] font-semibold transition-colors ${scope === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            {tab === 'room' ? copy.rankingRoom : copy.rankingAll}
          </button>
        ))}
      </div>

      {!current ? (
        <div className="flex justify-center py-10 text-gray-400"><Loader2 size={22} className="animate-spin" aria-hidden="true" /></div>
      ) : current.failed ? (
        <div className="py-10 text-center text-[0.9rem] text-gray-500">
          <p>{copy.rankingLoadFailed}</p>
          <button type="button" onClick={() => void load(scope)} className="mt-3 rounded-lg bg-gray-100 px-4 py-2 text-[0.86rem] font-semibold text-gray-700">↻</button>
        </div>
      ) : loaded && loaded.rows.length === 0 ? (
        <p className="py-10 text-center text-[0.9rem] text-gray-500" data-qa="hash-rush-ranking-empty">{copy.rankingEmpty}</p>
      ) : loaded ? (
        <>
          <ol className="space-y-1">
            {loaded.rows.map((row) => <RankRow key={row.userId} row={row} me={row.userId === viewerUserId} copy={copy} />)}
          </ol>
          {meOutside ? (
            <ol className="mt-3 border-t border-gray-100 pt-3">
              <RankRow row={meOutside} me copy={copy} />
            </ol>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
