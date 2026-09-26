import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSingleCommentWhere } from '@/server/posts/comment-visibility'
import {
  normalizeRequestedTranslationLanguage,
  translateCommentOnDemand,
} from '@/server/translation/post-translation-service'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import { onDemandTranslationDeps } from '@/server/translation/on-demand-translation-deps'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'

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
 * Body: { language } — a supported translation language, canonicalized
 * before lookup/storage. The response always carries the original text.
 */
export async function POST(request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  // Each miss is an LLM call: cap scripted cost abuse.
  const limited = rateLimitGuard('translate_comment', userId)
  if (limited) return limited

  const { commentId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const { language: rawLanguage } = body as Record<string, unknown>
  if (typeof rawLanguage !== 'string' || !rawLanguage.trim()) {
    return json({ error: 'language_required' }, { status: 400 })
  }
  const language = normalizeRequestedTranslationLanguage(rawLanguage)
  if (!language) return json({ error: 'unsupported_language' }, { status: 400 })

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

  const base = {
    commentId: comment.id,
    bodyVersion: comment.bodyVersion,
    language,
    sourceText: comment.sourceText,
    sourceLanguage,
  }

  // Already in the requested language: the original is the answer, no LLM.
  if (normalizeRequestedTranslationLanguage(sourceLanguage) === language) {
    return json({ ...base, text: comment.sourceText, status: 'ready' })
  }

  const translatedText = await translateCommentOnDemand(onDemandTranslationDeps, {
    commentId: comment.id,
    bodyVersion: comment.bodyVersion,
    sourceText: comment.sourceText,
    sourceLanguage,
    language,
  })

  return json({
    ...base,
    text: translatedText,
    status: translatedText ? 'ready' : 'failed',
  })
}
