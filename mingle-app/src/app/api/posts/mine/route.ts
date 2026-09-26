import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { feedPostRowSelect, serializePostsPage } from '@/server/feed/feed-post-loader'
import {
  decodeTimeCursor,
  encodeTimeCursor,
  parseListLimit,
  timeCursorWhere,
} from '@/server/feed/post-list-cursor'

export const runtime = 'nodejs'

const TRASH_RETENTION_DAYS = 30
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

/**
 * The author's own archive and trash. Signed-in only.
 * - `section=archived`: archived-and-not-deleted posts, newest first.
 * - `section=trash`: posts deleted within the last 30 days, newest-deleted
 *   first, each carrying `deletedAt`. Posts deleted longer ago drop out of the
 *   list but remain in the database.
 * Returns FeedPostListResponse.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const section = searchParams.get('section')
  const limit = parseListLimit(searchParams.get('limit'))
  const cursor = decodeTimeCursor(searchParams.get('cursor'))
  const displayLanguage = searchParams.get('displayLanguage') || null

  if (section !== 'archived' && section !== 'trash') {
    return json({ error: 'invalid_section' }, { status: 400 })
  }

  const isTrash = section === 'trash'
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS)

  const where = isTrash
    ? {
        authorId: userId,
        isDeleted: true,
        deletedAt: { gte: cutoff },
        ...timeCursorWhere(cursor),
      }
    : {
        authorId: userId,
        visibility: 'archived',
        OR: [{ isDeleted: null }, { isDeleted: false }],
        ...timeCursorWhere(cursor),
      }

  const rows = await prisma.post.findMany({
    where,
    select: feedPostRowSelect,
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const posts = await serializePostsPage(pageRows, {
    viewerId: userId,
    rawDisplayLanguage: displayLanguage,
    includeDeletedAt: isTrash,
  })

  const last = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && last
    ? encodeTimeCursor({ publishedAt: last.publishedAt.toISOString(), id: last.id })
    : null

  return json({ posts, nextCursor })
}
