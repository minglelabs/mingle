import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

/**
 * Restore a post the author put away:
 * - from the archive → back to public, or
 * - from the trash (soft-deleted, within the 30-day window) → back to public.
 *
 * Either way the row is only flipped back; likeCount, commentCount and the
 * original publishedAt are never touched, so restoring keeps the post's
 * history intact. Once the 30-day window has passed a trashed post is treated
 * as gone and cannot be restored.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted

  const post = await prisma.post.findFirst({
    where: { id: postId, authorId: userId },
    select: { id: true, visibility: true, isDeleted: true, deletedAt: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  const isTrashed = post.isDeleted === true

  if (isTrashed) {
    // Enforce the 30-day restore window.
    const deletedAtMs = post.deletedAt ? new Date(post.deletedAt).getTime() : null
    if (deletedAtMs !== null) {
      const windowMs = 30 * 24 * 60 * 60 * 1000
      if (Date.now() - deletedAtMs > windowMs) {
        return json({ error: 'restore_window_expired' }, { status: 409 })
      }
    }

    await prisma.post.update({
      where: { id: postId },
      data: { isDeleted: false, deletedAt: null, visibility: 'public' },
    })
    return json({ restored: true })
  }

  if (post.visibility !== 'archived') return json({ error: 'not_restorable' }, { status: 409 })

  await prisma.post.update({
    where: { id: postId },
    data: { visibility: 'public', archivedAt: null },
  })

  return json({ restored: true })
}
