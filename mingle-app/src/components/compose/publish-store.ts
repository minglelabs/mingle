'use client'

import { buildClientApiPath } from '@/lib/api-contract'
import { isAccountRestrictedBody } from '@/lib/account-restriction'
import { feedEvents, trackFeedEvent, type PublishFailureReason } from '@/lib/feed-analytics'

/**
 * Background publish store.
 *
 * Lives outside any page/component so publishing keeps running while the author
 * navigates the feed, opens a conversation, etc. A single job is tracked at a
 * time (the app publishes one post at a time); the banner subscribes to it.
 *
 * Pipeline: optionally POST /posts/images (multipart; returns a server-issued
 * key) → POST /posts (create with that key and a reused clientPostId for
 * idempotency) → success. The image is uploaded first so an image-only post's
 * create already carries its image. On failure the body, the uploaded key and
 * clientPostId are kept so a retry re-uses them and the server dedupes instead
 * of creating a second post.
 *
 * A failed job is also saved as a server draft (PATCH the job's draft, or
 * create one), so dismissing the banner or restarting the app never loses the
 * body — the author finds it in the compose screen's draft list. Only when
 * that save fails too (offline, restricted account) is the job memory-only,
 * and the banner then asks before discarding it.
 */

export type PublishJobStatus = 'publishing' | 'success' | 'failed'

export type PublishInput = {
  /** Stable idempotency key; reused across retries so no duplicate post. */
  clientPostId: string
  sourceText: string | null
  sourceLanguage: string | null
  /** The background the author previewed; the server keeps it when it is a catalog key. */
  backgroundKey: string | null
  /** Server-issued key of an image already uploaded (draft photo, prior attempt). */
  imageObjectKey: string | null
  /** Prepared JPEG (EXIF-stripped) to upload when there is no key yet. */
  imageFile: File | null
  imageWidth: number | null
  imageHeight: number | null
  /** The draft to delete on success (only that draft). */
  draftId: string | null
}

export type PublishJob = {
  status: PublishJobStatus
  input: PublishInput
  /** Set on success — the created post id, for the "View post" hand-off. */
  postId: string | null
  /** Set on a 429 — seconds to wait before the retry is allowed. */
  retryAfterSeconds: number | null
  /** True while the pipeline is actively running (guards double-submits). */
  running: boolean
  /** The write was refused with 403 account_restricted — no retry is offered. */
  restricted: boolean
  /** A failed job's body is safely stored as the draft `input.draftId`. */
  savedAsDraft: boolean
}

type Listener = () => void

let current: PublishJob | null = null
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

function setJob(next: PublishJob | null) {
  current = next
  emit()
}

export function subscribePublishJob(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPublishJob(): PublishJob | null {
  return current
}

/** Clear the banner (e.g. after the author taps "View post" or dismisses success). */
export function clearPublishJob() {
  // Never clear a job that is still running.
  if (current?.running) return
  setJob(null)
}

/** Callback fired once, on a successful publish, with the deleted draft id (if any). */
type OnSuccess = (result: { postId: string; draftId: string | null }) => void
let onSuccessCallbacks = new Set<OnSuccess>()

export function onPublishSuccess(cb: OnSuccess): () => void {
  onSuccessCallbacks.add(cb)
  return () => onSuccessCallbacks.delete(cb)
}

async function deleteDraftQuietly(draftId: string) {
  try {
    await fetch(buildClientApiPath(`/posts/drafts?draftId=${encodeURIComponent(draftId)}`), {
      method: 'DELETE',
      cache: 'no-store',
    })
  } catch {
    // Best effort — a lingering draft is harmless and will be cleaned up later.
  }
}

type ApiError = { status: number; error: string; retryAfterSeconds: number | null; restricted: boolean }

async function readError(response: Response): Promise<ApiError> {
  let error = 'request_failed'
  let retryAfterSeconds: number | null = null
  let restricted = false
  try {
    const body = (await response.json()) as { error?: string; retryAfterSeconds?: number }
    if (typeof body.error === 'string') error = body.error
    if (typeof body.retryAfterSeconds === 'number') retryAfterSeconds = body.retryAfterSeconds
    restricted = response.status === 403 && isAccountRestrictedBody(body)
  } catch {
    // no JSON body
  }
  return { status: response.status, error, retryAfterSeconds, restricted }
}

function isSameJob(job: PublishJob | null, input: PublishInput): job is PublishJob {
  return job != null && job.input.clientPostId === input.clientPostId
}

/**
 * Keep a failed job's body as a server draft so it survives a dismissed banner
 * and an app restart. Updates the job's own draft when it has one (the compose
 * draft the author was editing), else creates one and adopts its id so a later
 * successful retry deletes exactly that draft. A restricted account cannot
 * write drafts either, so nothing is attempted there.
 */
async function preserveFailedJob(input: PublishInput) {
  const payload = {
    sourceText: input.sourceText ?? '',
    backgroundKey: input.backgroundKey,
    // A photo that never uploaded has no key a draft could keep; the draft
    // then holds the text only (the job still holds the file for retry).
    ...(input.imageObjectKey
      ? { imageObjectKey: input.imageObjectKey, imageWidth: input.imageWidth, imageHeight: input.imageHeight }
      : {}),
  }
  let draftId = input.draftId
  try {
    if (draftId) {
      const res = await fetch(buildClientApiPath('/posts/drafts'), {
        method: 'PATCH',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, ...payload }),
      })
      if (!res.ok) draftId = null
    }
    if (!draftId) {
      const res = await fetch(buildClientApiPath('/posts/drafts'), {
        method: 'POST',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return
      const body = (await res.json()) as { draft?: { id?: unknown } }
      if (typeof body.draft?.id !== 'string') return
      draftId = body.draft.id
    }
  } catch {
    return
  }
  const job = current
  // The author may have retried or dismissed meanwhile. A dismissed job's
  // draft simply stays in the list; a retry that already published removes it;
  // a failed or still-running job of the same post adopts it, so the eventual
  // success deletes exactly this draft.
  if (!isSameJob(job, input)) return
  if (job.status === 'success') {
    if (draftId !== job.input.draftId) void deleteDraftQuietly(draftId)
    return
  }
  setJob({
    ...job,
    input: { ...job.input, draftId },
    savedAsDraft: job.status === 'failed' ? true : job.savedAsDraft,
  })
}

/** Coarse, content-free failure class for the publish analytics event. */
export function publishFailureReason(
  err: Pick<ApiError, 'status' | 'restricted'>,
  step: 'image_upload' | 'create',
): PublishFailureReason {
  if (err.restricted) return 'restricted'
  if (err.status === 429) return 'rate_limited'
  return step
}

async function runPipeline(initialInput: PublishInput) {
  let input = initialInput

  const fail = (err: ApiError, postId: string | null, step: 'image_upload' | 'create') => {
    trackFeedEvent(
      feedEvents.publishFailed({
        hasImage: Boolean(input.imageObjectKey || input.imageFile),
        text: input.sourceText,
        reason: publishFailureReason(err, step),
      }),
    )
    setJob({
      status: 'failed',
      input,
      postId,
      retryAfterSeconds: err.status === 429 ? err.retryAfterSeconds : null,
      running: false,
      restricted: err.restricted,
      savedAsDraft: false,
    })
    if (!err.restricted) void preserveFailedJob(input)
  }

  // Step 1 — upload a new image first, so the create request carries its key.
  if (!input.imageObjectKey && input.imageFile) {
    const form = new FormData()
    form.append('file', input.imageFile)
    const imageRes = await fetch(buildClientApiPath('/posts/images'), {
      method: 'POST',
      cache: 'no-store',
      body: form,
    })
    if (!imageRes.ok) {
      fail(await readError(imageRes), null, 'image_upload')
      return
    }
    const uploaded = (await imageRes.json()) as { imageObjectKey: string; width?: number; height?: number }
    // Keep the key (and the processed size) on the job so a retry skips the re-upload.
    input = {
      ...input,
      imageObjectKey: uploaded.imageObjectKey,
      imageFile: null,
      imageWidth: typeof uploaded.width === 'number' ? uploaded.width : input.imageWidth,
      imageHeight: typeof uploaded.height === 'number' ? uploaded.height : input.imageHeight,
    }
  }

  // Step 2 — create the post (idempotent via clientPostId).
  const createRes = await fetch(buildClientApiPath('/posts'), {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientPostId: input.clientPostId,
      sourceText: input.sourceText,
      sourceLanguage: input.sourceLanguage,
      ...(input.backgroundKey ? { backgroundKey: input.backgroundKey } : {}),
      ...(input.imageObjectKey
        ? { imageObjectKey: input.imageObjectKey, imageWidth: input.imageWidth, imageHeight: input.imageHeight }
        : {}),
    }),
  })

  if (!createRes.ok) {
    fail(await readError(createRes), null, 'create')
    return
  }

  const created = (await createRes.json()) as { postId: string }
  const postId = created.postId

  // Step 3 — success. Delete only this draft, keep it on failure (handled above).
  // Read the draft id from the live job: a failed attempt may have adopted one.
  const draftId = (isSameJob(current, input) ? current.input.draftId : null) ?? input.draftId
  if (draftId) void deleteDraftQuietly(draftId)

  setJob({
    status: 'success',
    input: { ...input, draftId },
    postId,
    retryAfterSeconds: null,
    running: false,
    restricted: false,
    savedAsDraft: false,
  })
  trackFeedEvent(
    feedEvents.publishSucceeded({ hasImage: Boolean(input.imageObjectKey), text: input.sourceText }),
  )
  for (const cb of onSuccessCallbacks) cb({ postId, draftId })
}

/** Whether a publish is in flight right now (a new one would be refused). */
export function isPublishRunning(): boolean {
  return current?.running === true
}

/**
 * Begin (or resume) publishing. Returns false — and changes nothing — while
 * another job is still running, so a double-tap never creates the same post
 * twice and a second post is never silently dropped: the caller keeps it
 * (on screen and as a draft) and tells the author to post it afterwards.
 * Starting a new post over a FAILED job is allowed; that job's body is
 * already a draft (or the banner asked before discarding it).
 */
export function startPublish(input: PublishInput): boolean {
  if (current?.running) return false
  setJob({
    status: 'publishing',
    input,
    postId: null,
    retryAfterSeconds: null,
    running: true,
    restricted: false,
    savedAsDraft: false,
  })
  void runPipeline(input).catch(() => {
    const failedInput = isSameJob(current, input) ? current.input : input
    trackFeedEvent(
      feedEvents.publishFailed({
        hasImage: Boolean(failedInput.imageObjectKey || failedInput.imageFile),
        text: failedInput.sourceText,
        reason: 'network',
      }),
    )
    setJob({
      status: 'failed',
      input: failedInput,
      postId: null,
      retryAfterSeconds: null,
      running: false,
      restricted: false,
      savedAsDraft: false,
    })
    void preserveFailedJob(failedInput)
  })
  return true
}

/** Retry a failed job, re-using its clientPostId (server dedupes the create). */
export function retryPublish() {
  const job = current
  if (!job || job.running || job.status !== 'failed' || job.restricted) return
  startPublish(job.input)
}

/** TEST-ONLY reset of module state. */
export function __resetPublishStoreForTest() {
  current = null
  listeners.clear()
  onSuccessCallbacks = new Set()
}
