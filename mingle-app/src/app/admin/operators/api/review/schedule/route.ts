import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { scheduleReviewPost, unscheduleReviewPost, type ScheduleResult } from '@/server/operator-review/review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERROR_STATUS: Record<string, number> = { not_found: 404, busy: 409, profile_pending: 409, photo_pending: 409, invalid_time: 400 }

function reply(result: ScheduleResult): NextResponse {
  return NextResponse.json(result.ok ? { post: result.post } : { error: result.error }, {
    status: result.ok ? 200 : ERROR_STATUS[result.error] ?? 500,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function readId(request: Request): Promise<{ id: string; at?: unknown } | null> {
  const body = await request.json().catch(() => null) as { id?: unknown; at?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  return /^[\w-]{1,64}$/.test(id) ? { id, at: body?.at } : null
}

/**
 * PUT /admin/operators/api/review/schedule — `{ id, at? }`: 예약 게시 of a post
 * in review, or a new time for a scheduled one. `at` is an ISO time ahead of
 * now; without it the server picks one 2-30 hours ahead.
 */
export async function PUT(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await readId(request)
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const at = typeof body.at === 'string' ? new Date(body.at) : body.at == null ? null : new Date(Number.NaN)
  return reply(await scheduleReviewPost(auth.ctx, body.id, at))
}

/** DELETE /admin/operators/api/review/schedule — `{ id }`: 예약 취소, back to review. */
export async function DELETE(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await readId(request)
  if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  return reply(await unscheduleReviewPost(auth.ctx, body.id))
}
