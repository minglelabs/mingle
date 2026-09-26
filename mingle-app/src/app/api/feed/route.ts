import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { getFeed } from '@/server/feed/feed-service'
import { serializePostsPage } from '@/server/feed/feed-post-loader'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

/**
 * Home feed. Public: a signed-out reader gets the same time-tier -> reaction
 * ranking without follow priority or seen/unseen phasing (they have neither),
 * and every visibility rule still applies. Returns FeedPostListResponse.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() || null : null

  const { searchParams } = request.nextUrl
  const cursor = searchParams.get('cursor') || null
  const rawLimit = searchParams.get('limit')
  const limit = rawLimit ? parseInt(rawLimit, 10) : null
  const displayLanguage = searchParams.get('displayLanguage') || null

  if (rawLimit !== null && (isNaN(limit!) || limit! < 1)) {
    return json({ error: 'invalid_limit' }, { status: 400 })
  }

  const result = await getFeed(viewerId, cursor, limit)
  const posts = await serializePostsPage(result.posts, { viewerId, rawDisplayLanguage: displayLanguage })

  return json({ posts, nextCursor: result.nextCursor })
}
