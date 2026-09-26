import { type NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSingleCommentWhere } from '@/server/posts/comment-visibility'
import { createPostNotification } from '@/server/notifications/create-post-notification'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type Ctx = { params: Promise<{ commentId: string }> }

/** Like a comment. Unique constraint prevents double-counting. */
export async function POST(_request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { commentId } = await context.params

  // Verify comment is visible (not blocked)
  const comment = await prisma.postComment.findFirst({
    where: {
      ...visibleSingleCommentWhere(commentId, userId),
      OR: [{ isDeleted: null }, { isDeleted: false }],
    },
    select: { id: true, authorId: true, postId: true },
  })
  if (!comment) return json({ error: 'not_found' }, { status: 404 })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.postCommentLike.create({
        data: { commentId, userId },
      })
      await tx.postComment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
      })
    })
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return json({ liked: true, duplicate: true })
    }
    throw err
  }

  // Notify the comment author (in-app only; likes never push). Fire-and-forget.
  after(async () => {
    await createPostNotification({
      type: 'comment_like',
      recipientId: comment.authorId,
      actorId: userId,
      postId: comment.postId,
      commentId,
    })
  })

  return json({ liked: true }, { status: 201 })
}

/** Unlike a comment. */
export async function DELETE(_request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { commentId } = await context.params

  const existing = await prisma.postCommentLike.findUnique({
    where: { commentId_userId: { commentId, userId } },
  })
  if (!existing) return json({ liked: false })

  await prisma.$transaction(async (tx) => {
    await tx.postCommentLike.delete({
      where: { id: existing.id },
    })
    await tx.postComment.update({
      where: { id: commentId },
      data: { likeCount: { decrement: 1 } },
    })
  })

  return json({ liked: false })
}
