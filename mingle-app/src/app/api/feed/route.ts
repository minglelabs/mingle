import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { getFeed } from '@/server/feed/feed-service'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const cursor = searchParams.get('cursor') || null
  const rawLimit = searchParams.get('limit')
  const limit = rawLimit ? parseInt(rawLimit, 10) : null

  if (rawLimit !== null && (isNaN(limit!) || limit! < 1)) {
    return json({ error: 'invalid_limit' }, { status: 400 })
  }

  const result = await getFeed(userId, cursor, limit)

  return json({
    posts: result.posts,
    nextCursor: result.nextCursor,
  })
}
