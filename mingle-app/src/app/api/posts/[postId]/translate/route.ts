import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { translatePostOnDemand } from '@/server/translation/post-translation-service'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import { prismaTranslationDeps } from '@/server/posts/post-translation-repository'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!viewerId) return json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const { language } = body as Record<string, unknown>
  if (typeof language !== 'string' || !language.trim()) {
    return json({ error: 'language_required' }, { status: 400 })
  }

  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, viewerId),
    select: { sourceText: true, sourceLanguage: true, bodyVersion: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })
  if (!post.sourceText || !post.sourceText.trim()) {
    return json({ error: 'no_text_to_translate' }, { status: 400 })
  }

  // Legacy rows stored with a null source language: detect it now and persist,
  // then translate — instead of rejecting. Detection is authoritative.
  let sourceLanguage = post.sourceLanguage
  if (!sourceLanguage) {
    const detected = await detectSourceLanguage({ text: post.sourceText })
    if (!detected) {
      // Genuinely undetectable (e.g. emoji-only) — nothing to translate.
      return json({ error: 'no_text_to_translate' }, { status: 400 })
    }
    await prisma.post.update({
      where: { id: postId },
      data: { sourceLanguage: detected },
    })
    sourceLanguage = detected
  }

  const translated = await translatePostOnDemand(prismaTranslationDeps, {
    postId,
    bodyVersion: post.bodyVersion,
    sourceText: post.sourceText,
    sourceLanguage,
    language: language.trim(),
  })

  return json({
    postId,
    language: language.trim(),
    text: translated,
    status: translated ? 'ready' : 'failed',
  })
}
