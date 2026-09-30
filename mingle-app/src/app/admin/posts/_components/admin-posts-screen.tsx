'use client'

import { useState } from 'react'
import type { OperatorPostBatchSummary, OperatorPostPickerEntry } from '@/server/operator-posts/types'
import OperatorPostComposer from './operator-post-composer'
import RecentBatchesList from './recent-batches-list'

type Tab = 'compose' | 'batches'

/**
 * `/admin/posts`: compose a batch of operator posts, or check recent
 * batches. Both tabs stay mounted, so switching never loses a half-written
 * batch (photos included).
 */
export default function AdminPostsScreen({
  operators,
  batches,
  textMax,
}: {
  operators: OperatorPostPickerEntry[]
  batches: OperatorPostBatchSummary[]
  textMax: number
}) {
  const [tab, setTab] = useState<Tab>('compose')
  const waiting = batches.reduce((sum, batch) => sum + (batch.counts.queued ?? 0) + (batch.counts.publishing ?? 0), 0)

  const tabClass = (value: Tab) =>
    `min-h-11 flex-1 rounded-lg px-2 text-[14px] font-semibold ${
      tab === value ? 'bg-white text-sky-800 shadow-sm' : 'text-slate-600'
    }`

  return (
    <main
      className="h-svh w-full overflow-y-auto overscroll-contain bg-slate-50 text-slate-900"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div
        className="mx-auto w-full max-w-xl px-4 pt-4"
        style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
      >
        <header className="mb-3">
          <h1 className="text-xl font-bold">게시물</h1>
        </header>

        <div role="tablist" aria-label="게시물 메뉴" className="mb-4 flex gap-1 rounded-xl bg-slate-200/70 p-1">
          <button
            type="button"
            role="tab"
            id="admin-posts-tab-compose"
            aria-selected={tab === 'compose'}
            aria-controls="admin-posts-panel-compose"
            onClick={() => setTab('compose')}
            className={tabClass('compose')}
          >
            새 게시물
          </button>
          <button
            type="button"
            role="tab"
            id="admin-posts-tab-batches"
            aria-selected={tab === 'batches'}
            aria-controls="admin-posts-panel-batches"
            onClick={() => setTab('batches')}
            className={tabClass('batches')}
          >
            최근 배치{waiting > 0 ? ` · 대기 ${waiting}` : ''}
          </button>
        </div>

        <div
          role="tabpanel"
          id="admin-posts-panel-compose"
          aria-labelledby="admin-posts-tab-compose"
          hidden={tab !== 'compose'}
        >
          <OperatorPostComposer operators={operators} textMax={textMax} />
        </div>
        <div
          role="tabpanel"
          id="admin-posts-panel-batches"
          aria-labelledby="admin-posts-tab-batches"
          hidden={tab !== 'batches'}
          className="pb-8"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}
        >
          <RecentBatchesList batches={batches} />
        </div>
      </div>
    </main>
  )
}
