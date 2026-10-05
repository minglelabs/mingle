import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import {
  normalizeRequestedTranslationLanguage,
  translatePostOnDemand,
} from '@/server/translation/post-translation-service'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import { resolvePostSourceLanguage } from '@/server/translation/post-chinese-variants'
import { onDemandTranslationDeps } from '@/server/translation/on-demand-translation-deps'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'

export const runtime = 'nodejs'

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type RouteContext = { params: Promise<{ postId: string }> }

/**
 * GET — every finished translation of the post's current body, for the
 * language chips on a post. Public like the post itself: these rows are
 * shared by all viewers and reading them never calls the LLM.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() || null : null

  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, viewerId),
    select: { bodyVersion: true, sourceLanguage: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  const rows = await prisma.postTranslation.findMany({
    where: { postId, bodyVersion: post.bodyVersion, status: 'ready', text: { not: null } },
    select: { language: true, text: true },
    orderBy: { language: 'asc' },
  })

  return json({
    postId,
    translations: rows
      .filter((row) => row.language !== post.sourceLanguage && row.text)
      .map((row) => ({ language: row.language, text: row.text })),
  })
}

/**
 * POST — "see translation" for a post, in the viewer's display language.
 * Body: { language }. `language` must be a supported translation language;
 * it is canonicalized ('zh-cn' → 'zh-CN') and the stored row is shared by
 * every viewer, so only the first request per (post, bodyVersion, language)
 * calls the LLM. The response always carries the original text as well.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { postId } = await context.params
  const session = await getServerSession(getAuthOptions())
  const viewerId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!viewerId) return json({ error: 'unauthorized' }, { status: 401 })

  // Each miss is an LLM call: cap scripted cost abuse.
  const limited = rateLimitGuard('translate_post', viewerId)
  if (limited) return limited

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'invalid_body' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const { language: rawLanguage } = body as Record<string, unknown>
  if (typeof rawLanguage !== 'string' || !rawLanguage.trim()) {
    return json({ error: 'language_required' }, { status: 400 })
  }
  const language = normalizeRequestedTranslationLanguage(rawLanguage)
  if (!language) return json({ error: 'unsupported_language' }, { status: 400 })

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

  const original = { sourceText: post.sourceText, sourceLanguage }

  // Already in the requested language: the original is the answer, no LLM.
  // A legacy bare `zh` source is compared as its script's variant, so a
  // Traditional post is never served as its own zh-CN translation.
  if (normalizeRequestedTranslationLanguage(resolvePostSourceLanguage(sourceLanguage, post.sourceText)) === language) {
    return json({ postId, language, text: post.sourceText, status: 'ready', ...original })
  }

  const translated = await translatePostOnDemand(onDemandTranslationDeps, {
    postId,
    bodyVersion: post.bodyVersion,
    sourceText: post.sourceText,
    sourceLanguage,
    language,
  })

  return json({
    postId,
    language,
    text: translated,
    status: translated ? 'ready' : 'failed',
    ...original,
  })
}
