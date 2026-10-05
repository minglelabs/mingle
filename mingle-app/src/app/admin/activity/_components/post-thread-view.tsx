'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronLeft, Heart, Loader2, MessageCircle, SendHorizontal, X } from 'lucide-react'
import type { OperatorPostThread, ThreadComment } from '@/server/operator-activity/thread'
import { InboxAvatar, KoreanViewSwitch } from '../../inbox/_components/inbox-ui'
import { useAdminInboxRealtime } from '../../inbox/_components/use-admin-inbox-realtime'
import { useStaffKoreanView } from '../../inbox/_components/use-staff-korean-view'
import { formatInboxRelativeTime, inboxLanguageName, inboxPersonLabel } from '../../inbox/_lib/inbox-format'

const COMMENT_MAX_LENGTH = 500
const ADMIN_INBOX_UPDATED_EVENT = 'mingle:admin-inbox-updated'

const ERROR_COPY: Record<string, string> = {
  not_operator: '운영 계정이 아니어서 댓글을 달 수 없습니다.',
  operator_inactive: '비활성화된 운영 계정으로는 댓글을 달 수 없습니다.',
  account_restricted: '이용이 제한된 계정이라 댓글을 달 수 없습니다.',
  text_required: '내용을 입력해 주세요.',
  text_too_long: `댓글은 ${COMMENT_MAX_LENGTH}자까지 쓸 수 있습니다. 변환된 문장이 더 길어졌다면 줄여서 다시 보내 주세요.`,
  not_found: '글이 삭제되었거나 이 계정에서 볼 수 없습니다.',
  parent_not_found: '답글을 달려던 댓글이 삭제되었습니다.',
  persona_language_missing: '이 운영 계정에 주 언어가 설정되어 있지 않습니다. 계정 탭에서 먼저 설정해 주세요.',
  conversion_failed: '계정 언어로 변환하지 못했습니다. 잠시 후 다시 시도해 주세요.',
}

type ReplyTarget = { parentId: string; replyToUserId: string; label: string }

function goToLogin(): void {
  window.location.assign(`/admin?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)
}

function threadPath(postId: string): string {
  return `/admin/activity/posts/${encodeURIComponent(postId)}`
}

function CommentRow({ comment, korean, nowMs, focused, isReply, canReply, onReply }: {
  comment: ThreadComment
  korean: boolean
  nowMs: number
  focused: boolean
  isReply: boolean
  canReply: boolean
  onReply: (comment: ThreadComment) => void
}) {
  const text = (korean && comment.koText) || comment.text
  return (
    <div
      id={`comment-${comment.id}`}
      className={`flex gap-2.5 rounded-xl px-2 py-2 ${focused ? 'bg-sky-50 ring-1 ring-sky-200' : ''} ${isReply ? 'ml-9' : ''}`}
    >
      <InboxAvatar person={comment.isDeleted ? null : comment.author} size={isReply ? 28 : 36} />
      <div className="min-w-0 flex-1">
        {comment.isDeleted ? (
          <p className="py-1.5 text-sm text-slate-400">삭제된 댓글입니다.</p>
        ) : (
          <>
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{inboxPersonLabel(comment.author)}</span>
              <span className="text-xs text-slate-500">{formatInboxRelativeTime(comment.createdAt, nowMs)}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-800">
              {comment.replyTo ? <span className="mr-1 text-sky-700">@{comment.replyTo.label.replace(/^@/, '')}</span> : null}
              {text || (comment.hasImage ? '' : '(내용 없음)')}
              {comment.hasImage ? <span className="text-slate-500">{text ? ' ' : ''}📷 사진</span> : null}
            </p>
            <p className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
              {comment.likeCount > 0 ? (
                <span className="inline-flex items-center gap-1"><Heart size={12} aria-hidden="true" />{comment.likeCount}</span>
              ) : null}
              {canReply ? (
                <button
                  type="button"
                  onClick={() => onReply(comment)}
                  className="-ml-2 inline-flex min-h-9 items-center rounded-full px-2 font-semibold text-sky-700 active:bg-sky-50"
                >
                  답글 달기
                </button>
              ) : null}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * One post's comment thread, read as an operator account, with a composer
 * that comments or replies as that operator. The draft is converted to the
 * operator's language on the server, like posts and inbox replies.
 */
export function PostThreadView({ initialThread, focusCommentId }: {
  initialThread: OperatorPostThread
  focusCommentId: string | null
}) {
  const [thread, setThread] = useState(initialThread)
  const [korean, setKorean] = useStaffKoreanView()
  const [nowMs, setNowMs] = useState(() => Date.parse(initialThread.post.publishedAt))
  const [draft, setDraft] = useState('')
  const [target, setTarget] = useState<ReplyTarget | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const postId = thread.post.id
  const operatorId = thread.operator.userId

  useEffect(() => {
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const reload = useCallback(async () => {
    const params = new URLSearchParams({ as: operatorId })
    if (korean) params.set('ko', '1')
    const response = await fetch(`/admin/activity/api/posts/${encodeURIComponent(postId)}?${params.toString()}`, {
      cache: 'no-store', credentials: 'same-origin',
    })
    if (response.status === 401) {
      goToLogin()
      return
    }
    if (!response.ok) throw new Error(`thread_${response.status}`)
    setThread(await response.json() as OperatorPostThread)
  }, [korean, operatorId, postId])

  useAdminInboxRealtime(reload)

  // Korean text is fetched only while the switch is on (the server rendered without it).
  const koreanLoadedRef = useRef(false)
  useEffect(() => {
    if (!korean && !koreanLoadedRef.current) return
    koreanLoadedRef.current = true
    void reload().catch(() => {})
  }, [korean, reload])

  // Opening the thread reads this operator's notifications about the post.
  useEffect(() => {
    void fetch('/admin/activity/api/read', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operatorUserId: operatorId, postId }),
    }).then((response) => {
      if (response.ok) window.dispatchEvent(new CustomEvent(ADMIN_INBOX_UPDATED_EVENT))
    }, () => {})
  }, [operatorId, postId])

  useEffect(() => {
    if (!focusCommentId) return
    document.getElementById(`comment-${focusCommentId}`)?.scrollIntoView({ block: 'center' })
  }, [focusCommentId])

  const startReply = useCallback((comment: ThreadComment) => {
    setTarget({ parentId: comment.id, replyToUserId: comment.author.userId, label: inboxPersonLabel(comment.author) })
    textareaRef.current?.focus()
  }, [])

  const submit = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending || text.length > COMMENT_MAX_LENGTH) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/admin/activity/api/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operatorUserId: operatorId,
          text,
          parentId: target?.parentId ?? null,
          replyToUserId: target?.replyToUserId ?? null,
        }),
      })
      if (response.status === 401) {
        goToLogin()
        return
      }
      const payload = await response.json().catch(() => null) as { error?: string; text?: string; converted?: boolean; commentId?: string } | null
      if (!response.ok) {
        setError(ERROR_COPY[payload?.error ?? ''] ?? '댓글을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      setDraft('')
      setTarget(null)
      setNotice(payload?.converted && payload.text ? `변환되어 게시됨: ${payload.text}` : '게시되었습니다.')
      await reload().catch(() => {})
      window.dispatchEvent(new CustomEvent(ADMIN_INBOX_UPDATED_EVENT))
      if (payload?.commentId) document.getElementById(`comment-${payload.commentId}`)?.scrollIntoView({ block: 'center' })
    } catch {
      setError('댓글을 보내지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.')
    } finally {
      setSending(false)
    }
  }, [draft, operatorId, postId, reload, sending, target])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter sends (desktop); a plain Enter stays a line break.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  const { post, operator } = thread
  const postText = (korean && post.koText) || post.text
  const tooLong = draft.trim().length > COMMENT_MAX_LENGTH
  const canReply = thread.replyUnavailableReason === null
  const languageName = inboxLanguageName(operator.personaLanguage)

  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-slate-200 bg-white px-1 py-1 lg:px-4">
        <Link
          href="/admin/activity"
          prefetch={false}
          aria-label="알림으로 돌아가기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 active:bg-slate-100 lg:hidden"
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate text-[15px] font-semibold leading-5">{inboxPersonLabel(post.author)}의 글</p>
          <p className="truncate text-xs leading-4 text-sky-700">운영 계정 · {inboxPersonLabel(operator)}(으)로 보는 중</p>
        </div>
        <KoreanViewSwitch enabled={korean} onChange={setKorean} />
      </header>

      {thread.operators.length > 1 ? (
        <nav aria-label="댓글을 달 운영 계정" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-1">
          <span className="shrink-0 text-xs text-slate-500">댓글 계정</span>
          {thread.operators.map((candidate) => (
            <Link
              key={candidate.userId}
              href={`${threadPath(postId)}?as=${encodeURIComponent(candidate.userId)}`}
              prefetch={false}
              aria-current={candidate.userId === operatorId ? 'true' : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm ${
                candidate.userId === operatorId ? 'bg-slate-900 font-medium text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              <InboxAvatar person={candidate} size={24} />
              <span className="max-w-[9rem] truncate">{inboxPersonLabel(candidate)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="mx-auto w-full max-w-2xl flex-1 px-3 py-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="flex min-w-0 items-center gap-2">
            <InboxAvatar person={post.author} size={36} />
            <span className="min-w-0 truncate text-sm font-semibold">{inboxPersonLabel(post.author)}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-500">{formatInboxRelativeTime(post.publishedAt, nowMs)}</span>
          </p>
          {postText ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-800">{postText}</p>
          ) : null}
          {post.hasImage ? <p className="mt-1 text-sm text-slate-500">📷 사진이 있는 글</p> : null}
          <p className="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Heart size={13} aria-hidden="true" />{post.likeCount}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle size={13} aria-hidden="true" />{post.commentCount}</span>
          </p>
        </article>

        {thread.comments.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">아직 댓글이 없습니다.</p>
        ) : (
          <ul className="mt-2 flex flex-col" aria-label="댓글">
            {thread.comments.map((comment) => (
              <li key={comment.id}>
                <CommentRow
                  comment={comment}
                  korean={korean}
                  nowMs={nowMs}
                  focused={comment.id === focusCommentId}
                  isReply={false}
                  canReply={canReply}
                  onReply={startReply}
                />
                {comment.replies.map((reply) => (
                  <CommentRow
                    key={reply.id}
                    comment={reply}
                    korean={korean}
                    nowMs={nowMs}
                    focused={reply.id === focusCommentId}
                    isReply
                    canReply={canReply}
                    onReply={startReply}
                  />
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canReply ? (
        <form
          onSubmit={onSubmit}
          className="sticky bottom-0 shrink-0 border-t border-slate-200 bg-white px-3 pb-2 pt-2"
        >
          <div className="mx-auto w-full max-w-2xl">
            {target ? (
              <p className="mb-1.5 flex items-center gap-1 text-xs text-sky-800">
                <span className="min-w-0 truncate">{target.label}에게 답글</span>
                <button
                  type="button"
                  onClick={() => setTarget(null)}
                  aria-label="답글 대상 취소"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </p>
            ) : null}
            <p className="mb-1.5 break-words text-xs text-slate-500">
              {inboxPersonLabel(operator)} 계정으로 게시됩니다. 어떤 언어로 써도 {languageName}(으)로 변환됩니다.
            </p>
            <div className="flex items-end gap-2">
              <label htmlFor="admin-activity-comment" className="sr-only">댓글 입력</label>
              <textarea
                id="admin-activity-comment"
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={target ? '답글 입력…' : '댓글 입력…'}
                className="max-h-36 min-h-11 flex-1 resize-y rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-base leading-6 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim() || tooLong}
                aria-label="댓글 보내기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white active:bg-sky-600 disabled:bg-slate-300"
              >
                {sending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <SendHorizontal size={18} aria-hidden="true" />}
              </button>
            </div>
            {tooLong ? (
              <p className="mt-1 text-right text-xs text-rose-700">{draft.trim().length} / {COMMENT_MAX_LENGTH}</p>
            ) : null}
            {error ? <p role="alert" className="mt-1.5 break-words text-xs text-rose-700">{error}</p> : null}
            {notice ? <p role="status" className="mt-1.5 line-clamp-2 break-words text-xs text-emerald-700">{notice}</p> : null}
          </div>
        </form>
      ) : (
        <p className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-600">
          비활성화된 운영 계정이라 댓글을 달 수 없습니다.
        </p>
      )}
    </div>
  )
}
