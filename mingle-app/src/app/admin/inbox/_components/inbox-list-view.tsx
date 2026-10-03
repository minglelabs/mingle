'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { InboxListResult, InboxOperatorStat, InboxRoomSummary, InboxSummary } from '@/server/operator-inbox/inbox'
import {
  formatInboxRelativeTime,
  formatInboxUnreadCount,
  inboxCounterpartTitle,
  inboxPersonLabel,
} from '../_lib/inbox-format'
import { InboxAccountTag, InboxAvatar, KoreanViewSwitch, OperatorChip } from './inbox-ui'
import { useAdminInboxRealtime } from './use-admin-inbox-realtime'
import { useStaffKoreanView } from './use-staff-korean-view'

export type InboxListData = InboxListResult & InboxSummary & { serverNowMs: number }

const LIST_ENDPOINT = '/admin/inbox/api/rooms'
const LIST_PATH = '/admin/inbox'
const OPERATOR_ID_PATTERN = /^[\w-]{1,128}$/
const PAGE_SIZE = 20
const MAX_REFRESH_SIZE = 50
const CLOCK_TICK_MS = 30_000

class InboxUnauthorizedError extends Error {}

function goToLogin(): void {
  window.location.assign(`/admin?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)
}

async function fetchInboxList(args: { operatorId: string | null; cursor?: string | null; limit?: number; korean: boolean }): Promise<InboxListData> {
  const params = new URLSearchParams()
  if (args.operatorId) params.set('operator', args.operatorId)
  if (args.cursor) params.set('cursor', args.cursor)
  if (args.limit) params.set('limit', String(args.limit))
  if (args.korean) params.set('ko', '1')
  const response = await fetch(`${LIST_ENDPOINT}?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' })
  if (response.status === 401) throw new InboxUnauthorizedError('unauthorized')
  if (!response.ok) throw new Error(`inbox_list_${response.status}`)
  return await response.json() as InboxListData
}

function roomHref(room: InboxRoomSummary, operatorId: string | null): string {
  const base = `/admin/inbox/${encodeURIComponent(room.conversationId)}`
  const as = operatorId && room.operators.some((operator) => operator.userId === operatorId) ? operatorId : null
  return as ? `${base}?as=${encodeURIComponent(as)}` : base
}

function previewText(room: InboxRoomSummary, korean: boolean): string {
  const preview = room.latestMessage
  if (!preview) return '아직 메시지가 없습니다'
  if (preview.kind === 'photo') return '📷 사진'
  return (korean && preview.koText) || preview.text || '(내용 없음)'
}

function RoomCard({ room, nowMs, korean, operatorId, active }: {
  room: InboxRoomSummary
  nowMs: number
  korean: boolean
  operatorId: string | null
  /** The room open in the detail pane (wide screens). */
  active: boolean
}) {
  const counterpart = room.counterparts[0] ?? null
  const unread = formatInboxUnreadCount(room.unreadCount)
  const preview = room.latestMessage
  return (
    <li>
      <Link
        href={roomHref(room, operatorId)}
        prefetch={false}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-[76px] gap-3 rounded-2xl border p-3 shadow-sm transition-colors active:bg-slate-50 ${
          active ? 'border-sky-400 bg-sky-50/60 ring-1 ring-sky-300' : 'border-slate-200 bg-white'
        }`}
      >
        <span className="relative shrink-0">
          <InboxAvatar person={counterpart} size={48} />
          {unread ? (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-sky-500" aria-hidden="true" />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[15px] font-semibold text-slate-900">
              {inboxCounterpartTitle(room.counterparts)}
            </span>
            {counterpart ? <InboxAccountTag person={counterpart} /> : null}
            <span className="ml-auto shrink-0 pl-1 text-xs text-slate-500">
              {formatInboxRelativeTime(room.latestMessage?.createdAt ?? room.activityAt, nowMs)}
            </span>
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            {room.operators.map((operator) => (
              <OperatorChip key={operator.userId} operator={operator} />
            ))}
            {room.isGroup ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">그룹</span>
            ) : null}
            {room.blocked ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">차단됨</span>
            ) : null}
          </span>
          <span className="mt-1.5 flex min-w-0 items-start gap-2">
            <span
              className={`line-clamp-2 min-w-0 flex-1 break-words text-sm leading-5 ${
                unread ? 'font-medium text-slate-900' : 'text-slate-600'
              }`}
            >
              {preview?.fromOperator ? <span className="font-normal text-slate-400">보냄 · </span> : null}
              {previewText(room, korean)}
            </span>
            {unread ? (
              <span
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-500 px-1.5 text-xs font-semibold text-white"
                aria-label={`안 읽은 메시지 ${unread}개`}
              >
                {unread}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  )
}

function FilterChip({ label, count, active, person, onSelect }: {
  label: string
  count: number
  active: boolean
  person?: InboxOperatorStat
  onSelect: () => void
}) {
  const unread = formatInboxUnreadCount(count)
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 active:bg-slate-100'
      }`}
    >
      {person ? <InboxAvatar person={person} size={24} /> : null}
      <span className="max-w-[9rem] truncate">{label}</span>
      {unread ? (
        <span className={`rounded-full px-1.5 text-xs font-semibold ${active ? 'bg-white text-slate-900' : 'bg-sky-500 text-white'}`}>
          {unread}
        </span>
      ) : null}
    </button>
  )
}

/**
 * The unified operator inbox (phone first): every room an operator account
 * is in, newest first, with a Korean preview switch and one filter chip per
 * operator. Live through the admin realtime key, with a 20 s poll fallback.
 */
export function InboxListView({ initialData, initialOperatorId }: {
  initialData: InboxListData
  initialOperatorId: string | null
}) {
  const [operatorId, setOperatorId] = useState<string | null>(initialOperatorId)
  const [data, setData] = useState<InboxListData>(initialData)
  const [nowMs, setNowMs] = useState(initialData.serverNowMs)
  const [loadingMore, setLoadingMore] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [korean, setKorean] = useStaffKoreanView()
  const requestSeqRef = useRef(0)
  const loadedCountRef = useRef(initialData.rooms.length)

  useEffect(() => {
    loadedCountRef.current = data.rooms.length
  }, [data.rooms.length])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  /** Reloads the loaded window (first page, as many rooms as are on screen). */
  const refresh = useCallback(async () => {
    const seq = ++requestSeqRef.current
    try {
      const next = await fetchInboxList({
        operatorId,
        limit: Math.min(MAX_REFRESH_SIZE, Math.max(PAGE_SIZE, loadedCountRef.current)),
        korean,
      })
      if (seq !== requestSeqRef.current) return
      setData(next)
      setNowMs(Date.now())
      setRefreshFailed(false)
    } catch (error) {
      if (error instanceof InboxUnauthorizedError) goToLogin()
      else if (seq === requestSeqRef.current) setRefreshFailed(true)
      throw error
    }
  }, [operatorId, korean])

  useAdminInboxRealtime(refresh)

  // An open room beside the list (wide screens) reports reads and replies through this event.
  useEffect(() => {
    const onUpdated = () => { void refresh().catch(() => {}) }
    window.addEventListener('mingle:admin-inbox-updated', onUpdated)
    return () => window.removeEventListener('mingle:admin-inbox-updated', onUpdated)
  }, [refresh])

  // Korean previews are fetched only while the switch is on.
  const koreanRef = useRef(korean)
  useEffect(() => {
    if (koreanRef.current === korean) return
    koreanRef.current = korean
    void refresh().catch(() => {})
  }, [korean, refresh])
  useEffect(() => {
    // The server rendered without Korean previews; fill them once after hydration.
    if (korean) void refresh().catch(() => {})
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectOperator = useCallback((next: string | null) => {
    if (next === operatorId) return
    setOperatorId(next)
    setSwitching(true)
    // Shareable URL without a second server render (this component fetches the list itself).
    // Beside an open room (wide screens) the URL belongs to that room.
    if (window.location.pathname === LIST_PATH) {
      window.history.replaceState(null, '', next ? `${LIST_PATH}?operator=${encodeURIComponent(next)}` : LIST_PATH)
    }
    const seq = ++requestSeqRef.current
    void fetchInboxList({ operatorId: next, korean }).then((result) => {
      if (seq !== requestSeqRef.current) return
      setData(result)
      setNowMs(Date.now())
      setRefreshFailed(false)
    }, (error) => {
      if (error instanceof InboxUnauthorizedError) goToLogin()
      else if (seq === requestSeqRef.current) setRefreshFailed(true)
    }).finally(() => {
      if (seq === requestSeqRef.current) setSwitching(false)
    })
  }, [korean, operatorId])

  const loadMore = useCallback(async () => {
    if (!data.nextCursor || loadingMore) return
    setLoadingMore(true)
    const seq = requestSeqRef.current
    try {
      const next = await fetchInboxList({ operatorId, cursor: data.nextCursor, korean })
      if (seq !== requestSeqRef.current) return
      setData((current) => {
        const known = new Set(current.rooms.map((room) => room.conversationId))
        return {
          ...next,
          rooms: [...current.rooms, ...next.rooms.filter((room) => !known.has(room.conversationId))],
        }
      })
    } catch (error) {
      if (error instanceof InboxUnauthorizedError) goToLogin()
      else setRefreshFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }, [data.nextCursor, korean, loadingMore, operatorId])

  // The list is rendered by the layout, which cannot read the query: apply `?operator=` once.
  useEffect(() => {
    if (window.location.pathname !== LIST_PATH) return
    const requested = new URLSearchParams(window.location.search).get('operator')?.trim() ?? ''
    if (OPERATOR_ID_PATTERN.test(requested)) selectOperator(requested)
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const manualRefresh = useCallback(() => {
    setRefreshing(true)
    void refresh().catch(() => {}).finally(() => setRefreshing(false))
  }, [refresh])

  const pathname = usePathname() ?? ''
  const openConversationId = pathname.startsWith(`${LIST_PATH}/`) ? decodeURIComponent(pathname.slice(LIST_PATH.length + 1).split('/')[0]) : null
  const activeOperator = operatorId ? data.operators.find((operator) => operator.userId === operatorId) ?? null : null

  return (
    <main className="min-h-dvh bg-slate-50 px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-4 text-slate-900 lg:min-h-full lg:pb-6">
      <div className="mx-auto flex max-w-xl flex-col gap-3">
        <header className="flex items-center gap-2">
          <h1 className="text-xl font-bold">인박스</h1>
          {data.unreadTotal > 0 ? (
            <span className="rounded-full bg-sky-500 px-2 py-0.5 text-xs font-semibold text-white">
              안 읽음 {formatInboxUnreadCount(data.unreadTotal)}
            </span>
          ) : null}
          <span className="ml-auto flex items-center">
            <KoreanViewSwitch enabled={korean} onChange={setKorean} />
            <button
              type="button"
              onClick={manualRefresh}
              aria-label="새로고침"
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-200"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          </span>
        </header>

        <p className="text-sm text-slate-500 break-words">
          운영 계정으로 받은 대화입니다. 답장은 그 운영 계정 이름으로, 계정의 언어로 번역되어 전송됩니다.
        </p>

        {data.operators.length > 0 ? (
          <nav aria-label="운영 계정별 보기" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
            <div className="flex w-max gap-2 pb-1">
              <FilterChip label="전체" count={data.unreadTotal} active={!operatorId} onSelect={() => selectOperator(null)} />
              {data.operators.map((operator) => (
                <FilterChip
                  key={operator.userId}
                  label={inboxPersonLabel(operator)}
                  count={operator.unreadCount}
                  active={operatorId === operator.userId}
                  person={operator}
                  onSelect={() => selectOperator(operator.userId)}
                />
              ))}
            </div>
          </nav>
        ) : null}

        {refreshFailed ? (
          <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 break-words">
            목록을 새로 고치지 못했습니다. 잠시 후 자동으로 다시 시도합니다.
          </p>
        ) : null}

        {switching ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> 불러오는 중…
          </div>
        ) : data.rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500 break-words">
            {activeOperator
              ? `${inboxPersonLabel(activeOperator)} 계정의 대화방이 아직 없습니다.`
              : '아직 운영 계정으로 들어온 대화가 없습니다.'}
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="대화방 목록">
            {data.rooms.map((room) => (
              <RoomCard
                key={room.conversationId}
                room={room}
                nowMs={nowMs}
                korean={korean}
                operatorId={operatorId}
                active={room.conversationId === openConversationId}
              />
            ))}
          </ul>
        )}

        {!switching && data.nextCursor ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-60"
          >
            {loadingMore ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            {loadingMore ? '불러오는 중…' : '더 보기'}
          </button>
        ) : null}
      </div>
    </main>
  )
}
