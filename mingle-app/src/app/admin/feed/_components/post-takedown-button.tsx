'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Takes an operator's published post down from the app back into review, or
 * puts it back up; 삭제 deletes it for good (no review copy).
 */
export function PostTakedownButton({ postId, hidden }: { postId: string; hidden: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    if (!window.confirm('이 글을 아예 삭제할까요? 앱에서 사라지고 검토로도 돌아가지 않아요. 되돌릴 수 없어요.')) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/admin/api/posts/${postId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error()
      router.refresh()
    } catch {
      setError('삭제하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle() {
    if (!hidden && !window.confirm('이 글을 앱에서 내리고 검토 탭 맨 앞으로 돌려보낼까요? 검토에서 고쳐 다시 게시하면 새 글로 올라가요.')) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/admin/api/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hidden: !hidden }),
      })
      if (!response.ok) throw new Error()
      router.refresh()
    } catch {
      setError(hidden ? '다시 올리지 못했어요.' : '내리지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className={`h-9 rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${hidden ? 'border-sky-200 bg-white text-sky-700' : 'border-rose-200 bg-white text-rose-700 active:bg-rose-50'}`}
      >
        {busy ? '처리 중…' : hidden ? '다시 올리기' : '내리고 검토로'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className="h-9 rounded-lg border border-rose-300 bg-rose-50 px-3 text-sm font-semibold text-rose-700 active:bg-rose-100 disabled:opacity-50"
      >
        삭제
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  )
}
