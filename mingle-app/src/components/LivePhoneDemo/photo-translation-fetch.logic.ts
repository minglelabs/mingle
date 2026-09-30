// Polling rules for the photo translation data hook (spec §1.8): when to poll
// again, when to retry a failed request, when a cached response is final so
// reopening the viewer needs no request at all, and the request loop itself
// with its clock, timers, fetch and visibility injected so it runs in tests.

import {
  CONVERSATION_IMAGE_TEXT_MAX_POLL_MS,
  CONVERSATION_IMAGE_TEXT_POLL_MS,
  isConversationImageTextPending,
  languageHasTextToTranslate,
  parseConversationImageTextResponse,
  type ConversationImageTextResponse,
} from '@/lib/conversation-image-text'
import { EXPECTED_ACCOUNT_HEADER } from '@/lib/request-account-guard'
import { createPhotoTranslationMemory } from './photo-translation-toggle.logic'

/** Per-request deadline (the profile-bio fetch uses the same). */
export const PHOTO_TRANSLATION_REQUEST_TIMEOUT_MS = 12_000
/** Consecutive failed requests after which one viewer session stops trying. */
export const PHOTO_TRANSLATION_MAX_FAILURES = 3

/**
 * Delay before the next poll, or null to stop: poll only while something
 * requested is pending, at the server's retryAfterMs (else the contract
 * interval), and never past the per-session budget.
 */
export function nextPhotoTranslationPollDelay(
  response: ConversationImageTextResponse | null | undefined,
  elapsedMs: number,
  { pollMs = CONVERSATION_IMAGE_TEXT_POLL_MS, maxPollMs = CONVERSATION_IMAGE_TEXT_MAX_POLL_MS } = {},
): number | null {
  if (!response || !isConversationImageTextPending(response)) return null
  const delay = response.retryAfterMs ?? pollMs
  return elapsedMs + delay > maxPollMs ? null : delay
}

/**
 * Delay before retrying a failed request, or null to give up: client errors
 * (404 for a deleted or foreign message, 401/403) are final; network errors,
 * timeouts, 408/429 and 5xx back off exponentially within the budget.
 */
export function nextPhotoTranslationRetryDelay({ failures, httpStatus, elapsedMs, pollMs = CONVERSATION_IMAGE_TEXT_POLL_MS, maxPollMs = CONVERSATION_IMAGE_TEXT_MAX_POLL_MS }: {
  failures: number
  httpStatus?: number
  elapsedMs: number
  pollMs?: number
  maxPollMs?: number
}): number | null {
  if (httpStatus && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429) return null
  if (failures >= PHOTO_TRANSLATION_MAX_FAILURES) return null
  const delay = pollMs * 2 ** Math.max(0, failures - 1)
  return elapsedMs + delay > maxPollMs ? null : delay
}

/** A local terminal view for pending work when this polling session ends. */
export function markPendingPhotoTranslationFailed(
  response: ConversationImageTextResponse | null | undefined,
): ConversationImageTextResponse | null {
  if (!response || !isConversationImageTextPending(response)) return response ?? null
  if (response.status === 'pending') return { status: 'failed', blocks: [], translations: [] }
  return {
    status: 'ready',
    blocks: response.blocks,
    translations: response.translations.map(translation => translation.status === 'pending'
      ? { ...translation, status: 'failed', texts: {} }
      : translation),
  }
}

/**
 * True when a response can no longer change for these languages: no text, or
 * every language either needs no translation or is translated. Failed or
 * pending entries (and disabled/failed images) are asked again on the next
 * open, since the server retries them under its attempt limit.
 */
export function isPhotoTranslationSettled(
  response: ConversationImageTextResponse | null | undefined,
  languages: readonly string[],
): boolean {
  if (!response) return false
  if (response.status === 'empty') return true
  if (response.status !== 'ready') return false
  return languages.every(language => !languageHasTextToTranslate(response.blocks, language)
    || response.translations.some(entry => entry.language === language && entry.status === 'ready'))
}

/**
 * The response to keep after a poll: the previous object when nothing
 * changed, else the new one reusing the previous block array when the blocks
 * are identical (usually only a translation moved on), so the overlay does
 * not re-sample colors or re-render on every poll.
 */
export function mergePhotoTranslationResponse(
  previous: ConversationImageTextResponse | null | undefined,
  next: ConversationImageTextResponse,
): ConversationImageTextResponse {
  if (!previous) return next
  const sameBlocks = JSON.stringify(previous.blocks) === JSON.stringify(next.blocks)
  const merged = sameBlocks ? { ...next, blocks: previous.blocks } : next
  return sameBlocks && JSON.stringify(previous) === JSON.stringify(merged) ? previous : merged
}

/** Latest response per photo (same key as the selection memory), for the app session. */
export const photoTranslationResponses = createPhotoTranslationMemory<ConversationImageTextResponse>(200)

export type PhotoTranslationPoller = {
  /** The document became visible again: run a poll that was held back while hidden. */
  resume: () => void
  /** The viewer closed: abort the request in flight and stop polling. */
  stop: () => void
}

type TimerHandle = ReturnType<typeof setTimeout>

/**
 * One viewer session of requests for a photo's text (spec §1.8 and the
 * profile-bio fetch pattern): `cache: 'no-store'`, an AbortController with a
 * deadline, a generation counter that drops stale answers, and the
 * expected-account header. Skips the request when the cached answer is final;
 * otherwise asks once, then polls while anything requested is pending within
 * the session budget, never overlapping, holding polls while the document is
 * hidden. `onResponse` sees only answers that changed something.
 */
export function startPhotoTranslationPoller({
  endpoint,
  viewerUserId,
  languages,
  cached,
  onResponse,
  fetchImpl = (input, init) => fetch(input, init),
  now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = handle => clearTimeout(handle),
  isHidden = () => typeof document !== 'undefined' && document.hidden,
}: {
  endpoint: string
  viewerUserId: string
  languages: readonly string[]
  cached?: ConversationImageTextResponse | null
  onResponse: (response: ConversationImageTextResponse) => void
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>
  now?: () => number
  setTimer?: (callback: () => void, delay: number) => TimerHandle
  clearTimer?: (handle: TimerHandle) => void
  isHidden?: () => boolean
}): PhotoTranslationPoller {
  const startedAt = now()
  let latest = cached ?? null
  let generation = 0
  let closed = false
  let controller: AbortController | null = null
  let timer: TimerHandle | null = null
  let failures = 0
  let heldWhileHidden = false

  const stopPending = () => {
    const terminal = markPendingPhotoTranslationFailed(latest)
    if (terminal && terminal !== latest) {
      latest = terminal
      onResponse(terminal)
    }
  }

  const schedule = (delay: number | null) => {
    if (closed) return
    if (delay == null) {
      stopPending()
      return
    }
    timer = setTimer(() => {
      timer = null
      void load()
    }, delay)
  }

  const load = async () => {
    if (closed || controller) return
    if (isHidden()) {
      heldWhileHidden = true
      return
    }
    const revision = ++generation
    const request = new AbortController()
    controller = request
    const deadline = setTimer(() => request.abort(), PHOTO_TRANSLATION_REQUEST_TIMEOUT_MS)
    let httpStatus: number | undefined
    try {
      const result = await fetchImpl(endpoint, {
        cache: 'no-store',
        signal: request.signal,
        headers: { [EXPECTED_ACCOUNT_HEADER]: viewerUserId },
      })
      httpStatus = result.status
      if (!result.ok) throw new Error('photo_translation_unavailable')
      const parsed = parseConversationImageTextResponse(await result.json())
      if (!parsed) throw new Error('photo_translation_invalid')
      if (closed || revision !== generation) return
      failures = 0
      const next = mergePhotoTranslationResponse(latest, parsed)
      if (next !== latest) {
        latest = next
        onResponse(next)
      }
      schedule(nextPhotoTranslationPollDelay(next, now() - startedAt))
    } catch {
      if (closed || revision !== generation) return
      failures += 1
      schedule(nextPhotoTranslationRetryDelay({ failures, httpStatus, elapsedMs: now() - startedAt }))
    } finally {
      clearTimer(deadline)
      if (controller === request) controller = null
    }
  }

  if (!isPhotoTranslationSettled(latest, languages)) void load()

  return {
    resume: () => {
      if (closed || !heldWhileHidden || isHidden()) return
      heldWhileHidden = false
      void load()
    },
    stop: () => {
      closed = true
      generation += 1
      controller?.abort()
      if (timer != null) clearTimer(timer)
      timer = null
    },
  }
}
