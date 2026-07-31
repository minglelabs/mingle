'use client'

import { Loader2, X } from 'lucide-react'
import type {
  ConversationSummary,
  ConversationSummaryCopy,
} from './conversation-summary'

type ConversationSummarySheetProps = {
  open: boolean
  isLoading: boolean
  summary: ConversationSummary | null
  error: 'empty' | 'request' | null
  copy: ConversationSummaryCopy
  onRetry: () => void
  onDone: () => void
}

function SummarySection({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  if (items.length === 0) return null

  return (
    <section className="rounded-2xl bg-gray-50 px-4 py-3">
      <h3 className="text-sm font-semibold text-gray-950">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-5 text-gray-700">
            <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function ConversationSummarySheet({
  open,
  isLoading,
  summary,
  error,
  copy,
  onRetry,
  onDone,
}: ConversationSummarySheetProps) {
  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-[90] flex items-end bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-label={copy.summaryTitle}
    >
      <section
        className="flex max-h-[88%] min-h-[46%] w-full flex-col overflow-hidden rounded-t-[1.4rem] bg-white shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-4">
          <h2 className="text-[1.05rem] font-semibold text-gray-950">{copy.summaryTitle}</h2>
          <button
            type="button"
            onClick={onDone}
            aria-label={copy.doneLabel}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
          >
            <X size={21} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {isLoading ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-gray-600">
              <Loader2 size={28} className="animate-spin text-amber-500" aria-hidden />
              <p className="text-sm">{copy.summarizingLabel}</p>
            </div>
          ) : error ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-5 text-center">
              <p className="text-sm leading-6 text-gray-600">
                {error === 'empty' ? copy.emptyMessage : copy.errorMessage}
              </p>
              {error === 'request' ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-xl border border-gray-300 px-5 text-sm font-semibold text-gray-800"
                >
                  {copy.retryLabel}
                </button>
              ) : null}
            </div>
          ) : summary ? (
            <div className="space-y-3">
              {summary.overview ? (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-950">{copy.overviewTitle}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-700">{summary.overview}</p>
                </section>
              ) : null}
              <SummarySection title={copy.keyPointsTitle} items={summary.keyPoints} />
              <SummarySection title={copy.decisionsTitle} items={summary.decisions} />
              <SummarySection title={copy.followUpsTitle} items={summary.followUps} />
              <SummarySection
                title={copy.needsConfirmationTitle}
                items={summary.needsConfirmation}
              />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onDone}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gray-950 text-sm font-semibold text-white transition active:scale-[0.99]"
          >
            {copy.doneLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
