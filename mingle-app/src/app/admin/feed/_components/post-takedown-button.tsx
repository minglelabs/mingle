'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Takes an operator's published post down from the app, or puts it back up. */
export function PostTakedownButton({ postId, hidden }: { postId: string; hidden: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (!hidden && !window.confirm('이 글을 앱에서 내릴까요? 좋아요·댓글은 남아 있어 다시 올릴 수 있어요.')) return
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
        {busy ? '처리 중…' : hidden ? '다시 올리기' : '글 내리기'}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  )
}
