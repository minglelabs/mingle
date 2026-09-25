import { type NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere, ownPostWhere } from '@/server/posts/post-visibility'
import { randomBackgroundKey } from '@/lib/post-backgrounds'
import { retranslatePostOnEdit } from '@/server/translation/post-translation-service'
import { prismaTranslationDeps } from '@/server/posts/post-translation-repository'

export const runtime = 'nodejs'

const MAX_BODY_LENGTH = 1000

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!viewerId) return json({ error: 'unauthorized' }, { status: 401 })

  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, viewerId),
    include: {
      author: { select: { id: true, handle: true, name: true, image: true } },
      translations: {
        where: { status: 'ready' },
        select: { language: true, bodyVersion: true, text: true },
      },
    },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  // Resolve display language
  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { defaultDisplayLanguage: true },
  })
  const displayLang = viewer?.defaultDisplayLanguage
  const translation = displayLang
    ? post.translations.find((t) => t.language === displayLang && t.bodyVersion === post.bodyVersion)
    : null

  return json({
    id: post.id,
    author: post.author,
    sourceText: post.sourceText,
    sourceLanguage: post.sourceLanguage,
    displayText: translation?.text ?? post.sourceText,
    displayLanguage: translation ? displayLang : post.sourceLanguage,
    backgroundKey: post.backgroundKey,
    imageObjectKey: post.imageObjectKey,
    visibility: post.visibility,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    publishedAt: post.publishedAt,
    bodyVersion: post.bodyVersion,
    translations: post.translations.filter((t) => t.bodyVersion === post.bodyVersion),
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const input = body as Record<string, unknown>

  const existing = await prisma.post.findFirst({
    where: ownPostWhere(postId, userId),
  })
  if (!existing) return json({ error: 'not_found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  let needsRetranslation = false

  // Source text update
  if ('sourceText' in input) {
    const newText = typeof input.sourceText === 'string' ? input.sourceText : null
    if (newText !== null && newText.length > MAX_BODY_LENGTH) return json({ error: 'text_too_long' }, { status: 400 })
    if (newText !== null && newText.trim().length === 0 && !existing.imageObjectKey) {
      return json({ error: 'text_or_image_required' }, { status: 400 })
    }
    data.sourceText = newText
    data.bodyVersion = existing.bodyVersion + 1
    needsRetranslation = true
  }

  if ('sourceLanguage' in input && typeof input.sourceLanguage === 'string') {
    data.sourceLanguage = input.sourceLanguage.trim() || null
  }

  // Image update
  if ('imageObjectKey' in input) {
    data.imageObjectKey = typeof input.imageObjectKey === 'string' && input.imageObjectKey ? input.imageObjectKey : null
  }

  // Background: only re-randomise when explicitly requested
  if (input.changeBackground === true) {
    data.backgroundKey = randomBackgroundKey()
  }

  if (Object.keys(data).length === 0) return json({ error: 'no_changes' }, { status: 400 })

  const updated = await prisma.post.update({
    where: { id: postId },
    data,
  })

  // Fire-and-forget re-translation on body change
  if (needsRetranslation && updated.sourceText && updated.sourceLanguage) {
    const sourceText = updated.sourceText
    const sourceLanguage = updated.sourceLanguage
    const newBodyVersion = updated.bodyVersion
    after(async () => {
      try {
        await retranslatePostOnEdit(prismaTranslationDeps, {
          postId,
          newBodyVersion,
          sourceText,
          sourceLanguage,
        })
      } catch (err) {
        console.error('[post-patch] retranslation failed', err instanceof Error ? err.message : 'unknown')
      }
    })
  }

  return json({
    id: updated.id,
    bodyVersion: updated.bodyVersion,
    backgroundKey: updated.backgroundKey,
    updatedAt: updated.updatedAt,
  })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const existing = await prisma.post.findFirst({
    where: ownPostWhere(postId, userId),
  })
  if (!existing) return json({ error: 'not_found' }, { status: 404 })

  await prisma.post.update({
    where: { id: postId },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return json({ deleted: true })
}
