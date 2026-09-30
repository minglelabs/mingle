'use client'

import { ChevronLeft, Clock, ExternalLink, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { postViewerHref } from '@/lib/feed-routes'
import {
  OPERATOR_POST_MAX_ATTEMPTS,
  type OperatorPostBatchDetail,
  type OperatorPostJobDto,
  type OperatorPostJobState,
} from '@/server/operator-posts/types'
import { cancelJobs, fetchBatch, operatorImageUrl } from '../_lib/api'
import { apiErrorMessage, JOB_STATE_LABEL, JOB_STATE_TONE, jobErrorLabel, operatorDisplayName } from '../_lib/copy'
import { formatKstDateTime } from '../_lib/kst'
import OperatorAvatar from './operator-avatar'

const POLL_MS = 8_000
const LONG_TEXT = 180
const SUMMARY_STATES: OperatorPostJobState[] = ['failed', 'conflict', 'publishing', 'queued', 'published', 'cancelled']

function isWaiting(state: OperatorPostJobState): boolean {
  return state === 'queued' || state === 'publishing'
}

function timeLine(item: OperatorPostJobDto): string {
  switch (item.state) {
    case 'queued':
      return item.attempts > 0
        ? `다시 시도 ${formatKstDateTime(item.publishAt)} · ${item.attempts}/${OPERATOR_POST_MAX_ATTEMPTS}회 시도함`
        : `예정 ${formatKstDateTime(item.publishAt)}`
    case 'publishing':
      return '지금 게시하는 중'
    case 'published':
    case 'duplicate':
      return `게시됨 ${formatKstDateTime(item.updatedAt)}`
    case 'failed':
      return `실패 · ${item.attempts}회 시도함`
    case 'conflict':
      return '게시하지 못했어요'
    case 'cancelled':
      return `취소됨 · 원래 ${formatKstDateTime(item.publishAt)} 예정`
  }
}

function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > LONG_TEXT
  return (
    <div>
      <p
        dir="auto"
        className={`whitespace-pre-wrap break-words text-[14px] leading-relaxed [overflow-wrap:anywhere] ${
          long && !open ? 'line-clamp-5' : ''
        }`}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="-ml-2 inline-flex min-h-11 items-center rounded-xl px-2 text-[13px] font-semibold text-sky-700"
        >
          {open ? '접기' : '전체 보기'}
        </button>
      ) : null}
    </div>
  )
}

export default function BatchStatusView({ initial }: { initial: OperatorPostBatchDetail }) {
  const [batch, setBatch] = useState(initial)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const active = batch.items.some((item) => isWaiting(item.state))
  const queuedCount = batch.items.filter((item) => item.state === 'queued').length

  // Poll while anything can still change; pause while the page is hidden.
  useEffect(() => {
    if (!active) return
    let stopped = false
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return
      const result = await fetchBatch(batch.batchId)
      if (stopped) return
      if (result.ok) {
        setBatch(result.data)
        setLoadError(null)
      } else {
        setLoadError(apiErrorMessage(result.error))
      }
    }
    const timer = setInterval(() => void refresh(), POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, batch.batchId])

  const cancel = async (target: { jobIds: string[] } | { all: true }, busyKey: string, question: string) => {
    if (!window.confirm(question)) return
    setBusy(busyKey)
    setMessage(null)
    const result = await cancelJobs(batch.batchId, target)
    setBusy(null)
    if (!result.ok) {
      setMessage(apiErrorMessage(result.error))
      return
    }
    if (result.data.batch) setBatch(result.data.batch)
    setMessage(
      result.data.cancelled > 0
        ? `${result.data.cancelled}개를 취소했어요.`
        : '이미 게시 중이거나 끝난 게시물이라 취소하지 못했어요.',
    )
  }

  const counts = new Map<OperatorPostJobState, number>()
  for (const item of batch.items) {
    const state = item.state === 'duplicate' ? 'published' : item.state
    counts.set(state, (counts.get(state) ?? 0) + 1)
  }

  return (
    <main
      className="min-h-full w-full bg-slate-50 text-slate-900"
    >
      <div
        className="mx-auto w-full max-w-xl space-y-4 px-4 pt-2"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
        }}
      >
        <Link
          href="/admin/posts"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-[14px] font-semibold text-slate-600 active:bg-slate-100"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden /> 게시물
        </Link>

        <header className="space-y-2">
          <h1 className="text-xl font-bold">배치 상태</h1>
          <p className="break-words text-[13px] text-slate-600">
            {formatKstDateTime(batch.createdAt)} 만듦 · {batch.items.length}개
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUMMARY_STATES.map((state) => {
              const count = counts.get(state) ?? 0
              if (count === 0) return null
              return (
                <span key={state} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${JOB_STATE_TONE[state]}`}>
                  {JOB_STATE_LABEL[state]} {count}
                </span>
              )
            })}
          </div>
          {active ? (
            <p className="text-xs text-slate-500">대기 중인 게시물이 있어서 자동으로 새로고침돼요.</p>
          ) : null}
          {loadError ? <p className="text-[13px] text-rose-700">{loadError}</p> : null}
        </header>

        {queuedCount > 0 ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void cancel({ all: true }, 'all', `대기 중인 ${queuedCount}개를 모두 취소할까요?`)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-[14px] font-semibold text-rose-700 active:bg-rose-50 disabled:opacity-60"
          >
            {busy === 'all' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
            대기 중인 {queuedCount}개 모두 취소
          </button>
        ) : null}

        {message ? (
          <p role="status" className="break-words rounded-xl bg-slate-100 px-3 py-2 text-[13px] text-slate-700">
            {message}
          </p>
        ) : null}

        <ul className="space-y-3">
          {batch.items.map((item) => {
            const error = jobErrorLabel(item.error)
            const retrying = item.state === 'queued' && item.attempts > 0
            const showError = !!error && (item.state === 'failed' || item.state === 'conflict' || retrying)
            const postHref =
              item.postId && item.operator && (item.state === 'published' || item.state === 'duplicate')
                ? postViewerHref('ko', { kind: 'author', authorId: item.operator.id }, item.postId)
                : null
            return (
              <li key={item.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <OperatorAvatar operator={item.operator} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-semibold">
                      {item.operator ? operatorDisplayName(item.operator) : '알 수 없는 계정'}
                    </p>
                    <p className="break-all text-[13px] text-slate-500">
                      {item.operator ? `@${item.operator.handle} · ` : ''}게시물 {item.index}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${JOB_STATE_TONE[item.state]}`}>
                    {JOB_STATE_LABEL[item.state]}
                  </span>
                </div>

                <p className="inline-flex items-center gap-1.5 break-words text-[13px] text-slate-600">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden /> {timeLine(item)}
                </p>

                {item.imageObjectKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={operatorImageUrl(item.imageObjectKey)}
                    alt="게시물 사진"
                    loading="lazy"
                    className="max-h-72 w-full rounded-xl bg-slate-100 object-contain"
                  />
                ) : null}
                {item.text ? <ExpandableText text={item.text} /> : null}

                {showError && error ? (
                  <div
                    className={`break-words rounded-xl px-3 py-2 text-[13px] ${
                      retrying ? 'bg-amber-50 text-amber-900' : 'bg-rose-50 text-rose-800'
                    }`}
                  >
                    <p className="font-medium">{retrying ? `직전 시도 실패: ${error.label}` : error.label}</p>
                    {error.detail ? <p className="mt-1 text-xs opacity-80 [overflow-wrap:anywhere]">{error.detail}</p> : null}
                  </div>
                ) : null}

                {postHref || item.state === 'queued' ? (
                  <div className="flex flex-wrap gap-2">
                    {postHref ? (
                      <a
                        href={postHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 active:bg-slate-100"
                      >
                        게시물 보기 <ExternalLink className="h-4 w-4" aria-hidden />
                      </a>
                    ) : null}
                    {item.state === 'queued' ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void cancel({ jobIds: [item.id] }, item.id, '이 게시물 예약을 취소할까요?')}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-[13px] font-semibold text-rose-700 active:bg-rose-50 disabled:opacity-60"
                      >
                        {busy === item.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
                        예약 취소
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
