import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/server/admin/guard'
import { getPostImage } from '@/server/posts/post-image-storage'

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
