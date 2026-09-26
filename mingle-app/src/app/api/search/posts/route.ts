import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visiblePostWhere } from '@/server/posts/post-visibility'
import { reactionScore } from '@/server/feed/feed-ranking'
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

  // Candidate posts: visible AND (source text matches OR a ready current-version
  // translation matches). One row per post via the relation filter.
  const candidates = await prisma.post.findMany({
    where: {
      ...visiblePostWhere(viewerId),
      OR: [
        { sourceText: { contains: q, mode: 'insensitive' } },
        {
          translations: {
            some: { status: 'ready', text: { contains: q, mode: 'insensitive' } },
          },
        },
      ],
    },
    select: { ...feedPostRowSelect, bodyVersion: true },
  })

  if (candidates.length === 0) return json({ posts: [], nextCursor: null })

  // Ensure a matching translation belongs to the CURRENT body version; a match
  // only on a stale-version translation without a source-text match is dropped.
  const loweredQ = q.toLowerCase()
  const candidateIds = candidates.map((c) => c.id)
  const currentVersionById = new Map(candidates.map((c) => [c.id, c.bodyVersion]))
  const readyRows = await prisma.postTranslation.findMany({
    where: { postId: { in: candidateIds }, status: 'ready' },
    select: { postId: true, bodyVersion: true, text: true },
  })
  const currentTranslationMatch = new Set<string>()
  for (const row of readyRows) {
    if (currentVersionById.get(row.postId) !== row.bodyVersion) continue
    if (row.text && row.text.toLowerCase().includes(loweredQ)) currentTranslationMatch.add(row.postId)
  }
  const matched = candidates.filter(
    (c) => (c.sourceText?.toLowerCase().includes(loweredQ) ?? false) || currentTranslationMatch.has(c.id),
  )

  if (matched.length === 0) return json({ posts: [], nextCursor: null })

  // Reaction score: likes + unique non-author commenters ×2.
  const matchedIds = matched.map((c) => c.id)
  const comments = await prisma.postComment.findMany({
    where: { postId: { in: matchedIds }, OR: [{ isDeleted: null }, { isDeleted: false }] },
    select: { postId: true, authorId: true },
  })
  const authorById = new Map(matched.map((c) => [c.id, c.authorId]))
  const commenterMap = new Map<string, Set<string>>()
  for (const c of comments) {
    if (c.authorId === authorById.get(c.postId)) continue
    let set = commenterMap.get(c.postId)
    if (!set) commenterMap.set(c.postId, (set = new Set()))
    set.add(c.authorId)
  }

  const sorted = [...matched].sort((a, b) => {
    const scoreA = reactionScore(a.likeCount, commenterMap.get(a.id) ?? new Set())
    const scoreB = reactionScore(b.likeCount, commenterMap.get(b.id) ?? new Set())
    if (scoreA !== scoreB) return scoreB - scoreA
    // Tie-break: newest first, then id for determinism.
    const t = b.publishedAt.getTime() - a.publishedAt.getTime()
    return t !== 0 ? t : (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  })

  const pageRows = sorted.slice(offset, offset + limit)
  const posts = await serializePostsPage(pageRows, { viewerId, rawDisplayLanguage: displayLanguage })
  const nextCursor = offset + limit < sorted.length ? encodeOffset(offset + limit) : null

  return json({ posts, nextCursor })
}
