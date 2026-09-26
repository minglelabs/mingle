/**
 * Comment service — business logic for comments, replies, and soft-delete.
 *
 * All counter updates (Post.commentCount, PostComment.likeCount, Post.likeCount)
 * happen inside Prisma transactions so they are atomic.
 */

import { prisma } from '@/lib/prisma'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateCommentArgs = {
  postId: string
  authorId: string
  sourceText: string
  sourceLanguage: string | null
  parentId?: string | null
  replyToUserId?: string | null
  /**
   * Settled default-language translations to persist atomically with the
   * comment (settle-then-commit). The comment and its translations become
   * visible together. Omit for an untranslated comment.
   */
  translationRows?: Array<{ language: string; status: string; text: string | null }>
}

export type UpdateCommentArgs = {
  commentId: string
  actorId: string
  sourceText: string
  sourceLanguage: string | null
  /**
   * Settled translations for the NEW body version, written atomically with the
   * body swap. The previous body + translations stay visible until commit.
   */
  translationRows?: Array<{ language: string; status: string; text: string | null }>
}

export type DeleteCommentResult = {
  deleted: true
  commentId: string
  hadReplies: boolean
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createComment(args: CreateCommentArgs) {
  return prisma.$transaction(async (tx) => {
    // If parentId provided, enforce 1-level nesting
    let resolvedParentId = args.parentId ?? null
    let resolvedReplyToUserId = args.replyToUserId ?? null

    if (resolvedParentId) {
      const parent = await tx.postComment.findUnique({
        where: { id: resolvedParentId },
        select: { id: true, parentId: true, authorId: true },
      })
      if (!parent) throw new Error('parent_not_found')

      // If replying to a reply, hoist to the root comment
      if (parent.parentId) {
        resolvedReplyToUserId = resolvedReplyToUserId || parent.authorId
        resolvedParentId = parent.parentId
      }
    }

    const comment = await tx.postComment.create({
      data: {
        postId: args.postId,
        authorId: args.authorId,
        sourceText: args.sourceText,
        sourceLanguage: args.sourceLanguage,
        parentId: resolvedParentId,
        replyToUserId: resolvedReplyToUserId,
        bodyVersion: 1,
      },
    })

    // Persist settled translations atomically with the comment (settle-then-commit).
    if (args.translationRows && args.translationRows.length > 0) {
      await tx.postCommentTranslation.createMany({
        data: args.translationRows.map((r) => ({
          commentId: comment.id,
          bodyVersion: 1,
          language: r.language,
          status: r.status,
          text: r.text,
        })),
      })
    }

    // Increment commentCount on the post
    await tx.post.update({
      where: { id: args.postId },
      data: { commentCount: { increment: 1 } },
    })

    return comment
  })
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateComment(args: UpdateCommentArgs) {
  const comment = await prisma.postComment.findUnique({
    where: { id: args.commentId },
    select: { id: true, authorId: true, isDeleted: true, bodyVersion: true },
  })

  if (!comment) throw new Error('not_found')
  if (comment.authorId !== args.actorId) throw new Error('forbidden')
  if (comment.isDeleted) throw new Error('already_deleted')

  const newBodyVersion = comment.bodyVersion + 1

  // Atomic swap: bump the body to a new version and replace that version's
  // translations together, so the previous body + translations remain visible
  // until commit and a late result from an earlier version cannot overwrite
  // the new ones (they live under a different bodyVersion).
  return prisma.$transaction(async (tx) => {
    const updated = await tx.postComment.update({
      where: { id: args.commentId },
      data: {
        sourceText: args.sourceText,
        sourceLanguage: args.sourceLanguage,
        bodyVersion: newBodyVersion,
      },
    })

    await tx.postCommentTranslation.deleteMany({
      where: { commentId: args.commentId, bodyVersion: newBodyVersion },
    })
    if (args.translationRows && args.translationRows.length > 0) {
      await tx.postCommentTranslation.createMany({
        data: args.translationRows.map((r) => ({
          commentId: args.commentId,
          bodyVersion: newBodyVersion,
          language: r.language,
          status: r.status,
          text: r.text,
        })),
      })
    }

    return updated
  })
}

// ─── Delete (soft) ───────────────────────────────────────────────────────────

/**
 * Soft-delete a comment. The actor must be either the comment author or the
 * post author.
 *
 * Policy:
 * - If the comment has live replies → mark isDeleted=true, keep the row
 *   (UI shows "deleted comment" placeholder).
 * - If the comment has no live replies → mark isDeleted=true (hidden entirely).
 * - In both cases, decrement post.commentCount by 1 (only for this comment,
 *   not its replies).
 */
export async function deleteComment(commentId: string, actorId: string): Promise<DeleteCommentResult> {
  return prisma.$transaction(async (tx) => {
    const comment = await tx.postComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        postId: true,
        authorId: true,
        parentId: true,
        isDeleted: true,
      },
    })

    if (!comment) throw new Error('not_found')
    if (comment.isDeleted) throw new Error('already_deleted')

    // Check permission: author or post author
    if (comment.authorId !== actorId) {
      const post = await tx.post.findUnique({
        where: { id: comment.postId },
        select: { authorId: true },
      })
      if (!post || post.authorId !== actorId) {
        throw new Error('forbidden')
      }
    }

    // Count live replies
    const liveReplyCount = await tx.postComment.count({
      where: {
        parentId: commentId,
        OR: [{ isDeleted: null }, { isDeleted: false }],
      },
    })

    const hadReplies = liveReplyCount > 0

    // Soft-delete
    await tx.postComment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    })

    // Decrement commentCount on the post (only this comment, not replies)
    await tx.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    })

    return { deleted: true, commentId, hadReplies }
  })
}
