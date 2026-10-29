import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/server/admin/guard'
import { getPostImage } from '@/server/posts/post-image-storage'
import { OPERATOR_POST_PHOTO_MAX_BYTES, replaceOperatorPostPhoto } from '@/server/operator-post-edit/edit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /admin/api/posts/[postId]/image — a post's photo for staff. Unlike the
 * app route it ignores who may see the post, so staff also see photos on
 * hidden, deleted or blocked posts.
 */
export async function GET(_request: Request, context: { params: Promise<{ postId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { postId } = await context.params
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { imageObjectKey: true } })
  if (!post?.imageObjectKey) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    const bytes = await getPostImage(post.imageObjectKey)
    return new NextResponse(Buffer.from(bytes), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=300' } })
  } catch {
    return NextResponse.json({ error: 'image_unavailable' }, { status: 502 })
  }
}

/**
 * POST /admin/api/posts/[postId]/image — multipart `file` (jpeg / png / webp)
 * replaces an operator post's photo. Real users' posts are refused.
 */
export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { postId } = await context.params
  if (Number(request.headers.get('content-length')) > OPERATOR_POST_PHOTO_MAX_BYTES + 65_536) {
    return NextResponse.json({ error: 'image_too_large' }, { status: 413, headers: { 'cache-control': 'no-store' } })
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400, headers: { 'cache-control': 'no-store' } })
  }
  const result = await replaceOperatorPostPhoto(auth.ctx, postId, form.get('file'))
  return NextResponse.json(result.ok ? { ok: true } : { error: result.error }, { status: result.ok ? 200 : result.status, headers: { 'cache-control': 'no-store' } })
}
