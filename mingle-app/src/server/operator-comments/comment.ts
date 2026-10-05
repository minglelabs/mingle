import { prisma } from '@/lib/prisma'
import { sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { createPostNotification } from '@/server/notifications/create-post-notification'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { checkOperatorForPosting } from '@/server/operator-posts/operator-check'
import { createComment } from '@/server/posts/comment-service'
import { visibleCommentsWhere } from '@/server/posts/comment-visibility'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import { resolveDefaultPostTranslationLanguages, translateCommentBodySettled } from '@/server/translation/post-translation-service'
import { generateOperatorComment } from './generate'

export type GeneratedCommentResult =
  | { ok: true; commentId: string; text: string; language: string; kind: string }
  | { ok: false; error: 'not_operator' | 'operator_inactive' | 'account_restricted' | 'not_found' | 'own_post' | 'already_commented' | 'generation_failed' }

/**
 * Has an operator account leave one AI-written comment on a post. Only
 * `isOperator` accounts are ever acted as, the post must be visible to that
 * account, and an account comments at most once per post and never on its own.
 * The comment then takes the app's own path (language detection, default
 * translations, notification), like a staff-written one. Never throws.
 */
export async function commentOnPostAsOperator(
  ctx: AdminContext | null,
  input: { operatorUserId: string; postId: string; now?: Date },
): Promise<GeneratedCommentResult> {
  try {
    const check = await checkOperatorForPosting(input.operatorUserId)
    if (!check.ok) return { ok: false, error: check.reason }
    const operatorUserId = check.account.id

    const post = await prisma.post.findFirst({
      where: visibleSinglePostWhere(input.postId, operatorUserId),
      select: { id: true, authorId: true, sourceText: true, sourceLanguage: true },
    })
    if (!post) return { ok: false, error: 'not_found' }
    if (post.authorId === operatorUserId) return { ok: false, error: 'own_post' }

    const [commenter, comments, reserve] = await Promise.all([
      prisma.user.findUnique({
        where: { id: operatorUserId },
        select: { name: true, bio: true, birthDate: true, locationCity: true, locationCountry: true, primaryLanguages: true },
      }),
      prisma.postComment.findMany({
        where: visibleCommentsWhere(post.id, operatorUserId),
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { authorId: true, sourceText: true },
      }),
      prisma.operatorPostReserve.findFirst({ where: { postId: post.id }, select: { imagePrompt: true } }),
    ])
    const language = commenter ? sanitizeSttLanguageSelection(commenter.primaryLanguages)[0] : null
    if (!commenter || !language) return { ok: false, error: 'generation_failed' }
    if (comments.some((comment) => comment.authorId === operatorUserId)) return { ok: false, error: 'already_commented' }

    const generated = await generateOperatorComment({
      commenter: {
        id: operatorUserId,
        name: commenter.name?.trim() || null,
        bio: commenter.bio?.trim() || null,
        age: ageOn(commenter.birthDate, input.now ?? new Date()),
        city: commenter.locationCity ?? null,
        country: commenter.locationCountry ?? null,
        language,
      },
      post: { text: post.sourceText, language: post.sourceLanguage, photo: reserve?.imagePrompt ?? null },
      existingComments: comments.map((comment) => comment.sourceText ?? '').filter(Boolean),
    })
    if (!generated) return { ok: false, error: 'generation_failed' }

    const detected = await detectSourceLanguage({ text: generated.text, clientHint: generated.language })
    const translationRows = detected && detected.trim()
      ? (
          await translateCommentBodySettled({
            sourceText: generated.text,
            sourceLanguage: detected,
            targetLanguages: resolveDefaultPostTranslationLanguages(detected),
          })
        ).map((row) => ({ language: row.language, status: row.status, text: row.text }))
      : []
    const comment = await createComment({
      postId: post.id,
      authorId: operatorUserId,
      sourceText: generated.text,
      sourceLanguage: detected,
      translationRows,
    })
    // Never throws: a failed notification cannot fail the comment.
    await createPostNotification({ type: 'comment', recipientId: post.authorId, actorId: operatorUserId, postId: post.id, commentId: comment.id })
    await writeAdminAudit(ctx, {
      action: 'activity.comment_generated',
      operatorUserId,
      targetType: 'comment',
      targetId: comment.id,
      metadata: { postId: post.id, kind: generated.kind, language: generated.language },
    })
    return { ok: true, commentId: comment.id, text: generated.text, language: generated.language, kind: generated.kind }
  } catch (error) {
    console.warn('[operator-comments] generate_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return { ok: false, error: 'generation_failed' }
  }
}
