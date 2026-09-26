import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { markPostViewed } from '@/server/feed/post-view'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { postId } = await params
  if (!postId || typeof postId !== 'string') {
    return json({ error: 'invalid_post_id' }, { status: 400 })
  }

  // Verify the post exists and is visible to the viewer
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, userId),
    select: { id: true },
  })

  if (!post) {
    return json({ error: 'post_not_found' }, { status: 404 })
  }

  // Idempotent: keeps the first-view time so a feed snapshot stays stable.
  await markPostViewed(userId, postId)

  return json({ ok: true })
}
