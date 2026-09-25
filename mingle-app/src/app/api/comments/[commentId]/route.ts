import { type NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { updateComment, deleteComment } from '@/server/posts/comment-service'
import { translateCommentOnDemand, resolveDefaultPostTranslationLanguages } from '@/server/translation/post-translation-service'
import { prismaTranslationDeps } from '@/server/posts/post-translation-repository'

export const runtime = 'nodejs'

const MAX_COMMENT_LENGTH = 500

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type Ctx = { params: Promise<{ commentId: string }> }

/**
 * PATCH — edit own comment.
 * Body: { sourceText, sourceLanguage? }
 * Increments bodyVersion and triggers re-translation.
 */
export async function PATCH(request: NextRequest, context: Ctx) {
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

  const { sourceText, sourceLanguage } = body as Record<string, unknown>
  const text = typeof sourceText === 'string' ? sourceText : null
  if (!text || text.trim().length === 0) return json({ error: 'text_required' }, { status: 400 })
  if (text.length > MAX_COMMENT_LENGTH) return json({ error: 'text_too_long' }, { status: 400 })

  const lang = typeof sourceLanguage === 'string' && sourceLanguage.trim() ? sourceLanguage.trim() : null

  let updated
  try {
    updated = await updateComment({ commentId, actorId: userId, sourceText: text, sourceLanguage: lang })
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'not_found') return json({ error: 'not_found' }, { status: 404 })
      if (err.message === 'forbidden') return json({ error: 'forbidden' }, { status: 403 })
      if (err.message === 'already_deleted') return json({ error: 'already_deleted' }, { status: 410 })
    }
    throw err
  }

  // Fire-and-forget re-translation
  if (lang) {
    after(async () => {
      try {
        const targets = resolveDefaultPostTranslationLanguages(lang)
        await Promise.allSettled(
          targets.map((targetLang) =>
            translateCommentOnDemand(prismaTranslationDeps, {
              commentId: updated.id,
              bodyVersion: updated.bodyVersion,
              sourceText: text,
              sourceLanguage: lang,
              language: targetLang,
            }),
          ),
        )
      } catch (err) {
        console.error('[comment-update] translation failed', err instanceof Error ? err.message : 'unknown')
      }
    })
  }

  return json({
    id: updated.id,
    bodyVersion: updated.bodyVersion,
    sourceText: updated.sourceText,
    updatedAt: updated.updatedAt,
  })
}

/**
 * DELETE — soft-delete a comment.
 * Actor must be comment author or the post author.
 */
export async function DELETE(_request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { commentId } = await context.params

  let result
  try {
    result = await deleteComment(commentId, userId)
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'not_found') return json({ error: 'not_found' }, { status: 404 })
      if (err.message === 'forbidden') return json({ error: 'forbidden' }, { status: 403 })
      if (err.message === 'already_deleted') return json({ error: 'already_deleted' }, { status: 410 })
    }
    throw err
  }

  return json({
    deleted: true,
    commentId: result.commentId,
    hadReplies: result.hadReplies,
  })
}
