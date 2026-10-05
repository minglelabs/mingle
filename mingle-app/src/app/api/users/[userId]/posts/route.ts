import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visiblePostWhere } from '@/server/posts/post-visibility'
import { feedPostRowSelect, serializePostsPage } from '@/server/feed/feed-post-loader'
import {
  decodeTimeCursor,
  encodeTimeCursor,
  parseListLimit,
  timeCursorWhere,
} from '@/server/feed/post-list-cursor'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ userId: string }> }

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

/**
 * An author's public posts, newest first (grid order), cursor-paginated.
 * Applies the shared visibility rules (archived / deleted / moderation-hidden /
 * mutual block / viewer-hidden excluded) via `visiblePostWhere`. A signed-out
 * reader may browse; the author's own profile still shows only public posts.
 * Returns FeedPostListResponse.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { userId: rawUserId } = await context.params
  const authorId = rawUserId.trim()
  if (!authorId) return json({ error: 'invalid_user_id' }, { status: 400 })

  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() || null : null

  const { searchParams } = request.nextUrl
  const limit = parseListLimit(searchParams.get('limit'))
  const cursor = decodeTimeCursor(searchParams.get('cursor'))
  const displayLanguage = searchParams.get('displayLanguage') || null

  const rows = await prisma.post.findMany({
    where: {
      ...visiblePostWhere(viewerId),
      authorId,
      ...timeCursorWhere(cursor),
    },
    select: feedPostRowSelect,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const posts = await serializePostsPage(pageRows, { viewerId, rawDisplayLanguage: displayLanguage })

  const last = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && last
    ? encodeTimeCursor({ publishedAt: last.publishedAt.toISOString(), id: last.id })
    : null

  return json({ posts, nextCursor })
}
