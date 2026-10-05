import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleAuthorWhere } from '@/server/posts/block-visibility'
import { feedPostRowSelect, serializePostsPage } from '@/server/feed/feed-post-loader'
import {
  decodeTimeCursor,
  encodeTimeCursor,
  parseListLimit,
  timeCursorWhere,
} from '@/server/feed/post-list-cursor'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

/**
 * The viewer's hidden posts, for un-hiding. Shows posts the viewer explicitly
 * hid that are STILL otherwise viewable — public, not deleted, not
 * moderation-hidden, author not operator-hidden or blocked. A post that became
 * invisible for one of those reasons drops off the list. Returns
 * FeedPostListResponse. Signed-in only.
 *
 * We cannot use `visiblePostWhere` here because it excludes hidden posts by
 * definition; instead we require the PostHide row and re-apply the remaining
 * visibility rules directly.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const limit = parseListLimit(searchParams.get('limit'))
  const cursor = decodeTimeCursor(searchParams.get('cursor'))
  const displayLanguage = searchParams.get('displayLanguage') || null

  const rows = await prisma.post.findMany({
    where: {
      visibility: 'public',
      OR: [{ isDeleted: null }, { isDeleted: false }],
      moderationHiddenAt: null,
      author: visibleAuthorWhere(userId),
      hides: { some: { userId } },
      ...timeCursorWhere(cursor),
    },
    // Image size columns ride along (the shared select predates them).
    select: { ...feedPostRowSelect, imageWidth: true, imageHeight: true },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const posts = await serializePostsPage(pageRows, { viewerId: userId, rawDisplayLanguage: displayLanguage })

  const last = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && last
    ? encodeTimeCursor({ publishedAt: last.publishedAt.toISOString(), id: last.id })
    : null

  return json({ posts, nextCursor })
}
