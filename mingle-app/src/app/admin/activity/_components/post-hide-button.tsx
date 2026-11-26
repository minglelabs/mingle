'use client'

import { useState } from 'react'

/**
 * 글 내리기 on a post opened from the notifications tab (staff, 2026-11-26):
 * takes it out of the app right there, as the feed tab does. A real user's
 * post is hidden and its author is told it was removed for breaking the
 * community rules; an operator's goes back to the front of the review tab.
 * 되돌리기 puts it back up (the notification stays).
 */
export function PostHideButton({ postId }: { postId: string }) {
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (!hidden && !window.confirm('이 글을 앱에서 내릴까요?\n일반 유저 글이면 작성자에게 "신고되어 이용규칙 위반으로 삭제되었다"는 알림이 가요.\n운영 계정 글이면 알림 없이 검토 탭 맨 앞으로 돌아가요.')) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/admin/api/posts/${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(hidden ? { hidden: false } : { hidden: true, notifyAuthor: true }),
      })
      if (!response.ok) throw new Error()
      setHidden(!hidden)
    } catch {
      setError(hidden ? '되돌리지 못했어요.' : '내리지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {hidden ? <span className="text-xs font-medium text-rose-700">앱에서 내렸어요</span> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className={`h-9 rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${hidden ? 'border-sky-200 bg-white text-sky-700' : 'border-rose-200 bg-white text-rose-700 active:bg-rose-50'}`}
      >
        {busy ? '처리 중…' : hidden ? '되돌리기' : '글 내리기'}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  )
}
