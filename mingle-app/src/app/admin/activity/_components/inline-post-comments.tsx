'use client'

import { useCallback, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, MessageCircle } from 'lucide-react'
import type { OperatorPostThread } from '@/server/operator-activity/thread'
import { PostThreadView } from './post-thread-view'

/**
 * A post's comments as the app shows them (threaded replies, likes, Korean
 * view) with the reply box, inside another page's post card. The thread loads
 * when it is opened; `operatorUserId` is the account the replies go out as
 * (null on a real person's post: the thread picks one).
 */
export function InlinePostComments({ postId, operatorUserId, commentCount }: { postId: string; operatorUserId: string | null; commentCount: number }) {
  const [open, setOpen] = useState(false)
  const [thread, setThread] = useState<OperatorPostThread | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (operatorUserId) params.set('as', operatorUserId)
      const response = await fetch(`/admin/activity/api/posts/${encodeURIComponent(postId)}?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) throw new Error(`thread_${response.status}`)
      setThread(await response.json() as OperatorPostThread)
    } catch {
      setError('댓글을 불러오지 못했어요. 다시 눌러 주세요.')
    } finally {
      setLoading(false)
    }
  }, [operatorUserId, postId])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !thread && !loading) void load()
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 active:bg-slate-50"
      >
        <span className="inline-flex items-center gap-1.5"><MessageCircle size={15} aria-hidden="true" />{commentCount > 0 ? `댓글 ${commentCount}개 보기` : '댓글 달기'}</span>
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open ? (
        <div className="mt-2 rounded-xl bg-slate-50 p-2">
          {thread ? (
            <PostThreadView key={`${thread.post.id}:${thread.operator.userId}`} initialThread={thread} focusCommentId={null} embedded />
          ) : loading ? (
            <p className="flex items-center justify-center gap-1 py-6 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" aria-hidden="true" />불러오는 중…</p>
          ) : error ? (
            <button type="button" onClick={() => void load()} className="w-full py-6 text-sm font-semibold text-rose-700">{error}</button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
