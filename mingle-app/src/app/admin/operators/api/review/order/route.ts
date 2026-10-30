import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { setReviewPin } from '@/server/operator-review/review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /admin/operators/api/review/order — `{ kind: 'profile' | 'post', id,
 * pinned }`: moves the item to the front of the review queue, or back into
 * the default order.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const kind = body?.kind
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if ((kind !== 'profile' && kind !== 'post') || !/^[\w-]{1,64}$/.test(id) || typeof body?.pinned !== 'boolean') {
    return json({ error: 'invalid_request' }, 400)
  }
  const result = await setReviewPin(auth.ctx, kind, id, body.pinned)
  if (!result.ok) return json({ error: result.error }, 404)
  return json(result)
}
