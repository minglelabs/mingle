'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Copy, ChevronDown, ChevronUp, Clock, ImageIcon, Loader2, RotateCcw, X, XCircle } from 'lucide-react'

export type QueueStatus = 'waiting' | 'uploading' | 'done' | 'failed' | 'skipped'
export type QueueItem = {
  id: string
  name: string
  previewUrl: string | null
  status: QueueStatus
  error: string | null
}

const STATUS_TEXT: Record<QueueStatus, string> = { waiting: '대기', uploading: '분석·올리는 중', done: '완료', failed: '실패', skipped: '이미 있는 짤이라 건너뜀' }

/**
 * Upload progress, the way file-upload panels do it: bottom right on a
 * computer, full width above the tab bar on a phone. Uploads keep going while
 * staff add more; finished rows can be cleared.
 */
export function UploadQueueOverlay({ items, onRetry, onClear }: {
  items: QueueItem[]
  onRetry: (id: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(true)
  // The queue is empty on the server render, so the portal only ever renders in the browser.
  if (items.length === 0 || typeof document === 'undefined') return null

  const pending = items.filter((item) => item.status === 'waiting' || item.status === 'uploading').length
  const done = items.filter((item) => item.status === 'done').length
  const failed = items.filter((item) => item.status === 'failed').length
  const skipped = items.filter((item) => item.status === 'skipped').length
  const title = pending ? `사진 올리는 중 · ${done}/${items.length}` : `${done}장 올림${skipped ? ` · ${skipped}장 중복` : ''}${failed ? ` · ${failed}장 실패` : ''}`

  return createPortal(
    <section
      aria-label="사진 업로드 진행"
      className="fixed inset-x-3 z-[120] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-96"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 68px)' }}
    >
      <header className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-white">
        {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : failed ? <XCircle className="h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? '접기' : '펼치기'} className="rounded-full p-1.5 active:bg-white/10">
          {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
        </button>
        {pending ? null : (
          <button type="button" onClick={onClear} aria-label="닫기" className="rounded-full p-1.5 active:bg-white/10">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </header>
      {open ? (
        <ul className="max-h-[40dvh] divide-y divide-slate-100 overflow-y-auto lg:max-h-80">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 px-3 py-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} />
                ) : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-800">{item.name}</span>
                <span className={`block truncate text-xs ${item.status === 'failed' ? 'text-rose-600' : 'text-slate-500'}`}>
                  {item.status === 'failed' && item.error ? `실패 · ${item.error}` : STATUS_TEXT[item.status]}
                </span>
              </span>
              {item.status === 'waiting' ? <Clock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /> : null}
              {item.status === 'uploading' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" aria-hidden="true" /> : null}
              {item.status === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : null}
              {item.status === 'skipped' ? <Copy className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" /> : null}
              {item.status === 'failed' ? (
                <button type="button" onClick={() => onRetry(item.id)} aria-label={`${item.name} 다시 올리기`} className="rounded-full p-1.5 text-slate-600 active:bg-slate-100">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>,
    document.body,
  )
}
