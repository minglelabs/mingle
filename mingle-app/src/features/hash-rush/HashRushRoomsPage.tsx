'use client'

// Hash Rush room list: games any chat room's host made public. Joining one
// plays it in this room's game layer, with a ticket for that room.

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { hashRushInviteCopy } from './invite-copy'

export type HashRushListedRoom = {
  id: string
  host: string
  people: number
  bots: number
  open: number
  map: string
  teams: boolean
  playing: boolean
}

const MAP_ICONS: Record<string, string> = { meadow: '🌻', desert: '🌵', factory: '🏭', ice: '🧊', beach: '🏖️', graveyard: '👻', sky: '☁️' }
const REFRESH_MS = 5000

export function parseHashRushListedRooms(body: unknown): HashRushListedRoom[] {
  const rows = body && typeof body === 'object' && Array.isArray((body as { rooms?: unknown }).rooms) ? (body as { rooms: unknown[] }).rooms : []
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id) return []
    return [{
      id: r.id,
      host: typeof r.host === 'string' ? r.host : '',
      people: num(r.people),
      bots: num(r.bots),
      open: num(r.open),
      map: typeof r.map === 'string' ? r.map : 'meadow',
      teams: r.teams === true,
      playing: r.playing === true,
    }]
  })
}

type Props = {
  uiLocale: string
  /** The page is up: it loads then, and keeps the list fresh. */
  active: boolean
  /** This phone is already in a game of its own room: joining another waits for leaving it. */
  playing: boolean
  onJoin: (room: string) => void
}

export default function HashRushRoomsPage({ uiLocale, active, playing, onJoin }: Props) {
  const copy = hashRushInviteCopy(uiLocale)
  const [rooms, setRooms] = useState<HashRushListedRoom[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(buildClientApiPath('/hash-rush/rooms'), { credentials: 'include', cache: 'no-store' })
      if (!response.ok) throw new Error(String(response.status))
      setRooms(parseHashRushListedRooms(await response.json()))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void load()
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [active, load])

  return (
    <div className="px-4 py-4" data-qa="hash-rush-rooms-page">
      <p className="mb-3 text-[0.86rem] text-gray-500">{copy.roomsHint}</p>
      {playing ? <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[0.86rem] font-semibold text-amber-800">{copy.roomsBusy}</p> : null}
      {rooms === null && !failed ? (
        <div className="flex justify-center py-10 text-gray-400"><Loader2 className="animate-spin" size={22} /></div>
      ) : failed && !rooms?.length ? (
        <p className="py-10 text-center text-[0.9rem] text-gray-500" data-qa="hash-rush-rooms-failed">{copy.roomsFailed}</p>
      ) : !rooms?.length ? (
        <p className="py-10 text-center text-[0.9rem] text-gray-500" data-qa="hash-rush-rooms-empty">{copy.roomsEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((room) => (
            <li key={room.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 px-3 py-3" data-qa="hash-rush-rooms-row">
              <span className="text-[1.4rem]" aria-hidden="true">{MAP_ICONS[room.map] ?? '🌻'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-semibold text-gray-900">{copy.roomOf(room.host)}</p>
                <p className="text-[0.8rem] text-gray-500">
                  <span className={room.playing ? 'font-semibold text-rose-500' : 'font-semibold text-emerald-600'}>{room.playing ? copy.roomPlaying : copy.roomWaiting}</span>
                  {' · '}
                  {copy.roomPeople(room.people, room.bots, room.open)}
                </p>
              </div>
              <button
                type="button"
                disabled={playing || room.open === 0}
                onClick={() => onJoin(room.id)}
                className="h-10 shrink-0 rounded-xl bg-emerald-500 px-4 text-[0.9rem] font-semibold text-white active:bg-emerald-600 disabled:opacity-40"
                data-qa="hash-rush-rooms-join"
              >
                {copy.roomJoin}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
