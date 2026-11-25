import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import type { AvatarReference } from '@/server/operator-avatars/generate'
import { OPERATOR_POST_PHOTO_MAX_BYTES } from '@/server/operator-post-edit/edit'
import { parseImageEngine } from '@/server/seedream/client'
import {
  getReviewPost,
  getReviewProfileState,
  reviewPostReference,
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
  no_reference: 409,
  seedream_unconfigured: 503,
  invalid_image: 400,
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** The JSON body, or a form (`image` = a photo staff attached to the feedback). */
async function readBody(request: Request): Promise<{ body: Record<string, unknown> | null; reference?: AvatarReference; invalidImage?: boolean }> {
  if (!(request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    return { body: await request.json().catch(() => null) as Record<string, unknown> | null }
  }
  const form = await request.formData().catch(() => null)
  if (!form) return { body: null }
  const body = { kind: form.get('kind'), id: form.get('id'), action: form.get('action'), feedback: form.get('feedback'), engine: form.get('engine') }
  const file = form.get('image')
  if (!(file instanceof File) || file.size === 0) return { body }
  if (!IMAGE_TYPES.includes(file.type) || file.size > OPERATOR_POST_PHOTO_MAX_BYTES) return { body, invalidImage: true }
  return { body, reference: { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type } }
}

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/review — one staff answer for a profile or a post
 * waiting for review: `{ kind: 'profile' | 'post', id, action: 'publish' |
 * 'delete' | 'regenerate', feedback? }`. 재제작 waits for the new photo or post.
 * As a form it may carry `image`, a photo attached to the feedback that the
 * new drawing uses as a reference (where this server draws).
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
    return post ? json({ post, reference: await reviewPostReference(post.imageObjectKey) }) : json({ error: 'not_found' }, 404)
  }
  const profile = await getReviewProfileState(id)
  return profile ? json(profile) : json({ error: 'not_found' }, 404)
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { body, reference, invalidImage } = await readBody(request)
  if (invalidImage) return json({ error: 'invalid_image' }, 400)
  const kind = body?.kind
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const action = parseReviewAction(body?.action)
  if ((kind !== 'profile' && kind !== 'post') || !id || !action) return json({ error: 'invalid_request' }, 400)
  const feedback = normalizeReviewFeedback(body?.feedback)

  const result = kind === 'profile'
    ? await reviewOperatorProfile(auth.ctx, id, action, feedback, { reference, engine: parseImageEngine(body?.engine) })
    : await reviewOperatorPost(auth.ctx, id, action, feedback, new Date(), { reference, engine: parseImageEngine(body?.engine) })
  if (!result.ok) return json({ error: result.error, ...('detail' in result && result.detail ? { detail: result.detail } : {}) }, ERROR_STATUS[result.error] ?? 500)
  return json(result)
}
