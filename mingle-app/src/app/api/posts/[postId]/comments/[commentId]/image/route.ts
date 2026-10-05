import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { visibleCommentsWhere } from '@/server/posts/comment-visibility'
import { getPostImage } from '@/server/posts/post-image-storage'
import { isOwnedPostImageKey } from '@/server/posts/post-image-keys'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string; commentId: string }> }

/**
 * GET — a comment's photo. Readable exactly when the comment is: the post is
 * visible to the viewer (signed-out viewers follow the public rules, like the
 * comment list) and the comment passes the same visibility filter as the list.
 * A deleted comment's photo is gone with its body.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { postId, commentId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() || null : null

  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, viewerId),
    select: { id: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  const comment = await prisma.postComment.findFirst({
    where: { ...visibleCommentsWhere(postId, viewerId), id: commentId },
    select: { authorId: true, isDeleted: true, imageObjectKey: true },
  })
  // Only ever read a key issued to the comment's author, never an arbitrary
  // object (e.g. a private conversation image) in the shared bucket.
  if (
    !comment
    || comment.isDeleted === true
    || !comment.imageObjectKey
    || !isOwnedPostImageKey(comment.imageObjectKey, comment.authorId)
  ) {
    return json({ error: 'not_found' }, { status: 404 })
  }

  try {
    const bytes = await getPostImage(comment.imageObjectKey)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return json({ error: 'image_unavailable' }, { status: 503 })
  }
}
