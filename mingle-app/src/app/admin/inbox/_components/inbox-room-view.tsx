'use client'

import Link from 'next/link'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { ArrowDown, ChevronLeft, Info, Loader2, SendHorizontal } from 'lucide-react'
import ChatBubble from '@/components/LivePhoneDemo/ChatBubble'
import {
  ConversationImageSrcProvider,
  type ConversationImageSrcResolver,
} from '@/components/LivePhoneDemo/ConversationImageBubble'
import { accountBadgeCopy } from '@/i18n/account-badge-copy'
import type { ConversationHydrationCursor } from '@/lib/app-conversations'
import type { InboxRoomView } from '@/server/operator-inbox/inbox'
import type { SendOperatorMessageResult } from '@/server/operator-inbox/send'
import { inboxCounterpartTitle, inboxLanguageName, inboxPersonLabel } from '../_lib/inbox-format'
import {
  createReplyRequestId,
  describeReplyError,
  isRetryableReplyError,
  reconcilePendingReplies,
  removePendingReply,
  upsertPendingReply,
  type PendingReply,
} from '../_lib/reply-outbox'
import {
  STAFF_KOREAN,
  buildRoomTimeline,
  mergeUtterancePages,
  staffKoreanCandidateId,
  toBubbleUtterance,
  upsertUtterance,
  withStaffKorean,
  type RoomTimelineItem,
  type RoomUtterance,
} from '../_lib/room-timeline'
import { InboxAvatar, KoreanViewSwitch } from './inbox-ui'
import { useAdminInboxRealtime } from './use-admin-inbox-realtime'
import { useStaffKoreanView } from './use-staff-korean-view'
import { useVisualViewportBox } from './use-visual-viewport-box'

const KO_BADGE_COPY = accountBadgeCopy('ko')
const REPLY_MAX_LENGTH = 2000
const TRANSLATE_BATCH_SIZE = 50
const NEAR_BOTTOM_PX = 120
const COMPOSER_MAX_HEIGHT_PX = 144
const ADMIN_INBOX_UPDATED_EVENT = 'mingle:admin-inbox-updated'

// The admin reads chat photos through its own proxy (it has no member session).
const resolveInboxImageSrc: ConversationImageSrcResolver = (image) => `/admin/inbox/api/images/${encodeURIComponent(image.messageId)}`

function goToLogin(): void {
  window.location.assign(`/admin?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)
}

function dispatchAdminInboxUpdated(): void {
  window.dispatchEvent(new CustomEvent(ADMIN_INBOX_UPDATED_EVENT))
}

const UNAVAILABLE_COPY = {
  blocked: '상대방과 차단 관계라 답장할 수 없습니다.',
  no_recipients: '상대방이 대화방을 나가 답장할 수 없습니다.',
  operator_inactive: '비활성화된 운영 계정이라 답장할 수 없습니다.',
} as const

function PendingReplyRow({ reply, onRetry, onDiscard }: {
  reply: PendingReply
  onRetry: (reply: PendingReply) => void
  onDiscard: (requestId: string) => void
}) {
  const failed = reply.status === 'failed'
  return (
    <div className="flex justify-end px-3 py-1">
      <div className="flex max-w-[82%] flex-col items-end">
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl rounded-tr-md px-3 py-2 text-[15px] leading-6 ${
            failed ? 'bg-rose-50 text-rose-900 ring-1 ring-rose-200' : 'bg-amber-50/80 text-slate-500'
          }`}
        >
          {reply.text}
        </div>
        {failed ? (
          <div className="mt-1 flex flex-col items-end gap-1">
            <p role="alert" className="max-w-full break-words text-right text-xs text-rose-700">{describeReplyError(reply.error)}</p>
            <div className="flex gap-2">
              {isRetryableReplyError(reply.error) ? (
                <button
                  type="button"
                  onClick={() => onRetry(reply)}
                  className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-sky-700 ring-1 ring-sky-200 active:bg-sky-50"
                >
                  다시 보내기
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onDiscard(reply.requestId)}
                className="min-h-11 rounded-full bg-white px-4 text-sm text-slate-600 ring-1 ring-slate-200 active:bg-slate-100"
              >
                삭제
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500" role="status">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" /> 번역해서 보내는 중…
          </p>
        )}
      </div>
    </div>
  )
}

type MessageListProps = {
  timeline: RoomTimelineItem[]
  korean: boolean
  koById: Record<string, string | null>
  displayLanguage: string | undefined
  languageOrder: readonly string[]
  viewerUserId: string
}

/** The bubbles, through the app's own ChatBubble with the operator as viewer. Memoized: typing never re-renders it. */
const RoomMessageList = memo(function RoomMessageList({
  timeline,
  korean,
  koById,
  displayLanguage,
  languageOrder,
  viewerUserId,
}: MessageListProps) {
  return (
    <ConversationImageSrcProvider resolve={resolveInboxImageSrc}>
      {timeline.map((item) => {
        if (item.kind === 'notice') {
          return <p key={item.key} className="px-6 py-2 text-center text-xs text-slate-500 break-words">{item.text}</p>
        }
        const bubble = toBubbleUtterance(item.utterance)
        const koId = korean ? staffKoreanCandidateId(item.utterance) : null
        return (
          <div key={item.key} className="px-3 py-1">
            <ChatBubble
              utterance={koId ? withStaffKorean(bubble, koById[koId], !(koId in koById)) : bubble}
              uiLocale="ko"
              defaultDisplayLanguage={displayLanguage}
              preferredDisplayLanguage={displayLanguage}
              languageOrder={languageOrder}
              viewerUserId={viewerUserId}
              shouldAnimateEntrance={false}
              bubbleTextClassName="text-[15px]"
            />
          </div>
        )
      })}
    </ConversationImageSrcProvider>
  )
})

/** The reply box. Owns its draft, so typing re-renders only this. */
function ReplyComposer({ hint, keyboardOpen, onSend }: {
  hint: string
  keyboardOpen: boolean
  onSend: (text: string) => void
}) {
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const trimmedLength = draft.trim().length
  const tooLong = trimmedLength > REPLY_MAX_LENGTH

  const submit = useCallback(() => {
    const text = draft.trim()
    if (!text || text.length > REPLY_MAX_LENGTH) return
    onSend(text)
    setDraft('')
    const textarea = textareaRef.current
    if (textarea) textarea.style.height = ''
  }, [draft, onSend])

  const onChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)
    const textarea = event.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`
  }, [])

  const onSubmit = useCallback((event: FormEvent) => {
    event.preventDefault()
    submit()
  }, [submit])

  return (
    <form
      onSubmit={onSubmit}
      className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2"
      style={{ paddingBottom: keyboardOpen ? 8 : 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      <p className="mb-1.5 break-words text-xs text-slate-500">{hint}</p>
      <div className="flex items-end gap-2">
        <label htmlFor="admin-inbox-reply" className="sr-only">답장 입력</label>
        <textarea
          id="admin-inbox-reply"
          ref={textareaRef}
          value={draft}
          onChange={onChange}
          onKeyDown={(event) => {
            // Enter adds a line (phones); Cmd/Ctrl+Enter sends (desktop).
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="어떤 언어로 써도 번역해서 보냅니다"
          className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-base leading-6 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
        />
        <button
          type="submit"
          disabled={trimmedLength === 0 || tooLong}
          aria-label="보내기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white active:bg-sky-600 disabled:bg-slate-300"
        >
          <SendHorizontal size={20} aria-hidden="true" />
        </button>
      </div>
      {trimmedLength > REPLY_MAX_LENGTH - 200 ? (
        <p className={`mt-1 text-right text-xs ${tooLong ? 'text-rose-700' : 'text-slate-500'}`}>
          {trimmedLength.toLocaleString('ko-KR')}/{REPLY_MAX_LENGTH.toLocaleString('ko-KR')}
        </p>
      ) : null}
    </form>
  )
}

function missingKoreanIds(utterances: RoomUtterance[], known: Record<string, string | null>, requested: Set<string>): string[] {
  const ids: string[] = []
  for (const utterance of utterances) {
    const id = staffKoreanCandidateId(utterance)
    if (id && !(id in known) && !requested.has(id)) ids.push(id)
  }
  return ids
}

/**
 * One operator room, read exactly as the operator account sees it and
 * answered as that account. Covers the admin shell (a chat hides the tabs),
 * sized to the visual viewport so the composer stays above the iOS keyboard.
 */
export function InboxRoomView({ initialView }: { initialView: InboxRoomView }) {
  const conversationId = initialView.room.conversationId
  const [room, setRoom] = useState(initialView.room)
  const [conversation, setConversation] = useState(initialView.hydration.conversation)
  const [notices, setNotices] = useState({
    leave: initialView.hydration.leaveNotices,
    invite: initialView.hydration.inviteNotices,
  })
  const [utterances, setUtterances] = useState<RoomUtterance[]>(initialView.hydration.utterances)
  const [olderCursor, setOlderCursor] = useState<ConversationHydrationCursor | null>(initialView.hydration.oldestMessageCursor)
  const [hasMoreOlder, setHasMoreOlder] = useState(initialView.hydration.hasMoreUtterances)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderFailed, setOlderFailed] = useState(false)
  const [roomGone, setRoomGone] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [pending, setPending] = useState<PendingReply[]>([])
  const [korean, setKorean] = useStaffKoreanView()
  const [koById, setKoById] = useState<Record<string, string | null>>({})
  const [atBottom, setAtBottom] = useState(true)
  const box = useVisualViewportBox()

  const operator = room.operator
  const operatorId = operator.userId
  const scrollerRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const restoreFromBottomRef = useRef<number | null>(null)
  const scrollToBottomRef = useRef(true)
  const koRequestedRef = useRef(new Set<string>())

  // The room covers the whole screen; the page behind it must not scroll.
  useEffect(() => {
    const { style } = document.body
    const previous = { overflow: style.overflow, overscrollBehavior: style.overscrollBehavior }
    style.overflow = 'hidden'
    style.overscrollBehavior = 'none'
    return () => {
      style.overflow = previous.overflow
      style.overscrollBehavior = previous.overscrollBehavior
    }
  }, [])

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/admin/inbox/api/rooms/${encodeURIComponent(conversationId)}?as=${encodeURIComponent(operatorId)}`,
      { cache: 'no-store', credentials: 'same-origin' },
    )
    if (response.status === 401) {
      goToLogin()
      return
    }
    if (response.status === 404 || response.status === 403) {
      setRoomGone(true)
      return
    }
    if (!response.ok) {
      setRefreshFailed(true)
      throw new Error(`inbox_room_${response.status}`)
    }
    const next = await response.json() as InboxRoomView
    setRoom(next.room)
    setConversation(next.hydration.conversation)
    setNotices({ leave: next.hydration.leaveNotices, invite: next.hydration.inviteNotices })
    setUtterances((current) => mergeUtterancePages(current, next.hydration.utterances))
    setPending((current) => reconcilePendingReplies(current, next.hydration.utterances.map((utterance) => utterance.id)))
    setRefreshFailed(false)
    setRoomGone(false)
    dispatchAdminInboxUpdated()
  }, [conversationId, operatorId])

  useAdminInboxRealtime(refresh)

  // Reading the room clears its unread for this operator, like opening it in the app.
  const unreadCount = operator.unreadCount
  useEffect(() => {
    if (unreadCount <= 0 || document.visibilityState !== 'visible') return
    let cancelled = false
    void fetch(`/admin/inbox/api/rooms/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ as: operatorId }),
    }).then((response) => {
      if (cancelled || !response.ok) return
      setRoom((current) => (current.operator.userId === operatorId
        ? { ...current, operator: { ...current.operator, unreadCount: 0 } }
        : current))
      dispatchAdminInboxUpdated()
    }, () => {})
    return () => {
      cancelled = true
    }
  }, [conversationId, operatorId, unreadCount])

  // Staff-only Korean, fetched in batches for bubbles that lack it; never stored in the room.
  useEffect(() => {
    if (!korean) return
    const ids = missingKoreanIds(utterances, koById, koRequestedRef.current)
    if (ids.length === 0) return
    for (const id of ids) koRequestedRef.current.add(id)
    void (async () => {
      for (let index = 0; index < ids.length; index += TRANSLATE_BATCH_SIZE) {
        const batch = ids.slice(index, index + TRANSLATE_BATCH_SIZE)
        let translations: Record<string, unknown> = {}
        try {
          const response = await fetch(`/admin/inbox/api/rooms/${encodeURIComponent(conversationId)}/translate`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ messageIds: batch }),
          })
          if (response.ok) {
            const payload = await response.json() as { translations?: Record<string, unknown> }
            translations = payload.translations ?? {}
          }
        } catch {
          // Shown in the original; switching Korean off and on retries.
        }
        setKoById((current) => {
          const next = { ...current }
          for (const id of batch) {
            const text = translations[id]
            next[id] = typeof text === 'string' && text ? text : null
          }
          return next
        })
        for (const id of batch) koRequestedRef.current.delete(id)
      }
    })()
  }, [conversationId, koById, korean, utterances])

  const toggleKorean = useCallback((next: boolean) => {
    // Turning it back on retries the earlier failures.
    if (next) setKoById((current) => Object.fromEntries(Object.entries(current).filter(([, text]) => text !== null)))
    setKorean(next)
  }, [setKorean])

  const timeline = useMemo(() => buildRoomTimeline({
    utterances,
    leaveNotices: notices.leave,
    inviteNotices: notices.invite,
    hasMoreHistory: hasMoreOlder,
  }), [hasMoreOlder, notices, utterances])

  const displayLanguage = korean
    ? STAFF_KOREAN
    : (conversation.defaultDisplayLanguage || operator.personaLanguage || undefined)
  const selectedLanguages = conversation.selectedLanguages
  const languageOrder = useMemo(() => {
    const languages = selectedLanguages ?? []
    return korean && !languages.includes(STAFF_KOREAN) ? [...languages, STAFF_KOREAN] : languages
  }, [selectedLanguages, korean])

  const lastItemKey = `${timeline.at(-1)?.key ?? ''}:${pending.length}`
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    if (restoreFromBottomRef.current !== null) {
      // Older messages were prepended: keep the same message under the thumb.
      scroller.scrollTop = scroller.scrollHeight - restoreFromBottomRef.current
      restoreFromBottomRef.current = null
      return
    }
    if (scrollToBottomRef.current || atBottomRef.current) {
      scroller.scrollTop = scroller.scrollHeight
      scrollToBottomRef.current = false
    }
  }, [lastItemKey, utterances.length, box?.height])

  const onScroll = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const next = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_BOTTOM_PX
    if (next === atBottomRef.current) return
    atBottomRef.current = next
    setAtBottom(next)
  }, [])

  const scrollToBottom = useCallback(() => {
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [])

  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder) return
    setLoadingOlder(true)
    setOlderFailed(false)
    try {
      const params = new URLSearchParams({
        as: operatorId,
        beforeMs: String(olderCursor.createdAtMs),
        beforeId: olderCursor.messageId,
      })
      const response = await fetch(`/admin/inbox/api/rooms/${encodeURIComponent(conversationId)}?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (response.status === 401) {
        goToLogin()
        return
      }
      if (!response.ok) throw new Error(`inbox_older_${response.status}`)
      const next = await response.json() as InboxRoomView
      const scroller = scrollerRef.current
      restoreFromBottomRef.current = scroller ? scroller.scrollHeight - scroller.scrollTop : null
      setUtterances((current) => mergeUtterancePages(next.hydration.utterances, current))
      setOlderCursor(next.hydration.oldestMessageCursor)
      setHasMoreOlder(next.hydration.hasMoreUtterances)
    } catch {
      setOlderFailed(true)
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, loadingOlder, olderCursor, operatorId])

  const sendReply = useCallback(async (reply: PendingReply) => {
    setPending((current) => upsertPendingReply(current, { ...reply, status: 'sending', error: null }))
    try {
      const response = await fetch(`/admin/inbox/api/rooms/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: reply.text, as: operatorId, clientRequestId: reply.requestId }),
      })
      const payload = await response.json().catch(() => null) as { message?: SendOperatorMessageResult; error?: string } | null
      if (!response.ok || !payload?.message) {
        const error = response.status === 401 ? 'unauthorized' : (payload?.error ?? 'send_failed')
        setPending((current) => upsertPendingReply(current, { ...reply, status: 'failed', error }))
        return
      }
      const { speakerBadge: _, ...stored } = payload.message.utterance
      setUtterances((current) => upsertUtterance(current, stored))
      setPending((current) => removePendingReply(current, reply.requestId))
    } catch {
      setPending((current) => upsertPendingReply(current, { ...reply, status: 'failed', error: 'network' }))
    }
  }, [conversationId, operatorId])

  const onSend = useCallback((text: string) => {
    scrollToBottomRef.current = true
    void sendReply({ requestId: createReplyRequestId(), text, createdAtMs: Date.now(), status: 'sending', error: null })
  }, [sendReply])

  const discardReply = useCallback((requestId: string) => {
    setPending((current) => removePendingReply(current, requestId))
  }, [])

  const retryReply = useCallback((reply: PendingReply) => {
    void sendReply(reply)
  }, [sendReply])

  const counterpartTitle = inboxCounterpartTitle(room.counterparts)
  const operatorName = inboxPersonLabel(operator)
  const personaLanguageName = inboxLanguageName(operator.personaLanguage)
  const unavailable = roomGone
    ? '이 대화방을 더 이상 볼 수 없습니다.'
    : room.replyUnavailableReason ? UNAVAILABLE_COPY[room.replyUnavailableReason] : null

  return (
    <div
      className="fixed inset-x-0 z-[60] flex flex-col bg-slate-50 text-slate-900"
      style={box ? { top: box.top, height: box.height } : { top: 0, bottom: 0 }}
    >
      <header
        className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-1 pb-1"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 4px)' }}
      >
        <Link
          href="/admin/inbox"
          prefetch={false}
          aria-label="인박스로 돌아가기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </Link>
        <InboxAvatar person={operator} size={32} />
        <div className="min-w-0 flex-1 pl-1">
          <p className="flex min-w-0 items-center gap-1 text-[15px] font-semibold leading-5">
            <span className="min-w-0 truncate">{operatorName}</span>
            <span aria-hidden="true" className="shrink-0 text-slate-400">↔</span>
            <span className="sr-only">대화 상대</span>
            <span className="min-w-0 truncate">{counterpartTitle}</span>
          </p>
          <p className="truncate text-xs leading-4 text-sky-700">
            {KO_BADGE_COPY.operator} · 답장 언어 {personaLanguageName}
          </p>
        </div>
        <KoreanViewSwitch enabled={korean} onChange={toggleKorean} />
      </header>

      <div role="note" className="flex shrink-0 items-start gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600">
        <Info size={14} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
        <p className="min-w-0 break-words">
          {KO_BADGE_COPY.chatDisclosure}
          <span className="text-slate-400"> · 상대방 화면에도 표시되는 안내입니다.</span>
        </p>
      </div>

      {room.operators.length > 1 ? (
        <nav aria-label="답장할 운영 계정" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-1">
          <span className="shrink-0 text-xs text-slate-500">답장 계정</span>
          {room.operators.map((candidate) => (
            <Link
              key={candidate.userId}
              href={`/admin/inbox/${encodeURIComponent(conversationId)}?as=${encodeURIComponent(candidate.userId)}`}
              prefetch={false}
              aria-current={candidate.userId === operatorId ? 'true' : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm ${
                candidate.userId === operatorId ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              <InboxAvatar person={candidate} size={22} />
              {inboxPersonLabel(candidate)}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain py-2"
          aria-label="대화 내용"
        >
          {hasMoreOlder ? (
            <div className="flex justify-center px-3 py-2">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm text-slate-700 ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-60"
              >
                {loadingOlder ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                {olderFailed ? '다시 시도' : '이전 메시지 보기'}
              </button>
            </div>
          ) : null}
          {refreshFailed ? (
            <p role="status" className="mx-3 mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 break-words">
              새 메시지를 불러오지 못했습니다. 잠시 후 자동으로 다시 시도합니다.
            </p>
          ) : null}
          {timeline.length === 0 && pending.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">아직 메시지가 없습니다.</p>
          ) : null}
          <RoomMessageList
            timeline={timeline}
            korean={korean}
            koById={koById}
            displayLanguage={displayLanguage}
            languageOrder={languageOrder}
            viewerUserId={operatorId}
          />
          {pending.map((reply) => (
            <PendingReplyRow key={reply.requestId} reply={reply} onRetry={retryReply} onDiscard={discardReply} />
          ))}
        </div>
        {!atBottom ? (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="맨 아래로"
            className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 active:bg-slate-100"
          >
            <ArrowDown size={20} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {unavailable ? (
        <div
          className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 text-center text-sm text-slate-600 break-words"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
          role="status"
        >
          {unavailable}
        </div>
      ) : (
        <ReplyComposer
          hint={`${operatorName} 이름으로 전송 · ${personaLanguageName} 번역`}
          keyboardOpen={box?.keyboardOpen === true}
          onSend={onSend}
        />
      )}
    </div>
  )
}
