'use client'

import { ChevronRight, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { OperatorPostBatchSummary, OperatorPostJobState } from '@/server/operator-posts/types'
import { JOB_STATE_LABEL, JOB_STATE_TONE, operatorDisplayName } from '../_lib/copy'
import { formatKstDateTime, formatKstRange } from '../_lib/kst'
import OperatorAvatar from './operator-avatar'

/** Chip order: what needs attention first. Duplicates count as published. */
const CHIP_STATES: OperatorPostJobState[] = ['failed', 'conflict', 'publishing', 'queued', 'published', 'cancelled']

function stateCount(batch: OperatorPostBatchSummary, state: OperatorPostJobState): number {
  const own = batch.counts[state] ?? 0
  return state === 'published' ? own + (batch.counts.duplicate ?? 0) : own
}

export default function RecentBatchesList({ batches }: { batches: OperatorPostBatchSummary[] }) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-slate-500">최근 20개 배치</p>
        <button
          type="button"
          onClick={() => startRefresh(() => router.refresh())}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-slate-600 active:bg-slate-100"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden /> 새로고침
        </button>
      </div>

      {batches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-[14px] text-slate-500">
          아직 예약한 게시물이 없어요.
        </div>
      ) : (
        <ul className="space-y-3">
          {batches.map((batch) => {
            const names = batch.operators.slice(0, 2).map(operatorDisplayName).join(', ')
            const others = batch.operatorCount - Math.min(batch.operators.length, 2)
            return (
              <li key={batch.batchId}>
                <Link
                  href={`/admin/posts/batches/${encodeURIComponent(batch.batchId)}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="break-words text-[15px] font-semibold">
                      {formatKstDateTime(batch.createdAt)} 만듦 · {batch.total}개
                    </p>
                    <p className="break-words text-[13px] text-slate-600">
                      게시 {formatKstRange(batch.firstPublishAt, batch.lastPublishAt)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {CHIP_STATES.map((state) => {
                        const count = stateCount(batch, state)
                        if (count === 0) return null
                        return (
                          <span key={state} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${JOB_STATE_TONE[state]}`}>
                            {JOB_STATE_LABEL[state]} {count}
                          </span>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex -space-x-2">
                        {batch.operators.slice(0, 3).map((operator) => (
                          <span key={operator.id} className="rounded-full ring-2 ring-white">
                            <OperatorAvatar operator={operator} size="sm" />
                          </span>
                        ))}
                      </span>
                      <span className="min-w-0 break-words text-[13px] text-slate-600">
                        {names}
                        {others > 0 ? ` 외 ${others}명` : ''}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
