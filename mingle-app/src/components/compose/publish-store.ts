'use client'

import { buildClientApiPath } from '@/lib/api-contract'

/**
 * Background publish store.
 *
 * Lives outside any page/component so publishing keeps running while the author
 * navigates the feed, opens a conversation, etc. A single job is tracked at a
 * time (the app publishes one post at a time); the banner subscribes to it.
 *
 * Pipeline: POST /posts (create, with a reused clientPostId for idempotency) →
 * optionally POST /posts/{id}/image (multipart) → success. On failure the body,
 * image and clientPostId are kept so a retry re-uses the same id and the server
 * dedupes instead of creating a second post.
 */

export type PublishJobStatus = 'publishing' | 'success' | 'failed'

export type PublishInput = {
  /** Stable idempotency key; reused across retries so no duplicate post. */
  clientPostId: string
  sourceText: string | null
  sourceLanguage: string | null
  /** Prepared JPEG (EXIF-stripped) to upload after the post is created. */
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

type ApiError = { status: number; error: string; retryAfterSeconds: number | null }

async function readError(response: Response): Promise<ApiError> {
  let error = 'request_failed'
  let retryAfterSeconds: number | null = null
  try {
    const body = (await response.json()) as { error?: string; retryAfterSeconds?: number }
    if (typeof body.error === 'string') error = body.error
    if (typeof body.retryAfterSeconds === 'number') retryAfterSeconds = body.retryAfterSeconds
  } catch {
    // no JSON body
  }
  return { status: response.status, error, retryAfterSeconds }
}

async function runPipeline(input: PublishInput) {
  // Step 1 — create the post (idempotent via clientPostId).
  const createRes = await fetch(buildClientApiPath('/posts'), {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientPostId: input.clientPostId,
      sourceText: input.sourceText,
      sourceLanguage: input.sourceLanguage,
    }),
  })

  if (!createRes.ok) {
    const err = await readError(createRes)
    setJob({
      status: 'failed',
      input,
      postId: null,
      retryAfterSeconds: err.status === 429 ? err.retryAfterSeconds : null,
      running: false,
    })
    return
  }

  const created = (await createRes.json()) as { postId: string }
  const postId = created.postId

  // Step 2 — attach the image if there is one.
  if (input.imageFile) {
    const form = new FormData()
    form.append('file', input.imageFile)
    if (input.imageWidth != null) form.append('width', String(input.imageWidth))
    if (input.imageHeight != null) form.append('height', String(input.imageHeight))

    const imageRes = await fetch(buildClientApiPath(`/posts/${encodeURIComponent(postId)}/image`), {
      method: 'POST',
      cache: 'no-store',
      body: form,
    })
    if (!imageRes.ok) {
      const err = await readError(imageRes)
      // The post exists; keep the same clientPostId so a retry dedupes on create
      // and only re-runs the image step.
      setJob({
        status: 'failed',
        input,
        postId,
        retryAfterSeconds: err.status === 429 ? err.retryAfterSeconds : null,
        running: false,
      })
      return
    }
  }

  // Step 3 — success. Delete only this draft, keep it on failure (handled above).
  if (input.draftId) void deleteDraftQuietly(input.draftId)

  setJob({ status: 'success', input, postId, retryAfterSeconds: null, running: false })
  for (const cb of onSuccessCallbacks) cb({ postId, draftId: input.draftId })
}

/**
 * Begin (or resume) publishing. Consecutive taps while a job runs are ignored,
 * so the same post can never be created twice from double-tap.
 */
export function startPublish(input: PublishInput) {
  if (current?.running) return
  setJob({ status: 'publishing', input, postId: current?.postId ?? null, retryAfterSeconds: null, running: true })
  void runPipeline(input).catch(() => {
    setJob({ status: 'failed', input, postId: current?.postId ?? null, retryAfterSeconds: null, running: false })
  })
}

/** Retry a failed job, re-using its clientPostId (server dedupes the create). */
export function retryPublish() {
  const job = current
  if (!job || job.running || job.status !== 'failed') return
  startPublish(job.input)
}

/** TEST-ONLY reset of module state. */
export function __resetPublishStoreForTest() {
  current = null
  listeners.clear()
  onSuccessCallbacks = new Set()
}
