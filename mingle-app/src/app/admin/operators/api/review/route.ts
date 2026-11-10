import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import {
  getReviewPost,
  getReviewProfileState,
  normalizeReviewFeedback,
  parseReviewAction,
  reviewOperatorPost,
  reviewOperatorProfile,
} from '@/server/operator-review/review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

const ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  already_approved: 409,
  busy: 409,
  profile_pending: 409,
  publish_failed: 502,
  regenerate_failed: 502,
  draw_failed: 502,
}

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/review — one staff answer for a profile or a post
 * waiting for review: `{ kind: 'profile' | 'post', id, action: 'publish' |
 * 'delete' | 'regenerate', feedback? }`. 재제작 waits for the new photo or post.
 */
/**
 * GET /admin/operators/api/review?kind=post|profile&id=… — the item as its
 * card shows it, for the card to poll while the pool draws its photo.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const params = new URL(request.url).searchParams
  const kind = params.get('kind')
  const id = params.get('id')?.trim() ?? ''
  if ((kind !== 'profile' && kind !== 'post') || !id) return json({ error: 'invalid_request' }, 400)
  if (kind === 'post') {
    const post = await getReviewPost(id)
    return post ? json({ post }) : json({ error: 'not_found' }, 404)
  }
  const profile = await getReviewProfileState(id)
  return profile ? json(profile) : json({ error: 'not_found' }, 404)
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const kind = body?.kind
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const action = parseReviewAction(body?.action)
  if ((kind !== 'profile' && kind !== 'post') || !id || !action) return json({ error: 'invalid_request' }, 400)
  const feedback = normalizeReviewFeedback(body?.feedback)

  const result = kind === 'profile'
    ? await reviewOperatorProfile(auth.ctx, id, action, feedback)
    : await reviewOperatorPost(auth.ctx, id, action, feedback)
  if (!result.ok) return json({ error: result.error }, ERROR_STATUS[result.error] ?? 500)
  return json(result)
}
