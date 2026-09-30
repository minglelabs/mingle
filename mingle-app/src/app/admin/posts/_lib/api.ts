/**
 * Browser-side calls to the admin posts API (`/admin/posts/api/**`). The admin
 * cookie is scoped to `/admin`, so plain same-origin fetches carry it.
 */
import type {
  OperatorPostBatchCreateResponse,
  OperatorPostBatchDetail,
  OperatorPostBatchItemInput,
  OperatorPostCancelResponse,
  OperatorPostConvertResponse,
  OperatorPostImageUploadResponse,
} from '@/server/operator-posts/types'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

const BASE = '/admin/posts/api'

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { ...init, credentials: 'same-origin', cache: 'no-store' })
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const code = body && typeof body === 'object' ? (body as { error?: unknown }).error : null
    return { ok: false, status: response.status, error: typeof code === 'string' ? code : `http_${response.status}` }
  }
  return { ok: true, data: body as T }
}

function postJson<T>(path: string, payload: unknown): Promise<ApiResult<T>> {
  return call<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function convertText(operatorUserId: string, text: string) {
  return postJson<OperatorPostConvertResponse>('/convert', { operatorUserId, text })
}

export function uploadOperatorImage(operatorUserId: string, file: File) {
  const form = new FormData()
  form.set('operatorUserId', operatorUserId)
  form.set('file', file)
  return call<OperatorPostImageUploadResponse>('/images', { method: 'POST', body: form })
}

export function createBatch(items: OperatorPostBatchItemInput[]) {
  return postJson<OperatorPostBatchCreateResponse>('/batches', { items })
}

export function fetchBatch(batchId: string) {
  return call<OperatorPostBatchDetail>(`/batches/${encodeURIComponent(batchId)}`)
}

export function cancelJobs(batchId: string, target: { jobIds: string[] } | { all: true }) {
  return postJson<OperatorPostCancelResponse>(`/batches/${encodeURIComponent(batchId)}`, {
    action: 'cancel',
    ...target,
  })
}

/** The admin-only preview of a queued post's photo. */
export function operatorImageUrl(imageObjectKey: string): string {
  return `${BASE}/images?key=${encodeURIComponent(imageObjectKey)}`
}

/** Run at most `concurrency` tasks at once; the rest wait in order. */
export function createLimiter(concurrency: number) {
  let active = 0
  const queue: Array<() => void> = []
  const next = () => {
    if (active >= concurrency) return
    const start = queue.shift()
    if (!start) return
    active += 1
    start()
  }
  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            next()
          })
      })
      next()
    })
  }
}
