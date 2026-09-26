import { buildClientApiPath } from '@/lib/api-contract'
import type { CommentListResponse } from './comment-types'

/**
 * Fetch layer for the comment sheet. Every call returns a discriminated result
 * so the hook can branch on `rate_limited` (429) without a thrown-error dance.
 * Network / unexpected failures collapse to `{ ok: false, error: 'network' }`.
 */

export type RateLimited = { ok: false; error: 'rate_limited'; retryAfterSeconds: number }
export type Failure = { ok: false; error: string; retryAfterSeconds?: number }
export type ApiResult<T> = ({ ok: true } & T) | RateLimited | Failure

/** Narrow a failed result to a rate-limit (429). */
export function isRateLimited(res: { ok: false; error: string; retryAfterSeconds?: number }): res is RateLimited {
  return res.error === 'rate_limited'
}

async function parseError(res: Response): Promise<Failure | RateLimited> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* empty body */
  }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const error = typeof record.error === 'string' ? record.error : `http_${res.status}`
  if (res.status === 429) {
    const retry = typeof record.retryAfterSeconds === 'number' ? record.retryAfterSeconds : 30
    return { ok: false, error: 'rate_limited', retryAfterSeconds: retry }
  }
  return { ok: false, error }
}

function commentsPath(postId: string): `/${string}` {
  return `/posts/${encodeURIComponent(postId)}/comments`
}
function commentPath(commentId: string): `/${string}` {
  return `/comments/${encodeURIComponent(commentId)}`
}

async function requestJson<T>(input: string, init: RequestInit): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(input, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  } catch {
    return { ok: false, error: 'network' }
  }
  if (!res.ok) return parseError(res)
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* some 204-ish responses */
  }
  return { ok: true, ...(body as object) } as ApiResult<T>
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function fetchComments(
  postId: string,
  options?: { displayLanguage?: string | null },
): Promise<ApiResult<CommentListResponse>> {
  const fallback = options?.displayLanguage?.trim()
  const query = fallback ? `?${new URLSearchParams({ displayLanguage: fallback }).toString()}` : ''
  return requestJson<CommentListResponse>(buildClientApiPath(`${commentsPath(postId)}${query}` as `/${string}`), {
    method: 'GET',
  })
}

// ─── Create ──────────────────────────────────────────────────────────────────

export type CreateCommentResult = {
  id: string
  postId: string
  parentId: string | null
  replyToUserId: string | null
  bodyVersion: number
  createdAt: string
}

export async function createComment(
  postId: string,
  args: { sourceText: string; sourceLanguage?: string | null; parentId?: string | null; replyToUserId?: string | null },
): Promise<ApiResult<CreateCommentResult>> {
  return requestJson<CreateCommentResult>(buildClientApiPath(commentsPath(postId)), {
    method: 'POST',
    body: JSON.stringify(args),
  })
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateComment(
  commentId: string,
  args: { sourceText: string; sourceLanguage?: string | null },
): Promise<ApiResult<{ id: string; bodyVersion: number; sourceText: string; updatedAt: string }>> {
  return requestJson(buildClientApiPath(commentPath(commentId)), {
    method: 'PATCH',
    body: JSON.stringify(args),
  })
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteComment(
  commentId: string,
): Promise<ApiResult<{ deleted: true; commentId: string; hadReplies: boolean }>> {
  return requestJson(buildClientApiPath(commentPath(commentId)), { method: 'DELETE' })
}

// ─── Like / Unlike ─────────────────────────────────────────────────────────

export async function likeComment(commentId: string): Promise<ApiResult<{ liked: boolean; duplicate?: boolean }>> {
  return requestJson(buildClientApiPath(`/comments/${encodeURIComponent(commentId)}/like`), { method: 'POST' })
}

export async function unlikeComment(commentId: string): Promise<ApiResult<{ liked: boolean }>> {
  return requestJson(buildClientApiPath(`/comments/${encodeURIComponent(commentId)}/like`), { method: 'DELETE' })
}

// ─── Translate ─────────────────────────────────────────────────────────────

export async function translateComment(
  commentId: string,
  language: string,
): Promise<ApiResult<{ commentId: string; bodyVersion: number; language: string; text: string | null; status: 'ready' | 'failed' }>> {
  return requestJson(buildClientApiPath(`/comments/${encodeURIComponent(commentId)}/translate`), {
    method: 'POST',
    body: JSON.stringify({ language }),
  })
}
