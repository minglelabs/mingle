'use client'

import { useState } from 'react'

/** 내리고 검토로 / 다시 올리기 for an operator account on its card (as for a post on the feed). */
export function AccountTakedownButton({ userId, live }: { userId: string; live: boolean }) {
  const [isLive, setLive] = useState(live)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (isLive && !window.confirm('이 계정을 검토 탭 맨 앞으로 돌려보낼까요? 검토에서 다시 게시할 때까지 앱에서 프로필·글·댓글이 숨겨지고 자동 포스팅·댓글·좋아요도 멈춰요.')) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/admin/operators/api/${encodeURIComponent(userId)}/review-state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: isLive ? 'takedown' : 'restore' }),
      })
      if (!response.ok) throw new Error()
      setLive(!isLive)
    } catch {
      setError(isLive ? '내리지 못했어요.' : '다시 올리지 못했어요.')
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
        className={`h-9 rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${isLive ? 'border-rose-200 bg-white text-rose-700 active:bg-rose-50' : 'border-sky-200 bg-white text-sky-700'}`}
      >
        {busy ? '처리 중…' : isLive ? '내리고 검토로' : '다시 올리기'}
      </button>
      {!isLive && !busy ? <span className="text-xs text-slate-500">검토 탭에 있어요</span> : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  )
}
