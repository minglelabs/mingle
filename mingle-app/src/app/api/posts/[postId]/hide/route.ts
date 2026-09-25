import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

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

  // Verify post exists
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  await prisma.postHide.upsert({
    where: { postId_userId: { postId, userId } },
    create: { postId, userId },
    update: {},
  })

  return json({ hidden: true }, { status: 201 })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  try {
    await prisma.postHide.delete({
      where: { postId_userId: { postId, userId } },
    })
  } catch {
    // Already not hidden — idempotent
  }

  return json({ hidden: false })
}
