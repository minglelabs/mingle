'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { refreshInPlace } from '../../../_components/refresh-in-place'

/**
 * 게시 for an account waiting for review, right on its profile page (staff
 * 2026-11-24): the same answer as the review card's 게시. Its posts in review
 * can then be published or scheduled.
 */
export function ApproveAccountButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/admin/operators/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'profile', id: userId, action: 'publish' }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error ?? 'request_failed')
      }
      refreshInPlace(router)
    } catch (caught) {
      setError((caught as Error).message === 'already_approved' ? '이미 게시된 계정이에요.' : '게시하지 못했어요. 다시 눌러 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="ml-2 inline-flex flex-col align-middle">
      <button
        type="button"
        onClick={() => void approve()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
        계정 게시
      </button>
      {error ? <span className="mt-1 text-xs text-rose-700">{error}</span> : null}
    </span>
  )
}
