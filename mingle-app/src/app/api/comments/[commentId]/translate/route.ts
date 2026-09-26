import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSingleCommentWhere } from '@/server/posts/comment-visibility'
import { translateCommentOnDemand } from '@/server/translation/post-translation-service'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import { prismaTranslationDeps } from '@/server/posts/post-translation-repository'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type Ctx = { params: Promise<{ commentId: string }> }

/**
 * POST — translate a comment on demand.
 * Body: { language }
 */
export async function POST(request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { commentId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const { language } = body as Record<string, unknown>
  if (typeof language !== 'string' || !language.trim()) {
    return json({ error: 'language_required' }, { status: 400 })
  }

  // Verify comment is visible
  const comment = await prisma.postComment.findFirst({
    where: {
      ...visibleSingleCommentWhere(commentId, userId),
      OR: [{ isDeleted: null }, { isDeleted: false }],
    },
    select: { id: true, bodyVersion: true, sourceText: true, sourceLanguage: true },
  })
  if (!comment) return json({ error: 'not_found' }, { status: 404 })
  if (!comment.sourceText || !comment.sourceText.trim()) {
    return json({ error: 'no_text_to_translate' }, { status: 400 })
  }

  // Legacy rows with a null source language: detect and persist it now, then
  // translate — instead of returning 400 no_source_language. Detection wins.
  let sourceLanguage = comment.sourceLanguage
  if (!sourceLanguage) {
    const detected = await detectSourceLanguage({ text: comment.sourceText })
    if (!detected) {
      return json({ error: 'no_text_to_translate' }, { status: 400 })
    }
    await prisma.postComment.update({
      where: { id: comment.id },
      data: { sourceLanguage: detected },
    })
    sourceLanguage = detected
  }

  const translatedText = await translateCommentOnDemand(prismaTranslationDeps, {
    commentId: comment.id,
    bodyVersion: comment.bodyVersion,
    sourceText: comment.sourceText,
    sourceLanguage,
    language: language.trim(),
  })

  return json({
    commentId: comment.id,
    bodyVersion: comment.bodyVersion,
    language: language.trim(),
    text: translatedText,
    status: translatedText ? 'ready' : 'failed',
  })
}
