import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { editOperatorPostText } from '@/server/operator-post-edit/edit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PATCH /admin/api/posts/[postId] — `{ text }` replaces an operator post's text. Real users' posts are refused. */
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
  const text = body && typeof body === 'object' ? (body as { text?: unknown }).text : undefined
  const result = await editOperatorPostText(auth.ctx, postId, text)
  return NextResponse.json(result.ok ? { ok: true } : { error: result.error }, { status: result.ok ? 200 : result.status, headers: { 'cache-control': 'no-store' } })
}
