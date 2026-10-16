import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/server/admin/guard'
import { getPostImage } from '@/server/posts/post-image-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /admin/api/posts/[postId]/comments/[commentId]/image — a comment's photo for staff. */
export async function GET(_request: Request, context: { params: Promise<{ postId: string; commentId: string }> }) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const { postId, commentId } = await context.params
  const comment = await prisma.postComment.findFirst({ where: { id: commentId, postId }, select: { imageObjectKey: true } })
  if (!comment?.imageObjectKey) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    const bytes = await getPostImage(comment.imageObjectKey)
    return new NextResponse(Buffer.from(bytes), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=300' } })
  } catch {
    return NextResponse.json({ error: 'image_unavailable' }, { status: 502 })
  }
}
