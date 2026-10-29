'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCheck, Heart, Loader2, MessageCircle, RefreshCw, Reply, UserPlus, type LucideIcon } from 'lucide-react'
import type { ActivityItem, ActivityListData, ActivityOperatorStat, OperatorActivityType } from '@/server/operator-activity/activity'
import { InboxAvatar, KoreanViewSwitch } from '../../inbox/_components/inbox-ui'
import { useAdminInboxRealtime } from '../../inbox/_components/use-admin-inbox-realtime'
import { useStaffKoreanView } from '../../inbox/_components/use-staff-korean-view'
import { formatInboxRelativeTime, formatInboxUnreadCount, inboxPersonLabel } from '../../inbox/_lib/inbox-format'

const LIST_ENDPOINT = '/admin/activity/api/items'
const READ_ENDPOINT = '/admin/activity/api/read'
const LIST_PATH = '/admin/activity'
const PAGE_SIZE = 30
const MAX_REFRESH_SIZE = 100
const CLOCK_TICK_MS = 30_000
const ADMIN_INBOX_UPDATED_EVENT = 'mingle:admin-inbox-updated'
const OPERATOR_ID_PATTERN = /^[\w-]{1,128}$/

class ActivityUnauthorizedError extends Error {}

function goToLogin(): void {
  window.location.assign(`/admin?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)
}

async function fetchActivity(args: { operatorId: string | null; cursor?: string | null; limit?: number; korean: boolean }): Promise<ActivityListData> {
  const params = new URLSearchParams()
  if (args.operatorId) params.set('operator', args.operatorId)
  if (args.cursor) params.set('cursor', args.cursor)
  if (args.limit) params.set('limit', String(args.limit))
  if (args.korean) params.set('ko', '1')
  const response = await fetch(`${LIST_ENDPOINT}?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' })
  if (response.status === 401) throw new ActivityUnauthorizedError('unauthorized')
  if (!response.ok) throw new Error(`activity_list_${response.status}`)
  return await response.json() as ActivityListData
}

const TYPE_COPY: Record<OperatorActivityType, { icon: LucideIcon; tone: string; text: string }> = {
  follow: { icon: UserPlus, tone: 'bg-violet-500', text: '님이 팔로우했습니다' },
  post_like: { icon: Heart, tone: 'bg-rose-500', text: '님이 글을 좋아합니다' },
  comment: { icon: MessageCircle, tone: 'bg-sky-500', text: '님이 댓글을 남겼습니다' },
  comment_reply: { icon: Reply, tone: 'bg-sky-500', text: '님이 답글을 남겼습니다' },
  comment_like: { icon: Heart, tone: 'bg-rose-500', text: '님이 댓글을 좋아합니다' },
}

/** The thread an item opens, read as the operator that received it; null when there is nothing to open. */
export function activityItemHref(item: Pick<ActivityItem, 'postId' | 'postUnavailable' | 'commentId' | 'operator'>): string | null {
  if (!item.postId || item.postUnavailable) return null
  const params = new URLSearchParams({ as: item.operator.userId })
  if (item.commentId) params.set('comment', item.commentId)
  return `${LIST_PATH}/posts/${encodeURIComponent(item.postId)}?${params.toString()}`
}

function ActivityCard({ item, nowMs, korean, active }: { item: ActivityItem; nowMs: number; korean: boolean; active: boolean }) {
  const copy = TYPE_COPY[item.type] ?? TYPE_COPY.comment
  const Icon = copy.icon
  const href = activityItemHref(item)
  const isOwnComment = item.type === 'comment_like'
  const commentText = (korean && item.commentKoText) || item.commentText
  const body = (
    <>
      <span className="relative shrink-0">
        <InboxAvatar person={item.actor} size={44} />
        <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-white ${copy.tone}`}>
          <Icon size={11} strokeWidth={2.6} aria-hidden="true" />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-start gap-1.5">
          <span className={`min-w-0 flex-1 break-words text-sm leading-5 ${item.isRead ? 'text-slate-700' : 'font-medium text-slate-900'}`}>
            <span className="font-semibold">{inboxPersonLabel(item.actor)}</span>
            {copy.text}
          </span>
          <span className="shrink-0 pl-1 text-xs leading-5 text-slate-500">{formatInboxRelativeTime(item.createdAt, nowMs)}</span>
          {item.isRead ? null : (
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" aria-label="안 읽음" />
          )}
        </span>
        <span className="mt-1 flex min-w-0 items-center">
          <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-200">
            <span className="shrink-0 text-sky-600">받은 계정</span>
            <span aria-hidden="true" className="shrink-0 text-sky-400">·</span>
            <span className="truncate">{inboxPersonLabel(item.operator)}</span>
          </span>
        </span>
        {commentText || item.commentHasImage ? (
          <span className="mt-1.5 line-clamp-3 break-words rounded-xl bg-slate-100 px-2.5 py-1.5 text-sm leading-5 text-slate-800">
            {isOwnComment ? <span className="text-slate-500">내 댓글 · </span> : null}
            {commentText || '📷 사진'}
          </span>
        ) : item.commentUnavailable ? (
          <span className="mt-1.5 text-xs text-slate-400">삭제되었거나 숨겨진 댓글입니다.</span>
        ) : null}
        {item.postExcerpt ? (
          <span className="mt-1 line-clamp-1 break-words text-xs text-slate-500">글 · {item.postExcerpt}</span>
        ) : item.postUnavailable ? (
          <span className="mt-1 text-xs text-slate-400">삭제되었거나 숨겨진 글입니다.</span>
        ) : null}
      </span>
    </>
  )
  const className = `flex gap-3 rounded-2xl border p-3 shadow-sm transition-colors ${
    active ? 'border-sky-400 bg-sky-50/60 ring-1 ring-sky-300' : 'border-slate-200 bg-white'
  }`
  return (
    <li>
      {href ? (
        <Link href={href} prefetch={false} aria-current={active ? 'page' : undefined} className={`${className} active:bg-slate-50`}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  )
}

function FilterChip({ label, count, active, person, onSelect }: {
  label: string
  count: number
  active: boolean
  person?: ActivityOperatorStat
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
 * Every operator account's notifications in one list (phone first): follows,
 * likes, comments and replies from real users, newest first, with one filter
 * chip per operator. A comment or like opens its thread, where staff answer
 * as that operator. Live through the admin realtime key, with a poll fallback.
 */
export function ActivityListView({ initialData }: { initialData: ActivityListData }) {
  const [operatorId, setOperatorId] = useState<string | null>(null)
  const [data, setData] = useState<ActivityListData>(initialData)
  const [nowMs, setNowMs] = useState(initialData.serverNowMs)
  const [loadingMore, setLoadingMore] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [markingRead, setMarkingRead] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [korean, setKorean] = useStaffKoreanView()
  const requestSeqRef = useRef(0)
  const loadedCountRef = useRef(initialData.items.length)

  useEffect(() => {
    loadedCountRef.current = data.items.length
  }, [data.items.length])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  /** Reloads the loaded window (first page, as many items as are on screen). */
  const refresh = useCallback(async () => {
    const seq = ++requestSeqRef.current
    try {
      const next = await fetchActivity({
        operatorId,
        limit: Math.min(MAX_REFRESH_SIZE, Math.max(PAGE_SIZE, loadedCountRef.current)),
        korean,
      })
      if (seq !== requestSeqRef.current) return
      setData(next)
      setNowMs(Date.now())
      setRefreshFailed(false)
    } catch (error) {
      if (error instanceof ActivityUnauthorizedError) goToLogin()
      else if (seq === requestSeqRef.current) setRefreshFailed(true)
      throw error
    }
  }, [operatorId, korean])

  useAdminInboxRealtime(refresh)

  // An open thread (beside the list on wide screens) reports reads and replies through this event.
  useEffect(() => {
    const onUpdated = () => { void refresh().catch(() => {}) }
    window.addEventListener(ADMIN_INBOX_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(ADMIN_INBOX_UPDATED_EVENT, onUpdated)
  }, [refresh])

  // Korean comment text is fetched only while the switch is on.
  const koreanRef = useRef(korean)
  useEffect(() => {
    if (koreanRef.current === korean) return
    koreanRef.current = korean
    void refresh().catch(() => {})
  }, [korean, refresh])
  useEffect(() => {
    // The server rendered without Korean text; fill it once after hydration.
    if (korean) void refresh().catch(() => {})
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectOperator = useCallback((next: string | null) => {
    if (next === operatorId) return
    setOperatorId(next)
    setSwitching(true)
    if (window.location.pathname === LIST_PATH) {
      window.history.replaceState(null, '', next ? `${LIST_PATH}?operator=${encodeURIComponent(next)}` : LIST_PATH)
    }
    const seq = ++requestSeqRef.current
    void fetchActivity({ operatorId: next, korean }).then((result) => {
      if (seq !== requestSeqRef.current) return
      setData(result)
      setNowMs(Date.now())
      setRefreshFailed(false)
    }, (error) => {
      if (error instanceof ActivityUnauthorizedError) goToLogin()
      else if (seq === requestSeqRef.current) setRefreshFailed(true)
    }).finally(() => {
      if (seq === requestSeqRef.current) setSwitching(false)
    })
  }, [korean, operatorId])

  // The list is rendered by the layout, which cannot read the query: apply `?operator=` once.
  useEffect(() => {
    if (window.location.pathname !== LIST_PATH) return
    const requested = new URLSearchParams(window.location.search).get('operator')?.trim() ?? ''
    if (OPERATOR_ID_PATTERN.test(requested)) selectOperator(requested)
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMore = useCallback(async () => {
    if (!data.nextCursor || loadingMore) return
    setLoadingMore(true)
    const seq = requestSeqRef.current
    try {
      const next = await fetchActivity({ operatorId, cursor: data.nextCursor, korean })
      if (seq !== requestSeqRef.current) return
      setData((current) => {
        const known = new Set(current.items.map((item) => item.id))
        return {
          ...next,
          // Keep the first read's snapshot: "모두 읽음" must not cover rows that arrived later.
          readBefore: current.readBefore,
          items: [...current.items, ...next.items.filter((item) => !known.has(item.id))],
        }
      })
    } catch (error) {
      if (error instanceof ActivityUnauthorizedError) goToLogin()
      else setRefreshFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }, [data.nextCursor, korean, loadingMore, operatorId])

  const manualRefresh = useCallback(() => {
    setRefreshing(true)
    void refresh().catch(() => {}).finally(() => setRefreshing(false))
  }, [refresh])

  const markAllRead = useCallback(async () => {
    if (markingRead) return
    setMarkingRead(true)
    try {
      const response = await fetch(READ_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operatorUserId: operatorId, before: data.readBefore }),
      })
      if (response.status === 401) {
        goToLogin()
        return
      }
      if (!response.ok) throw new Error(`activity_read_${response.status}`)
      // Refreshes this list and the tab badge.
      window.dispatchEvent(new CustomEvent(ADMIN_INBOX_UPDATED_EVENT))
    } catch {
      setRefreshFailed(true)
    } finally {
      setMarkingRead(false)
    }
  }, [data.readBefore, markingRead, operatorId])

  const pathname = usePathname() ?? ''
  const openPostId = pathname.startsWith(`${LIST_PATH}/posts/`)
    ? decodeURIComponent(pathname.slice(`${LIST_PATH}/posts/`.length).split('/')[0])
    : null
  const activeOperator = operatorId ? data.operators.find((operator) => operator.userId === operatorId) ?? null : null
  const visibleUnread = activeOperator ? activeOperator.unreadCount : data.unreadTotal

  return (
    <div className="min-h-dvh bg-slate-50 px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-4 text-slate-900 lg:min-h-full lg:pb-6">
      <div className="mx-auto flex max-w-xl flex-col gap-3">
        <header className="flex items-center gap-2">
          <h1 className="text-xl font-bold">알림</h1>
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

        <p className="break-words text-sm text-slate-500">
          운영 계정이 받은 팔로우, 좋아요, 댓글, 답글입니다. 댓글을 열면 그 운영 계정으로 답글을 달 수 있습니다.
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

        {visibleUnread > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={markingRead}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 self-start rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 active:bg-slate-100 disabled:opacity-60"
          >
            {markingRead ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CheckCheck size={16} aria-hidden="true" />}
            {activeOperator ? `${inboxPersonLabel(activeOperator)} 알림 모두 읽음` : '모두 읽음'}
          </button>
        ) : null}

        {refreshFailed ? (
          <p role="status" className="break-words rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            알림을 새로 고치지 못했습니다. 잠시 후 자동으로 다시 시도합니다.
          </p>
        ) : null}

        {switching ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500" role="status">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> 불러오는 중…
          </div>
        ) : data.items.length === 0 ? (
          <div className="break-words rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
            {activeOperator
              ? `${inboxPersonLabel(activeOperator)} 계정이 받은 알림이 아직 없습니다.`
              : '아직 운영 계정이 받은 알림이 없습니다.'}
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="알림 목록">
            {data.items.map((item) => (
              <ActivityCard
                key={item.id}
                item={item}
                nowMs={nowMs}
                korean={korean}
                active={Boolean(openPostId) && item.postId === openPostId}
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
    </div>
  )
}
