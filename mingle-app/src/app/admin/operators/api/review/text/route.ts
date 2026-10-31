import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { draftReviewPostText, setReviewPostText } from '@/server/operator-review/review'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERROR_STATUS: Record<string, number> = { not_found: 404, invalid_text: 400, busy: 409, regenerate_failed: 502 }

/**
 * POST /admin/operators/api/review/text — `{ id, feedback? }`: the AI writes a
 * new text for the post (same person, language and photo); nothing is saved.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { id?: unknown; feedback?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const result = await draftReviewPostText(id, body?.feedback)
  return NextResponse.json(result.ok ? { text: result.text } : { error: result.error }, {
    status: result.ok ? 200 : ERROR_STATUS[result.error] ?? 500,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/** PUT /admin/operators/api/review/text — `{ id, text }`: staff rewrite a post's text in review. */
export async function PUT(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { id?: unknown; text?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const result = await setReviewPostText(auth.ctx, id, body?.text)
  return NextResponse.json(result.ok ? { post: result.post } : { error: result.error }, {
    status: result.ok ? 200 : ERROR_STATUS[result.error] ?? 500,
    headers: { 'Cache-Control': 'no-store' },
  })
}
