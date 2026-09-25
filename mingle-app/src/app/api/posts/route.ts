import { type NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { randomBackgroundKey } from '@/lib/post-backgrounds'
import { translatePostOnPublish } from '@/server/translation/post-translation-service'
import { prismaTranslationDeps } from '@/server/posts/post-translation-repository'

export const runtime = 'nodejs'

const MAX_BODY_LENGTH = 1000

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const { sourceText, sourceLanguage, clientPostId, imageObjectKey } = body as Record<string, unknown>

  // Validate sourceText
  const text = typeof sourceText === 'string' ? sourceText : null
  const hasText = text !== null && text.trim().length > 0
  const hasImage = typeof imageObjectKey === 'string' && imageObjectKey.length > 0

  if (!hasText && !hasImage) return json({ error: 'text_or_image_required' }, { status: 400 })
  if (text !== null && text.length > MAX_BODY_LENGTH) return json({ error: 'text_too_long' }, { status: 400 })

  const lang = typeof sourceLanguage === 'string' && sourceLanguage.trim() ? sourceLanguage.trim() : null

  // Idempotency via clientPostId
  if (typeof clientPostId === 'string' && clientPostId.trim()) {
    const existing = await prisma.post.findFirst({
      where: { authorId: userId, id: clientPostId },
      select: { id: true },
    })
    if (existing) {
      return json({ postId: existing.id, duplicate: true }, { status: 200 })
    }
  }

  const backgroundKey = randomBackgroundKey()
  const postId = typeof clientPostId === 'string' && /^[\w-]{12,128}$/.test(clientPostId) ? clientPostId : undefined

  const post = await prisma.post.create({
    data: {
      ...(postId ? { id: postId } : {}),
      authorId: userId,
      sourceText: text,
      sourceLanguage: lang,
      backgroundKey,
      imageObjectKey: hasImage ? (imageObjectKey as string) : null,
      visibility: 'public',
      bodyVersion: 1,
    },
  })

  // Fire-and-forget translation — do not block the response
  if (hasText && lang) {
    after(async () => {
      try {
        await translatePostOnPublish(prismaTranslationDeps, {
          postId: post.id,
          bodyVersion: 1,
          sourceText: text!,
          sourceLanguage: lang,
        })
      } catch (err) {
        console.error('[post-create] translation failed', err instanceof Error ? err.message : 'unknown')
      }
    })
  }

  return json({
    postId: post.id,
    backgroundKey: post.backgroundKey,
    publishedAt: post.publishedAt,
  }, { status: 201 })
}
