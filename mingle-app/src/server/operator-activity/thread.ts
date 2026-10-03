import { prisma } from '@/lib/prisma'
import { sanitizeSttLanguageSelection } from '@/lib/stt-languages'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { USER_IDENTITY_SELECT } from '@/server/identity/user-identity-select'
import { createPostNotification } from '@/server/notifications/create-post-notification'
import type { InboxPerson } from '@/server/operator-inbox/inbox'
import { STAFF_TRANSLATION_LANGUAGE, translateForStaff } from '@/server/operator-inbox/staff-translate'
import {
  convertToPersonaLanguage,
  PersonaConversionFailedError,
  PersonaLanguageMissingError,
} from '@/server/operator-posts/convert'
import { checkOperatorForPosting } from '@/server/operator-posts/operator-check'
import { createComment } from '@/server/posts/comment-service'
import { visibleCommentsWhere } from '@/server/posts/comment-visibility'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { detectSourceLanguage } from '@/server/translation/detect-source-language'
import {
  resolveDefaultPostTranslationLanguages,
  translateCommentBodySettled,
} from '@/server/translation/post-translation-service'
import {
  markOperatorActivityRead,
  staffCommentTranslationId,
  storedCommentKorean,
  toActivityPerson,
} from './activity'

/**
 * A post's comment thread as one operator account sees it, and commenting as
 * that operator (contract §0: only `isOperator` accounts are ever acted as).
 * Visibility is exactly the app's: the same `where` helpers as the comment
 * routes, with the operator as the viewer.
 */
export const OPERATOR_COMMENT_MAX_LENGTH = 500

export type ThreadOperator = InboxPerson & {
  /** primaryLanguages[0]: the language every comment is written in. */
  personaLanguage: string | null
  isActive: boolean
}

export type ThreadComment = {
  id: string
  parentId: string | null
  author: InboxPerson
  /** `@name` the reply addresses, when any. */
  replyTo: { userId: string; label: string } | null
  /** Null for a deleted comment kept only for its replies. */
  text: string | null
  koText: string | null
  hasImage: boolean
  isDeleted: boolean
  likeCount: number
  createdAt: string
  replies: ThreadComment[]
}

export type OperatorPostThread = {
  post: {
    id: string
    author: InboxPerson
    text: string | null
    koText: string | null
    hasImage: boolean
    likeCount: number
    commentCount: number
    publishedAt: string
  }
  /** The operator the thread is read and answered as. */
  operator: ThreadOperator
  /** Operator accounts already in this thread (post author, commenters), plus `operator`. */
  operators: ThreadOperator[]
  replyUnavailableReason: 'operator_inactive' | null
  comments: ThreadComment[]
}

export type OperatorThreadError = 'not_found' | 'operator_required'

export type OperatorThreadResult = { ok: true; thread: OperatorPostThread } | { ok: false; error: OperatorThreadError }

const THREAD_USER_SELECT = { ...USER_IDENTITY_SELECT, isActive: true, isDeleted: true, primaryLanguages: true } as const

type ThreadUser = {
  id: string
  handle: string
  name: string | null
  image: string | null
  imageCropScale: number | null
  imageCropX: number | null
  imageCropY: number | null
  isOfficial: boolean | null
  isOperator: boolean | null
  isActive: boolean | null
  isDeleted: boolean | null
  primaryLanguages: string[]
}

function toThreadOperator(user: ThreadUser): ThreadOperator {
  return {
    ...toActivityPerson(user as Parameters<typeof toActivityPerson>[0]),
    personaLanguage: sanitizeSttLanguageSelection(user.primaryLanguages)[0] ?? null,
    isActive: user.isActive !== false,
  }
}

function isKorean(language: string | null | undefined): boolean {
  return (canonicalizeTranslationLanguageCode(language || '') || '') === STAFF_TRANSLATION_LANGUAGE
}

function personLabel(user: { name: string | null; handle: string | null }): string {
  return user.name?.trim() || (user.handle ? `@${user.handle}` : '')
}

/**
 * The thread of `postId` for staff. `operatorUserId` picks who it is read
 * as; without it the post's author (when an operator) or the first operator
 * commenter is used. `operator_required` when no operator is involved and
 * none was named.
 */
export async function loadOperatorPostThread(args: {
  postId: string
  operatorUserId?: string | null
  includeKorean?: boolean
}): Promise<OperatorThreadResult> {
  // Who is in the thread, before any visibility rule (which needs a viewer).
  const base = await prisma.post.findFirst({
    where: { id: args.postId, OR: [{ isDeleted: null }, { isDeleted: false }] },
    select: {
      author: { select: THREAD_USER_SELECT },
      comments: {
        where: { author: { isOperator: true, isDeleted: false }, OR: [{ isDeleted: null }, { isDeleted: false }] },
        orderBy: { createdAt: 'asc' },
        select: { author: { select: THREAD_USER_SELECT } },
      },
    },
  })
  if (!base) return { ok: false, error: 'not_found' }

  const operatorsById = new Map<string, ThreadOperator>()
  if (base.author.isOperator && !base.author.isDeleted) operatorsById.set(base.author.id, toThreadOperator(base.author))
  for (const comment of base.comments) {
    if (!operatorsById.has(comment.author.id)) operatorsById.set(comment.author.id, toThreadOperator(comment.author))
  }

  let viewerId = args.operatorUserId ?? null
  if (viewerId && !operatorsById.has(viewerId)) {
    const named = await prisma.user.findFirst({
      where: { id: viewerId, isOperator: true, isDeleted: false },
      select: THREAD_USER_SELECT,
    })
    if (!named) return { ok: false, error: 'operator_required' }
    operatorsById.set(named.id, toThreadOperator(named))
  }
  if (!viewerId) viewerId = operatorsById.keys().next().value ?? null
  const operator = viewerId ? operatorsById.get(viewerId) : undefined
  if (!viewerId || !operator) return { ok: false, error: 'operator_required' }

  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(args.postId, viewerId),
    select: {
      id: true,
      sourceText: true,
      sourceLanguage: true,
      bodyVersion: true,
      imageObjectKey: true,
      likeCount: true,
      commentCount: true,
      publishedAt: true,
      author: { select: USER_IDENTITY_SELECT },
      translations: {
        where: { status: 'ready', language: STAFF_TRANSLATION_LANGUAGE },
        select: { bodyVersion: true, text: true },
      },
    },
  })
  if (!post) return { ok: false, error: 'not_found' }

  const rows = await prisma.postComment.findMany({
    where: visibleCommentsWhere(args.postId, viewerId),
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      parentId: true,
      sourceText: true,
      sourceLanguage: true,
      bodyVersion: true,
      imageObjectKey: true,
      isDeleted: true,
      likeCount: true,
      createdAt: true,
      author: { select: USER_IDENTITY_SELECT },
      replyToUser: { select: { id: true, name: true, handle: true } },
      translations: {
        where: { status: 'ready', language: STAFF_TRANSLATION_LANGUAGE },
        select: { bodyVersion: true, text: true },
      },
    },
  })

  const postText = post.sourceText?.trim() || null
  let postKoText: string | null = null
  if (postText) {
    postKoText = isKorean(post.sourceLanguage)
      ? postText
      : post.translations.find((row) => row.bodyVersion === post.bodyVersion && row.text?.trim())?.text?.trim() ?? null
  }

  const flat = rows.map((row) => {
    const isDeleted = row.isDeleted === true
    const text = isDeleted ? null : row.sourceText.trim() || null
    const comment: ThreadComment = {
      id: row.id,
      parentId: row.parentId,
      author: toActivityPerson(row.author),
      replyTo: row.replyToUser ? { userId: row.replyToUser.id, label: personLabel(row.replyToUser) } : null,
      text,
      koText: text ? storedCommentKorean(row) : null,
      hasImage: !isDeleted && Boolean(row.imageObjectKey),
      isDeleted,
      likeCount: row.likeCount,
      createdAt: row.createdAt.toISOString(),
      replies: [],
    }
    return { comment, row }
  })

  if (args.includeKorean) {
    const requests = flat
      .filter(({ comment }) => comment.text && !comment.koText)
      .map(({ comment, row }) => ({
        messageId: staffCommentTranslationId(row.id, row.bodyVersion),
        text: comment.text as string,
        sourceLanguage: row.sourceLanguage ?? '',
        comment,
      }))
    const postRequest = postText && !postKoText
      ? [{ messageId: `post-${post.id}-v${post.bodyVersion}`, text: postText, sourceLanguage: post.sourceLanguage ?? '' }]
      : []
    if (requests.length > 0 || postRequest.length > 0) {
      const translated = await translateForStaff([
        ...postRequest,
        ...requests.map(({ messageId, text, sourceLanguage }) => ({ messageId, text, sourceLanguage })),
      ])
      for (const request of requests) request.comment.koText = translated[request.messageId] ?? null
      if (postRequest[0]) postKoText = translated[postRequest[0].messageId] ?? null
    }
  }

  // Same shape as the app's comment sheet: live replies under their root; a
  // deleted root stays (redacted) only while it still has live replies.
  const byId = new Map(flat.map(({ comment }) => [comment.id, comment]))
  const roots: ThreadComment[] = []
  for (const { comment } of flat) {
    if (!comment.parentId) continue
    if (comment.isDeleted) continue
    byId.get(comment.parentId)?.replies.push(comment)
  }
  for (const { comment } of flat) {
    if (comment.parentId) continue
    if (comment.isDeleted && comment.replies.length === 0) continue
    roots.push(comment)
  }

  return {
    ok: true,
    thread: {
      post: {
        id: post.id,
        author: toActivityPerson(post.author),
        text: postText,
        koText: postKoText,
        hasImage: Boolean(post.imageObjectKey),
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        publishedAt: post.publishedAt.toISOString(),
      },
      operator,
      operators: [...operatorsById.values()],
      replyUnavailableReason: operator.isActive ? null : 'operator_inactive',
      comments: roots,
    },
  }
}

// ─── Comment as an operator ──────────────────────────────────────────────────

export type OperatorCommentErrorCode =
  | 'not_operator'
  | 'operator_inactive'
  | 'account_restricted'
  | 'text_required'
  | 'text_too_long'
  | 'not_found'
  | 'parent_not_found'
  | 'persona_language_missing'
  | 'conversion_failed'

export class OperatorCommentError extends Error {
  readonly code: OperatorCommentErrorCode

  constructor(code: OperatorCommentErrorCode) {
    super(code)
    this.name = 'OperatorCommentError'
    this.code = code
  }
}

export type OperatorCommentResult = {
  commentId: string
  parentId: string | null
  /** The text that was posted (the staff draft in the persona language). */
  text: string
  language: string
  /** False when the draft already was in the persona language. */
  converted: boolean
}

/**
 * Posts a comment (or a reply, with `parentId`) on `postId` as an operator
 * account. The staff draft is converted to the operator's persona language
 * first, like posts and inbox replies; a failed conversion posts nothing.
 * From there it is the app's own comment path: language detection, default
 * translations settled before the commit, and the usual notification to the
 * post author or the replied-to user.
 */
export async function commentAsOperator(ctx: AdminContext, input: {
  operatorUserId: string
  postId: string
  text: string
  parentId?: string | null
  replyToUserId?: string | null
}): Promise<OperatorCommentResult> {
  const draft = typeof input.text === 'string' ? input.text.trim() : ''
  if (!draft) throw new OperatorCommentError('text_required')
  if (draft.length > OPERATOR_COMMENT_MAX_LENGTH) throw new OperatorCommentError('text_too_long')

  const check = await checkOperatorForPosting(input.operatorUserId)
  if (!check.ok) throw new OperatorCommentError(check.reason)
  const operatorUserId = check.account.id

  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(input.postId, operatorUserId),
    select: { id: true, authorId: true },
  })
  if (!post) throw new OperatorCommentError('not_found')

  let conversion: Awaited<ReturnType<typeof convertToPersonaLanguage>>
  try {
    conversion = await convertToPersonaLanguage({ operatorUserId, text: draft })
  } catch (error) {
    if (error instanceof PersonaLanguageMissingError) throw new OperatorCommentError('persona_language_missing')
    if (error instanceof PersonaConversionFailedError) throw new OperatorCommentError('conversion_failed')
    throw error
  }
  const text = conversion.text.trim()
  if (!text) throw new OperatorCommentError('conversion_failed')
  if (text.length > OPERATOR_COMMENT_MAX_LENGTH) throw new OperatorCommentError('text_too_long')

  const detected = await detectSourceLanguage({ text, clientHint: conversion.language })
  const translationRows = detected && detected.trim()
    ? (
        await translateCommentBodySettled({
          sourceText: text,
          sourceLanguage: detected,
          targetLanguages: resolveDefaultPostTranslationLanguages(detected),
        })
      ).map((row) => ({ language: row.language, status: row.status, text: row.text }))
    : []

  let comment: Awaited<ReturnType<typeof createComment>>
  try {
    comment = await createComment({
      postId: post.id,
      authorId: operatorUserId,
      sourceText: text,
      sourceLanguage: detected,
      parentId: input.parentId ?? null,
      replyToUserId: input.replyToUserId ?? null,
      translationRows,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'parent_not_found') throw new OperatorCommentError('parent_not_found')
    throw error
  }

  // Never throws: a failed notification cannot fail the comment.
  await createPostNotification(comment.replyRecipientId
    ? { type: 'comment_reply', recipientId: comment.replyRecipientId, actorId: operatorUserId, postId: post.id, commentId: comment.id }
    : { type: 'comment', recipientId: post.authorId, actorId: operatorUserId, postId: post.id, commentId: comment.id })

  await writeAdminAudit(ctx, {
    action: 'activity.comment',
    operatorUserId,
    targetType: 'comment',
    targetId: comment.id,
    metadata: { postId: post.id, parentId: comment.parentId, converted: conversion.converted, language: conversion.language },
  })

  // Answering is reading: this operator's activity on the post is no longer new.
  try {
    await markOperatorActivityRead(ctx, { operatorUserId, postId: post.id, audit: false })
  } catch (error) {
    console.warn('[operator-activity] mark_read_after_comment_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }

  return { commentId: comment.id, parentId: comment.parentId, text, language: conversion.language, converted: conversion.converted }
}
