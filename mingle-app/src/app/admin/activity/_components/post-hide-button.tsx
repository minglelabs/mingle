'use client'

import { useState } from 'react'
import { reportCopy } from '@/i18n/report-copy'
import { REPORT_REASONS, type ReportReason } from '@/server/reports/report-service'

const REASON_LABELS = reportCopy('ko').reasons

/**
 * 글 내리기 on a post opened from the notifications tab (staff, 2026-11-26):
 * staff pick the reason (the app's report reasons), then the post leaves the
 * app. A real user's post is hidden and its author is told it was removed for
 * breaking the community rules, with that reason; an operator's goes back to
 * the front of the review tab. 되돌리기 puts it back up (the notification stays).
 */
export function PostHideButton({ postId, initiallyHidden = false }: { postId: string; initiallyHidden?: boolean }) {
  const [hidden, setHidden] = useState(initiallyHidden)
  const [picking, setPicking] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(nextHidden: boolean) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/admin/api/posts/${encodeURIComponent(postId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(nextHidden ? { hidden: true, notifyAuthor: true, reason } : { hidden: false }),
      })
      if (!response.ok) throw new Error()
      setHidden(nextHidden)
      setPicking(false)
      setReason(null)
    } catch {
      setError(nextHidden ? '내리지 못했어요.' : '되돌리지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  if (hidden) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-rose-700">앱에서 내려간 글이에요</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send(false)}
          className="h-9 rounded-lg border border-sky-200 bg-white px-3 text-sm font-medium text-sky-700 disabled:opacity-50"
        >
          {busy ? '처리 중…' : '되돌리기'}
        </button>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </span>
    )
  }

  if (!picking) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-sm font-medium text-rose-700 active:bg-rose-50"
      >
        글 내리기
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
      <p className="text-sm font-semibold text-slate-900">내리는 사유</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-500">
        일반 유저 글이면 작성자에게 &quot;신고되어 이용규칙 위반으로 삭제되었다&quot;는 알림이 사유와 함께 가요. 운영 계정 글이면 알림 없이 검토 탭 맨 앞으로 돌아가요.
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        {REPORT_REASONS.map((candidate) => (
          <label key={candidate} className={`flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm ${reason === candidate ? 'border-slate-900' : 'border-slate-200'}`}>
            <input type="radio" name={`takedown-reason-${postId}`} checked={reason === candidate} onChange={() => setReason(candidate)} />
            {REASON_LABELS[candidate]}
          </label>
        ))}
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-semibold">
        <button type="button" disabled={busy} onClick={() => { setPicking(false); setReason(null) }} className="min-h-11 rounded-xl border border-slate-200 bg-white text-slate-700 active:bg-slate-50">
          취소
        </button>
        <button
          type="button"
          disabled={!reason || busy}
          onClick={() => void send(true)}
          className="min-h-11 rounded-xl bg-rose-600 text-white active:bg-rose-700 disabled:opacity-40"
        >
          {busy ? '처리 중…' : '내리기'}
        </button>
      </div>
    </div>
  )
}
