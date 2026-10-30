import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { editOperatorPostText, setOperatorPostHidden } from '@/server/operator-post-edit/edit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /admin/api/posts/[postId] — `{ text }` replaces an operator post's
 * text; `{ hidden }` takes it down or puts it back up. Real users' posts are refused.
 */
export async function PATCH(request: Request, context: { params: Promise<{ postId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { postId } = await context.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const fields = body && typeof body === 'object' ? body as { text?: unknown; hidden?: unknown } : {}
  const result = typeof fields.hidden === 'boolean'
    ? await setOperatorPostHidden(auth.ctx, postId, fields.hidden)
    : await editOperatorPostText(auth.ctx, postId, fields.text)
  return NextResponse.json(result.ok ? { ok: true } : { error: result.error }, { status: result.ok ? 200 : result.status, headers: { 'cache-control': 'no-store' } })
}
