'use client'

import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban, Flag, Loader2, X } from 'lucide-react'
import { reportCopy } from '@/i18n/report-copy'
import { REPORT_REASONS, type ReportReason } from '@/server/reports/report-service'
import type { InboxPerson } from '@/server/operator-inbox/inbox'
import { inboxPersonLabel } from '../_lib/inbox-format'
import { InboxAvatar } from './inbox-ui'

const REASON_LABELS = reportCopy('ko').reasons

type Moderate = (body: Record<string, unknown>) => Promise<{ ok: boolean; status?: string }>

/**
 * 차단·신고 for the room's other person, done AS the operator account the way
 * a user does it from the app. Rendered on document.body so no ancestor clips it.
 */
export function InboxModerationSheet({ counterparts, blockedIds, operatorName, onModerate, onClose }: {
  counterparts: InboxPerson[]
  blockedIds: readonly string[]
  operatorName: string
  onModerate: Moderate
  onClose: () => void
}) {
  const [reporting, setReporting] = useState<InboxPerson | null>(null)
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="차단·신고"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-4 sm:rounded-3xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{reporting ? '신고하기' : '차단·신고'}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="rounded-full p-2 text-slate-500 active:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">{operatorName} 계정으로 처리됩니다. 앱에서 유저가 하는 것과 같습니다.</p>
        {reporting ? (
          <ReportForm person={reporting} onModerate={onModerate} onBack={() => setReporting(null)} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {counterparts.map((person) => (
              <CounterpartRow
                key={person.userId}
                person={person}
                blocked={blockedIds.includes(person.userId)}
                onModerate={onModerate}
                onReport={() => setReporting(person)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>,
    document.body,
  )
}

function CounterpartRow({ person, blocked, onModerate, onReport }: {
  person: InboxPerson
  blocked: boolean
  onModerate: Moderate
  onReport: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggleBlock = useCallback(async () => {
    if (!blocked && !confirm) { setConfirm(true); return }
    setPending(true)
    setError(null)
    const result = await onModerate({ userId: person.userId, action: blocked ? 'unblock' : 'block' })
    setPending(false)
    setConfirm(false)
    if (!result.ok) setError(blocked ? '차단을 해제하지 못했어요.' : '차단하지 못했어요.')
  }, [blocked, confirm, onModerate, person.userId])
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <InboxAvatar person={person} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">{inboxPersonLabel(person)}</p>
          <p className="truncate text-xs text-slate-500">@{person.handle}{blocked ? ' · 차단함' : ''}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-semibold">
        <button
          type="button"
          onClick={() => void toggleBlock()}
          disabled={pending}
          className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border ${
            confirm ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-slate-200 text-slate-700 active:bg-slate-50'
          } disabled:opacity-60`}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Ban className="h-4 w-4" aria-hidden="true" />}
          {blocked ? '차단 해제' : confirm ? '한 번 더 눌러 차단' : '차단하기'}
        </button>
        <button
          type="button"
          onClick={onReport}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-slate-700 active:bg-slate-50"
        >
          <Flag className="h-4 w-4" aria-hidden="true" />
          신고하기
        </button>
      </div>
      {confirm && !blocked ? <p className="mt-1.5 text-xs text-slate-500">차단하면 서로 메시지를 보낼 수 없고 서로의 팔로우가 끊깁니다.</p> : null}
      {error ? <p role="status" className="mt-1.5 text-xs text-rose-600">{error}</p> : null}
    </li>
  )
}

function ReportForm({ person, onModerate, onBack }: { person: InboxPerson; onModerate: Moderate; onBack: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const submit = useCallback(async () => {
    if (!reason) return
    setPending(true)
    setStatus(null)
    const result = await onModerate({ userId: person.userId, action: 'report', reason, message: message.trim() || null })
    setPending(false)
    if (!result.ok) { setStatus('신고하지 못했어요. 다시 시도해 주세요.'); return }
    setDone(true)
    setStatus(result.status === 'already_reported' ? '이미 신고한 계정이에요.' : '신고했어요.')
  }, [message, onModerate, person.userId, reason])
  return (
    <div>
      <p className="mb-2 text-sm text-slate-700"><b>{inboxPersonLabel(person)}</b> <span className="text-slate-400">@{person.handle}</span> 신고 사유</p>
      <div className="flex flex-col gap-1.5">
        {REPORT_REASONS.map((candidate) => (
          <label key={candidate} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${reason === candidate ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
            <input type="radio" name="report-reason" checked={reason === candidate} onChange={() => setReason(candidate)} disabled={done} />
            {REASON_LABELS[candidate]}
          </label>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value.slice(0, 500))}
        disabled={done}
        rows={3}
        placeholder="자세한 내용 (선택)"
        className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-slate-400"
      />
      {status ? <p role="status" className="mt-1 text-center text-xs text-slate-600">{status}</p> : null}
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-semibold">
        <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-slate-200 text-slate-700 active:bg-slate-50">
          {done ? '돌아가기' : '취소'}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!reason || pending || done}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-white active:bg-rose-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          신고하기
        </button>
      </div>
    </div>
  )
}
