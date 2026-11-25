import { prisma } from '@/lib/prisma'
import { zipInterestLanguages } from '@/lib/interest-languages'
import { sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { createPostNotification } from '@/server/notifications/create-post-notification'
import { ageOn } from '@/server/operator-auto-reply/generate'
import { checkOperatorForPosting } from '@/server/operator-posts/operator-check'
import { createComment } from '@/server/posts/comment-service'
import { visibleCommentsWhere, visibleSingleCommentWhere } from '@/server/posts/comment-visibility'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { detectSourceLanguageVerdict } from '@/server/translation/detect-source-language'
import { resolveDefaultPostTranslationLanguages, translateCommentBodySettled } from '@/server/translation/post-translation-service'
import { generateOperatorComment } from './generate'
import { operatorTextProvider } from '@/server/translation/translate-texts'

export type GeneratedCommentResult =
  | { ok: true; commentId: string; text: string; language: string; kind: string }
  | { ok: false; error: 'not_operator' | 'operator_inactive' | 'account_restricted' | 'not_found' | 'own_post' | 'own_comment' | 'already_commented' | 'already_replied' | 'generation_failed' }

const COMMENTER_SELECT = {
  name: true, bio: true, birthDate: true, locationCity: true, locationCountry: true, primaryLanguages: true, interestLanguages: true, interestLanguageLevels: true,
  operatorAccount: { select: { personaGender: true } },
} as const

type CommenterRow = { name: string | null; bio: string | null; birthDate: Date | null; locationCity: string | null; locationCountry: string | null; primaryLanguages: string[]; interestLanguages: string[]; interestLanguageLevels: number[]; operatorAccount: { personaGender: string | null } | null }

function commenterPersona(id: string, row: CommenterRow, language: string, now: Date) {
  return {
    id,
    name: row.name?.trim() || null,
    bio: row.bio?.trim() || null,
    age: ageOn(row.birthDate, now),
    city: row.locationCity ?? null,
    country: row.locationCountry ?? null,
    language,
    learning: zipInterestLanguages(row.interestLanguages, row.interestLanguageLevels).map((item) => ({ language: item.code, level: item.level })),
    gender: row.operatorAccount?.personaGender ?? null,
  }
}

/** Language detection and the default translations, as the app does for any comment. */
async function settleCommentText(text: string, hint: string) {
  const verdict = await detectSourceLanguageVerdict({ text, clientHint: hint, provider: operatorTextProvider() })
  const detected = verdict.language
  const mixed = Boolean(detected) && verdict.mixed
  const translationRows = detected && detected.trim()
    ? (
        await translateCommentBodySettled({
          sourceText: text,
          sourceLanguage: detected,
          targetLanguages: resolveDefaultPostTranslationLanguages(detected, null, mixed),
          provider: operatorTextProvider(),
          sourceLanguagesMixed: mixed,
        })
      ).map((row) => ({ language: row.language, status: row.status, text: row.text }))
    : []
  return { detected, mixed, translationRows }
}

/**
 * Has an operator account leave one AI-written comment on a post. Only
 * `isOperator` accounts are ever acted as, the post must be visible to that
 * account, and an account comments at most once per post and never on its own.
 * The comment then takes the app's own path (language detection, default
 * translations, notification), like a staff-written one. Never throws.
 */
export async function commentOnPostAsOperator(
  ctx: AdminContext | null,
  /** `photo` describes the post's photo when the post has no latent-post row to read it from. */
  input: { operatorUserId: string; postId: string; now?: Date; photo?: string | null },
): Promise<GeneratedCommentResult> {
  try {
    const check = await checkOperatorForPosting(input.operatorUserId)
    if (!check.ok) return { ok: false, error: check.reason }
    const operatorUserId = check.account.id

    const post = await prisma.post.findFirst({
      where: visibleSinglePostWhere(input.postId, operatorUserId),
      select: { id: true, authorId: true, sourceText: true, sourceLanguage: true, imageObjectKey: true },
    })
    if (!post) return { ok: false, error: 'not_found' }
    if (post.authorId === operatorUserId) return { ok: false, error: 'own_post' }

    const [commenter, comments, reserve] = await Promise.all([
      prisma.user.findUnique({ where: { id: operatorUserId }, select: COMMENTER_SELECT }),
      prisma.postComment.findMany({
        where: visibleCommentsWhere(post.id, operatorUserId),
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { authorId: true, sourceText: true, author: { select: { isOperator: true } } },
      }),
      prisma.operatorPostReserve.findFirst({ where: { postId: post.id }, select: { imagePrompt: true } }),
    ])
    const language = commenter ? sanitizeSttLanguageSelection(commenter.primaryLanguages)[0] : null
    if (!commenter || !language) return { ok: false, error: 'generation_failed' }
    if (comments.some((comment) => comment.authorId === operatorUserId)) return { ok: false, error: 'already_commented' }

    const generated = await generateOperatorComment({
      commenter: commenterPersona(operatorUserId, commenter, language, input.now ?? new Date()),
      // The planned photo is only described when it was actually drawn and attached.
      post: { text: post.sourceText, language: post.sourceLanguage, photo: post.imageObjectKey ? input.photo ?? reserve?.imagePrompt ?? null : null },
      existingComments: comments.map((comment) => comment.sourceText ?? '').filter(Boolean),
    })
    if (!generated) return { ok: false, error: 'generation_failed' }

    const { detected, mixed, translationRows } = await settleCommentText(generated.text, generated.language)
    const comment = await createComment({
      postId: post.id,
      authorId: operatorUserId,
      sourceText: generated.text,
      sourceLanguage: detected,
      sourceLanguagesMixed: mixed,
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

/**
 * Has an operator account answer a comment (a root comment of the thread) with
 * one AI-written reply: the post's author answering under their own post, or
 * another reader joining in. Never on its own comment, and at most one reply
 * per account in a thread. Same path as a comment otherwise (detection,
 * translations, the reply notification). Never throws.
 */
/**
 * True when an automatic reply would double up: this operator already answered
 * the thread, or, under a real person's comment, any operator did (staff
 * answering by hand as an operator counts, whichever account they used).
 */
export function threadBlocksAutoReply(
  thread: ReadonlyArray<{ authorId: string; author?: { isOperator: boolean | null } | null }>,
  operatorUserId: string,
  rootIsReal: boolean,
): boolean {
  return thread.some((reply) => reply.authorId === operatorUserId || (rootIsReal && reply.author?.isOperator === true))
}

export async function replyToCommentAsOperator(
  ctx: AdminContext | null,
  input: { operatorUserId: string; commentId: string; now?: Date },
): Promise<GeneratedCommentResult> {
  try {
    const check = await checkOperatorForPosting(input.operatorUserId)
    if (!check.ok) return { ok: false, error: check.reason }
    const operatorUserId = check.account.id
    const now = input.now ?? new Date()

    const root = await prisma.postComment.findFirst({
      where: { ...visibleSingleCommentWhere(input.commentId, operatorUserId), parentId: null, OR: [{ isDeleted: null }, { isDeleted: false }] },
      select: { id: true, postId: true, authorId: true, sourceText: true, sourceLanguage: true, author: { select: { isOperator: true } } },
    })
    if (!root) return { ok: false, error: 'not_found' }
    if (root.authorId === operatorUserId) return { ok: false, error: 'own_comment' }
    const post = await prisma.post.findFirst({
      where: visibleSinglePostWhere(root.postId, operatorUserId),
      select: { id: true, authorId: true, sourceText: true, sourceLanguage: true, imageObjectKey: true },
    })
    if (!post) return { ok: false, error: 'not_found' }

    const [commenter, thread, reserve] = await Promise.all([
      prisma.user.findUnique({ where: { id: operatorUserId }, select: COMMENTER_SELECT }),
      prisma.postComment.findMany({
        where: { postId: post.id, parentId: root.id, moderationHiddenAt: null },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { authorId: true, sourceText: true },
      }),
      prisma.operatorPostReserve.findFirst({ where: { postId: post.id }, select: { imagePrompt: true } }),
    ])
    const language = commenter ? sanitizeSttLanguageSelection(commenter.primaryLanguages)[0] : null
    if (!commenter || !language) return { ok: false, error: 'generation_failed' }
    const rootIsReal = root.author?.isOperator !== true
    if (threadBlocksAutoReply(thread, operatorUserId, rootIsReal)) return { ok: false, error: 'already_replied' }

    const generated = await generateOperatorComment({
      commenter: commenterPersona(operatorUserId, commenter, language, now),
      post: { text: post.sourceText, language: post.sourceLanguage, photo: post.imageObjectKey ? reserve?.imagePrompt ?? null : null },
      existingComments: [],
      replyTo: {
        text: root.sourceText ?? '',
        language: root.sourceLanguage,
        thread: thread.map((reply) => reply.sourceText ?? '').filter(Boolean),
        asPostAuthor: post.authorId === operatorUserId,
      },
      toRealUser: root.author?.isOperator !== true,
    })
    if (!generated) return { ok: false, error: 'generation_failed' }
    // Staff may have answered (as an operator) while the reply was being written.
    const answeredMeanwhile = await prisma.postComment.findMany({
      where: { parentId: root.id, OR: [{ isDeleted: null }, { isDeleted: false }] },
      select: { authorId: true, author: { select: { isOperator: true } } },
    })
    if (threadBlocksAutoReply(answeredMeanwhile, operatorUserId, rootIsReal)) return { ok: false, error: 'already_replied' }

    const { detected, mixed, translationRows } = await settleCommentText(generated.text, generated.language)
    const reply = await createComment({
      postId: post.id,
      authorId: operatorUserId,
      sourceText: generated.text,
      sourceLanguage: detected,
      sourceLanguagesMixed: mixed,
      parentId: root.id,
      replyToUserId: root.authorId,
      translationRows,
    })
    if (reply.replyRecipientId) {
      await createPostNotification({ type: 'comment_reply', recipientId: reply.replyRecipientId, actorId: operatorUserId, postId: post.id, commentId: reply.id })
    }
    await writeAdminAudit(ctx, {
      action: 'activity.reply_generated',
      operatorUserId,
      targetType: 'comment',
      targetId: reply.id,
      metadata: { postId: post.id, parentId: root.id, kind: generated.kind, language: generated.language, asPostAuthor: post.authorId === operatorUserId },
    })
    return { ok: true, commentId: reply.id, text: generated.text, language: generated.language, kind: generated.kind }
  } catch (error) {
    console.warn('[operator-comments] reply_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return { ok: false, error: 'generation_failed' }
  }
}
