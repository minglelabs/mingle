import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visiblePostWhere } from '@/server/posts/post-visibility'
import { buildPostSearchSql, type PostSearchRow } from './post-search-query'
import { feedPostRowSelect, serializePostsPage } from '@/server/feed/feed-post-loader'
import { parseListLimit } from '@/server/feed/post-list-cursor'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

/** Decode an opaque numeric offset cursor; anything invalid restarts at 0. */
function decodeOffset(raw: string | null): number {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'))
    return typeof parsed?.offset === 'number' && parsed.offset >= 0 ? Math.floor(parsed.offset) : 0
  } catch {
    return 0
  }
}

function encodeOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url')
}

/**
 * Post search. Matches the source text OR an already-generated (ready,
 * current body version) translation, case-insensitively, one row per post.
 * Sorted by reaction score (likes ×1 + unique non-author commenters ×2)
 * descending, newest-first only as a tie-break. No unseen/follow priority, no
 * new translation is generated. Visibility rules apply. `q` matches from one
 * character; a blank `q` yields an empty list. Returns FeedPostListResponse.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() || null : null

  const { searchParams } = request.nextUrl
  const q = (searchParams.get('q') ?? '').trim()
  const limit = parseListLimit(searchParams.get('limit'))
  const offset = decodeOffset(searchParams.get('cursor'))
  const displayLanguage = searchParams.get('displayLanguage') || null

  if (q.length < 1) return json({ posts: [], nextCursor: null })

  // Filter + reaction-score order + paging run in SQL: one page of ids per
  // request instead of every match (and every match's comments) in memory.
  const rankedRows = await prisma.$queryRaw<PostSearchRow[]>(
    buildPostSearchSql({ viewerId, query: q, offset, take: limit + 1 }),
  )
  if (rankedRows.length === 0) return json({ posts: [], nextCursor: null })

  const hasMore = rankedRows.length > limit
  const pageIds = rankedRows.slice(0, limit).map((row) => row.id)

  // Re-apply the shared visibility seam to the page rows (authoritative), and
  // load the row shape the serializer needs. SQL order is kept.
  const rows = await prisma.post.findMany({
    where: { id: { in: pageIds }, ...visiblePostWhere(viewerId) },
    select: feedPostRowSelect,
  })
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const pageRows = pageIds
    .map((id) => rowById.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  const posts = await serializePostsPage(pageRows, { viewerId, rawDisplayLanguage: displayLanguage })
  const nextCursor = hasMore ? encodeOffset(offset + limit) : null

  return json({ posts, nextCursor })
}
