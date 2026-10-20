import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { ownPostWhere } from '@/server/posts/post-visibility'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

export async function POST(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const post = await prisma.post.findFirst({ where: ownPostWhere(postId, userId) })
  if (!post) return json({ error: 'not_found' }, { status: 404 })
  if (post.visibility === 'archived') return json({ error: 'already_archived' }, { status: 409 })

  await prisma.post.update({
    where: { id: postId },
    data: { visibility: 'archived', archivedAt: new Date() },
  })

  return json({ archived: true })
}
