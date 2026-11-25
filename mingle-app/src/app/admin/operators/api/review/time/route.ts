import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { setReviewPostPublishAt } from '@/server/operator-review/review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERROR_STATUS: Record<string, number> = { not_found: 404, invalid_time: 400 }

/**
 * PUT /admin/operators/api/review/time — `{ id, publishAt }`: the time a post
 * in review is dated at when published (ISO, not in the future), or null for
 * a random time between writing and 게시.
 */
export async function PUT(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { id?: unknown; publishAt?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[\w-]{1,64}$/.test(id) || body?.publishAt === undefined) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const result = await setReviewPostPublishAt(auth.ctx, id, body.publishAt)
  return NextResponse.json(result.ok ? { post: result.post } : { error: result.error }, {
    status: result.ok ? 200 : ERROR_STATUS[result.error] ?? 500,
    headers: { 'Cache-Control': 'no-store' },
  })
}
