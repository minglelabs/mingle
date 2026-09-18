'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Instagram, Loader2 } from 'lucide-react'
import { buildClientApiPath } from '@/lib/api-contract'
import { getOrCreateSessionKey, getOrCreateTrackingUserId } from './LivePhoneDemo/realtime-storage'
import {
  resolveLivePhoneDemoFeedbackCopy,
  type LivePhoneDemoFeedbackCategory,
} from './LivePhoneDemo/live-phone-demo.feedback-copy'
import { LivePhoneDemoFeedbackMessageText } from './LivePhoneDemo/live-phone-demo.feedback-links'

const FEEDBACK_API_PATH = buildClientApiPath('/feedback')
const FEEDBACK_INSTAGRAM_CONTACT_URL = 'https://www.instagram.com/mingle.labs/'
const FEEDBACK_MIN_MESSAGE_LENGTH = 5
const LS_KEY_FEEDBACK_DRAFT = 'mingle_live_phone_demo_feedback_draft_v1'

type FeedbackSubmitErrorCode =
  | 'message_too_short'
  | 'invalid_contact_email'
  | 'invalid_category'
  | 'invalid_json'

type FeedbackHistoryMessage = {
  id: string
  authorType: 'user' | 'team'
  message: string
  createdAt: string
}

type FeedbackHistoryThread = {
  id: string
  category: LivePhoneDemoFeedbackCategory
  contactEmail: string | null
  createdAt: string
  messages: FeedbackHistoryMessage[]
}

type FeedbackHistoryResponse = {
  threads: FeedbackHistoryThread[]
}

type PersistedFeedbackDraft = {
  category: LivePhoneDemoFeedbackCategory
  message: string
  email: string
  emailEdited: boolean
}

type FeedbackPageTab = 'compose' | 'history'

function isLivePhoneDemoFeedbackCategory(value: unknown): value is LivePhoneDemoFeedbackCategory {
  return value === 'feedback' || value === 'suggestion' || value === 'inquiry'
}

function readPersistedFeedbackDraft(): PersistedFeedbackDraft | null {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.localStorage.getItem(LS_KEY_FEEDBACK_DRAFT)
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue) as Partial<PersistedFeedbackDraft> | null
    if (!parsed || typeof parsed !== 'object') return null

    const category = isLivePhoneDemoFeedbackCategory(parsed.category)
      ? parsed.category
      : 'feedback'
    const message = typeof parsed.message === 'string' ? parsed.message : ''
    const email = typeof parsed.email === 'string' ? parsed.email : ''
    const emailEdited = parsed.emailEdited === true

    if (!message && !email && category === 'feedback' && !emailEdited) return null

    return { category, message, email, emailEdited }
  } catch {
    return null
  }
}

function persistFeedbackDraft(draft: PersistedFeedbackDraft | null): void {
  if (typeof window === 'undefined') return

  try {
    if (draft) {
      window.localStorage.setItem(LS_KEY_FEEDBACK_DRAFT, JSON.stringify(draft))
    } else {
      window.localStorage.removeItem(LS_KEY_FEEDBACK_DRAFT)
    }
  } catch {
    // Ignore local persistence failures so feedback remains usable.
  }
}

function parseFeedbackSubmitErrorCode(value: unknown): FeedbackSubmitErrorCode | null {
  if (value === 'message_too_short') return value
  if (value === 'invalid_contact_email') return value
  if (value === 'invalid_category') return value
  if (value === 'invalid_json') return value
  return null
}

function isValidFeedbackEmailAddress(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

function formatFeedbackTimestamp(createdAt: string, locale: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''

  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

export default function ProfileFeedbackContent({
  uiLocale,
  defaultFeedbackEmail = '',
}: {
  uiLocale: string
  defaultFeedbackEmail?: string
}) {
  const feedbackCopy = useMemo(() => resolveLivePhoneDemoFeedbackCopy(uiLocale), [uiLocale])
  const normalizedDefaultFeedbackEmail = defaultFeedbackEmail.trim()
  const initialDefaultFeedbackEmailRef = useRef(normalizedDefaultFeedbackEmail)
  const [feedbackTab, setFeedbackTab] = useState<FeedbackPageTab>('compose')
  const [feedbackCategory, setFeedbackCategory] = useState<LivePhoneDemoFeedbackCategory>('feedback')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackEmail, setFeedbackEmail] = useState(normalizedDefaultFeedbackEmail)
  const [feedbackEmailEdited, setFeedbackEmailEdited] = useState(false)
  const [feedbackSubmitError, setFeedbackSubmitError] = useState<string | null>(null)
  const [feedbackSubmitSuccess, setFeedbackSubmitSuccess] = useState(false)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackThreads, setFeedbackThreads] = useState<FeedbackHistoryThread[]>([])
  const [isFeedbackHistoryLoading, setIsFeedbackHistoryLoading] = useState(false)
  const [feedbackHistoryError, setFeedbackHistoryError] = useState<string | null>(null)
  const [hasHydratedFeedbackDraft, setHasHydratedFeedbackDraft] = useState(false)

  useEffect(() => {
    initialDefaultFeedbackEmailRef.current = normalizedDefaultFeedbackEmail
    if (feedbackEmailEdited) return
    setFeedbackEmail(normalizedDefaultFeedbackEmail)
  }, [feedbackEmailEdited, normalizedDefaultFeedbackEmail])

  useEffect(() => {
    let cancelled = false
    const schedule = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => { void Promise.resolve().then(callback) }

    schedule(() => {
      if (cancelled) return
      const persistedDraft = readPersistedFeedbackDraft()
      if (persistedDraft) {
        setFeedbackCategory(persistedDraft.category)
        setFeedbackMessage(persistedDraft.message)
        setFeedbackEmail(persistedDraft.email)
        setFeedbackEmailEdited(
          persistedDraft.emailEdited
          || (
            persistedDraft.email.trim().length > 0
            && persistedDraft.email.trim() !== initialDefaultFeedbackEmailRef.current
          ),
        )
      }
      setHasHydratedFeedbackDraft(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasHydratedFeedbackDraft) return
    if (!feedbackMessage) {
      persistFeedbackDraft(null)
      return
    }

    persistFeedbackDraft({
      category: feedbackCategory,
      message: feedbackMessage,
      email: feedbackEmail,
      emailEdited: feedbackEmailEdited,
    })
  }, [feedbackCategory, feedbackEmail, feedbackEmailEdited, feedbackMessage, hasHydratedFeedbackDraft])

  const buildFeedbackRequestHeaders = useCallback((): Record<string, string> => ({
    'x-mingle-session-key': getOrCreateSessionKey(),
    'x-mingle-user-id': getOrCreateTrackingUserId(),
  }), [])

  const clearFeedbackSubmitState = useCallback(() => {
    setFeedbackSubmitError(null)
    setFeedbackSubmitSuccess(false)
  }, [])

  const loadFeedbackThreads = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsFeedbackHistoryLoading(true)
    setFeedbackHistoryError(null)

    try {
      const response = await fetch(FEEDBACK_API_PATH, {
        method: 'GET',
        cache: 'no-store',
        headers: buildFeedbackRequestHeaders(),
      })
      if (!response.ok) throw new Error(`feedback_history_fetch_failed:${response.status}`)

      const body = await response.json() as FeedbackHistoryResponse
      setFeedbackThreads(Array.isArray(body.threads) ? body.threads : [])
    } catch {
      setFeedbackHistoryError(feedbackCopy.historyErrorMessage)
    } finally {
      setIsFeedbackHistoryLoading(false)
    }
  }, [buildFeedbackRequestHeaders, feedbackCopy.historyErrorMessage])

  useEffect(() => {
    void loadFeedbackThreads()
  }, [loadFeedbackThreads])

  const handleFeedbackSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextFeedbackMessage = feedbackMessage.trim()
    const nextFeedbackEmail = feedbackEmail.trim()
    if (nextFeedbackMessage.length < FEEDBACK_MIN_MESSAGE_LENGTH) {
      setFeedbackSubmitSuccess(false)
      setFeedbackSubmitError(feedbackCopy.messageTooShortMessage)
      return
    }

    if (nextFeedbackEmail && !isValidFeedbackEmailAddress(nextFeedbackEmail)) {
      setFeedbackSubmitSuccess(false)
      setFeedbackSubmitError(feedbackCopy.invalidEmailMessage)
      return
    }

    setIsSubmittingFeedback(true)
    setFeedbackSubmitError(null)
    setFeedbackSubmitSuccess(false)

    try {
      const response = await fetch(FEEDBACK_API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildFeedbackRequestHeaders(),
        },
        body: JSON.stringify({
          category: feedbackCategory,
          message: nextFeedbackMessage,
          contactEmail: nextFeedbackEmail || undefined,
          locale: uiLocale,
          pathname: typeof window === 'undefined' ? null : window.location.pathname,
        }),
      })

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null) as { error?: unknown } | null
        const errorCode = parseFeedbackSubmitErrorCode(responseBody?.error)
        if (errorCode === 'message_too_short') {
          setFeedbackSubmitError(feedbackCopy.messageTooShortMessage)
          return
        }
        if (errorCode === 'invalid_contact_email') {
          setFeedbackSubmitError(feedbackCopy.invalidEmailMessage)
          return
        }
        throw new Error(`feedback_submit_failed:${response.status}`)
      }

      setFeedbackMessage('')
      persistFeedbackDraft(null)
      setFeedbackSubmitSuccess(true)
      await loadFeedbackThreads({ silent: true })
    } catch {
      setFeedbackSubmitError(feedbackCopy.errorMessage)
      setFeedbackSubmitSuccess(false)
    } finally {
      setIsSubmittingFeedback(false)
    }
  }, [buildFeedbackRequestHeaders, feedbackCategory, feedbackCopy.errorMessage, feedbackCopy.invalidEmailMessage, feedbackCopy.messageTooShortMessage, feedbackEmail, feedbackMessage, loadFeedbackThreads, uiLocale])

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <a
          href={FEEDBACK_INSTAGRAM_CONTACT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-white px-3 py-2.5 text-[0.95rem] font-semibold leading-tight text-gray-900 shadow-sm transition hover:border-pink-300 hover:bg-pink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
        >
          <Instagram size={18} strokeWidth={2.2} aria-hidden="true" />
          <span className="min-w-0 text-center">{feedbackCopy.instagramContactButtonLabel}</span>
        </a>
      </div>

      <div className="flex shrink-0 border-b border-gray-100 px-4">
        {([
          { value: 'compose', label: feedbackCopy.composeTabLabel },
          { value: 'history', label: feedbackCopy.historyTabLabel },
        ] satisfies Array<{ value: FeedbackPageTab; label: string }>).map((tab) => {
          const isSelected = feedbackTab === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFeedbackTab(tab.value)}
              className="flex-1 border-b-2 py-3 text-[1.02rem] font-semibold transition"
              style={{
                borderBottomColor: isSelected ? '#111827' : 'transparent',
                color: isSelected ? '#111827' : '#9CA3AF',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 16px), 20px)' }}>
        {feedbackTab === 'compose' ? (
          <div className="px-4 py-4">
            <form className="space-y-4" onSubmit={handleFeedbackSubmit}>
              <div className="space-y-2">
                <div className="text-[0.9rem] font-semibold text-gray-700">{feedbackCopy.categoryLabel}</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['feedback', 'suggestion', 'inquiry'] satisfies LivePhoneDemoFeedbackCategory[]).map((category) => {
                    const isSelected = feedbackCategory === category
                    return (
                      <button
                        key={category}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={isSubmittingFeedback}
                        onClick={() => {
                          clearFeedbackSubmitState()
                          setFeedbackCategory(category)
                        }}
                        className={`rounded-xl border px-2.5 py-2 text-[0.9rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900'}`}
                      >
                        {feedbackCopy.categoryLabels[category]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-[0.9rem] font-semibold text-gray-700">{feedbackCopy.messageLabel}</span>
                <textarea
                  value={feedbackMessage}
                  rows={4}
                  disabled={isSubmittingFeedback}
                  onChange={(event) => {
                    clearFeedbackSubmitState()
                    setFeedbackMessage(event.target.value)
                  }}
                  placeholder={feedbackCopy.messagePlaceholder}
                  className="min-h-[108px] w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[1.02rem] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[0.9rem] font-semibold text-gray-700">{feedbackCopy.emailLabel}</span>
                <input
                  type="email"
                  value={feedbackEmail}
                  disabled={isSubmittingFeedback}
                  onChange={(event) => {
                    setFeedbackEmailEdited(true)
                    clearFeedbackSubmitState()
                    setFeedbackEmail(event.target.value)
                  }}
                  placeholder={feedbackCopy.emailPlaceholder}
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-[1.02rem] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <button
                type="submit"
                disabled={isSubmittingFeedback}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 text-[1.02rem] font-semibold text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSubmittingFeedback ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>{feedbackCopy.sendingButtonLabel}</span>
                  </>
                ) : (
                  <span>{feedbackCopy.sendButtonLabel}</span>
                )}
              </button>

              <div aria-live="polite" className="min-h-[1.25rem] text-[0.88rem]">
                {feedbackSubmitError ? <p className="font-medium text-rose-600">{feedbackSubmitError}</p> : null}
                {!feedbackSubmitError && feedbackSubmitSuccess ? <p className="font-medium text-emerald-600">{feedbackCopy.successMessage}</p> : null}
              </div>
            </form>
          </div>
        ) : (
          <div className="px-4 py-4">
            <div>
              <div className="text-[1.02rem] font-semibold text-gray-900">{feedbackCopy.historyTitle}</div>
              <p className="mt-1 text-[0.92rem] leading-5 text-gray-500">{feedbackCopy.historyDescription}</p>
            </div>

            <div className="mt-3 space-y-3">
              {isFeedbackHistoryLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-sky-100 bg-white/80 px-3 py-3 text-[0.94rem] text-gray-600">
                  <Loader2 size={14} className="animate-spin text-sky-600" />
                  <span>{feedbackCopy.historyLoadingLabel}</span>
                </div>
              ) : null}

              {!isFeedbackHistoryLoading && feedbackHistoryError ? (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-[0.94rem] font-medium text-rose-600">{feedbackHistoryError}</div>
              ) : null}

              {!isFeedbackHistoryLoading && !feedbackHistoryError && feedbackThreads.length === 0 ? (
                <div className="rounded-2xl border border-sky-100 bg-white/80 px-3 py-3 text-[0.94rem] text-gray-500">{feedbackCopy.historyEmptyLabel}</div>
              ) : null}

              {!isFeedbackHistoryLoading && !feedbackHistoryError && feedbackThreads.map((thread) => {
                const hasTeamReply = thread.messages.some((message) => message.authorType === 'team')
                return (
                  <div key={thread.id} className="rounded-[1.3rem] border border-sky-100 bg-white/85 px-3 py-3 shadow-[0_8px_20px_rgba(14,116,144,0.05)]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[0.82rem] font-semibold text-sky-700">{feedbackCopy.categoryLabels[thread.category]}</span>
                      <span className="text-[0.82rem] text-gray-500">{formatFeedbackTimestamp(thread.createdAt, uiLocale)}</span>
                    </div>

                    {!hasTeamReply ? <div className="mt-2 inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[0.82rem] font-medium text-amber-700">{feedbackCopy.pendingReplyLabel}</div> : null}

                    <div className="mt-3 space-y-2.5">
                      {thread.messages.map((message, index) => {
                        const isTeamMessage = message.authorType === 'team'
                        const authorLabel = isTeamMessage ? feedbackCopy.teamLabel : feedbackCopy.meLabel
                        return (
                          <div key={message.id} className={`rounded-[1.1rem] px-3 py-2.5 ${isTeamMessage ? 'border border-emerald-100 bg-emerald-50/70' : 'border border-sky-100 bg-sky-50/70'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <span className={`text-[0.82rem] font-semibold ${isTeamMessage ? 'text-emerald-700' : 'text-sky-700'}`}>{authorLabel}</span>
                              <span className="text-[0.8rem] text-gray-500">{formatFeedbackTimestamp(message.createdAt, uiLocale)}</span>
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap break-words text-[0.98rem] leading-5 text-gray-800"><LivePhoneDemoFeedbackMessageText message={message.message} /></p>
                            {index === 0 && thread.contactEmail ? <p className="mt-2 text-[0.8rem] text-gray-500">{thread.contactEmail}</p> : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
