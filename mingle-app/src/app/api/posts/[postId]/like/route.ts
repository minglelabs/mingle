import { type NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'
import { createPostNotification } from '@/server/notifications/create-post-notification'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type Ctx = { params: Promise<{ postId: string }> }

/** Toggle like ON — unique constraint prevents duplicate counting. */
export async function POST(_request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted

  const limited = rateLimitGuard('like_post', userId)
  if (limited) return limited

  const { postId } = await context.params

  // Verify post is visible
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, userId),
    select: { id: true, authorId: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.postLike.create({
        data: { postId, userId },
      })
      await tx.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      })
    })
  } catch (err: unknown) {
    // Unique constraint violation → already liked, idempotent success
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

  // Notify the post author (in-app only; likes never push). Fire-and-forget so
  // the like response is not delayed. Runs only on a newly created like.
  after(async () => {
    await createPostNotification({
      type: 'post_like',
      recipientId: post.authorId,
      actorId: userId,
      postId,
    })
  })

  return json({ liked: true }, { status: 201 })
}

/** Toggle like OFF. */
export async function DELETE(_request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { postId } = await context.params

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId } },
  })
  if (!existing) return json({ liked: false })

  await prisma.$transaction(async (tx) => {
    await tx.postLike.delete({
      where: { id: existing.id },
    })
    await tx.post.update({
      where: { id: postId },
      data: { likeCount: { decrement: 1 } },
    })
  })

  return json({ liked: false })
}
