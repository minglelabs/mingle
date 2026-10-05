import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { authorizeCommentEdit, updateComment, deleteComment } from '@/server/posts/comment-service'
import { rateLimitGuard } from '@/server/rate-limit/rate-limit'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import {
  resolveEditTargetLanguages,
  translateCommentBodySettled,
} from '@/server/translation/post-translation-service'
import { accountRestrictionGuard } from '@/server/reports/account-restriction'

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
  const restricted = await accountRestrictionGuard(userId)
  if (restricted) return restricted

  // Edits re-translate the body (LLM cost): rate-limited like creates.
  const limited = rateLimitGuard('update_comment', userId)
  if (limited) return limited

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

  const clientHint = typeof sourceLanguage === 'string' && sourceLanguage.trim() ? sourceLanguage.trim() : null

  // Permission first: only the live comment's author may edit, and nothing
  // is detected or translated (LLM cost) until that is established.
  let baseVersion: number
  try {
    baseVersion = (await authorizeCommentEdit(commentId, userId)).bodyVersion
  } catch (err: unknown) {
    const mapped = mapEditError(err)
    if (mapped) return mapped
    throw err
  }

  // Server detection is authoritative. Detect the new body's language, then
  // re-translate the default 4 languages + every language this comment already
  // had, letting them settle BEFORE the atomic body-version swap so the
  // previous body + translations stay visible until commit.
  const detected = await detectSourceLanguage({ text, clientHint })

  let translationRows: Array<{ language: string; status: string; text: string | null }> = []
  if (detected) {
    const priorLanguages = (
      await prisma.postCommentTranslation.findMany({
        where: { commentId },
        select: { language: true },
      })
    ).map((r) => r.language)
    const targets = resolveEditTargetLanguages(detected, priorLanguages)
    if (targets.length > 0) {
      translationRows = (
        await translateCommentBodySettled({
          sourceText: text,
          sourceLanguage: detected,
          targetLanguages: targets,
        })
      ).map((r) => ({ language: r.language, status: r.status, text: r.text }))
    }
  }

  let updated
  try {
    updated = await updateComment({
      commentId,
      actorId: userId,
      sourceText: text,
      sourceLanguage: detected,
      translationRows,
      expectedBodyVersion: baseVersion,
    })
  } catch (err: unknown) {
    const mapped = mapEditError(err)
    if (mapped) return mapped
    throw err
  }

  return json({
    id: updated.id,
    bodyVersion: updated.bodyVersion,
    sourceText: updated.sourceText,
    updatedAt: updated.updatedAt,
  })
}

function mapEditError(err: unknown): NextResponse | null {
  if (!(err instanceof Error)) return null
  if (err.message === 'not_found') return json({ error: 'not_found' }, { status: 404 })
  if (err.message === 'forbidden') return json({ error: 'forbidden' }, { status: 403 })
  if (err.message === 'already_deleted') return json({ error: 'already_deleted' }, { status: 410 })
  // Another edit of this comment committed first (optimistic lock).
  if (err.message === 'conflict') return json({ error: 'conflict' }, { status: 409 })
  return null
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
