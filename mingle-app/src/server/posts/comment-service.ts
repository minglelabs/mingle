/**
 * Comment service — business logic for comments, replies, and soft-delete.
 *
 * All counter updates (Post.commentCount, PostComment.likeCount, Post.likeCount)
 * happen inside Prisma transactions so they are atomic.
 */

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

import { visibleCommentsWhere } from './comment-visibility'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateCommentArgs = {
  postId: string
  authorId: string
  sourceText: string
  sourceLanguage: string | null
  /** The comment being replied to (a root, or a reply that is hoisted to its root). */
  parentId?: string | null
  /**
   * Client-suggested `@mention` for a reply to a root. Untrusted: kept only
   * when it names the root's author or a live reply author in the same thread.
   */
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

const LIVE_COMMENT: Prisma.PostCommentWhereInput = { OR: [{ isDeleted: null }, { isDeleted: false }] }

type ResolvedReplyTarget = {
  /** Root comment the reply attaches to (one-level rule). */
  parentId: string
  /** `@name` mention, derived server-side; null for a plain reply to the root. */
  replyToUserId: string | null
  /** Who gets the `comment_reply` notification. */
  recipientId: string
}

/**
 * Resolve where a reply attaches and whom it addresses, from server state only.
 *
 * - `parentId` must be a comment on THIS post that the author can see
 *   (same visibility rule as the comment list: not operator-hidden, author not
 *   hidden, no block either way). Anything else is `parent_not_found`.
 * - Reply to a reply: attach to its root and mention the replied-to reply's
 *   author. The replied-to reply must be live and its root visible, otherwise
 *   it is not on screen and cannot be replied to.
 * - Reply to a root: the client may name a mention (`replyToUserId`, the
 *   current client shape sends the root id + the tapped comment's author). It
 *   is accepted only when that user authored the root or a live, visible reply
 *   in the SAME thread; any other id is dropped, never trusted.
 * - A soft-deleted root is only a placeholder kept for its live replies, so a
 *   reply to it must address one of those replies.
 */
async function resolveReplyTarget(
  tx: Prisma.TransactionClient,
  args: { postId: string; authorId: string; parentId: string; replyToUserId: string | null },
): Promise<ResolvedReplyTarget> {
  const select = { id: true, parentId: true, authorId: true, isDeleted: true } as const
  const visibleOnPost = (id: string): Prisma.PostCommentWhereInput => ({
    ...visibleCommentsWhere(args.postId, args.authorId),
    id,
  })

  const target = await tx.postComment.findFirst({ where: visibleOnPost(args.parentId), select })
  if (!target) throw new Error('parent_not_found')

  if (target.parentId) {
    // Reply to a reply: the reply itself must be live, its root visible.
    if (target.isDeleted === true) throw new Error('parent_not_found')
    const root = await tx.postComment.findFirst({ where: visibleOnPost(target.parentId), select })
    if (!root || root.parentId) throw new Error('parent_not_found')
    return { parentId: root.id, replyToUserId: target.authorId, recipientId: target.authorId }
  }

  const root = target
  const rootIsLive = root.isDeleted !== true
  let mention: string | null = null
  if (args.replyToUserId) {
    if (rootIsLive && args.replyToUserId === root.authorId) {
      mention = root.authorId
    } else {
      const reply = await tx.postComment.findFirst({
        where: {
          ...visibleCommentsWhere(args.postId, args.authorId),
          parentId: root.id,
          authorId: args.replyToUserId,
          AND: [LIVE_COMMENT],
        },
        select: { authorId: true },
      })
      mention = reply?.authorId ?? null
    }
  }

  if (!rootIsLive && !mention) throw new Error('parent_not_found')
  return { parentId: root.id, replyToUserId: mention, recipientId: mention ?? root.authorId }
}

/**
 * Create a comment or reply. The returned row carries `replyRecipientId`: the
 * user a reply notifies (null for a top-level comment, which notifies the post
 * author).
 */
export async function createComment(args: CreateCommentArgs) {
  return prisma.$transaction(async (tx) => {
    let resolvedParentId: string | null = null
    let resolvedReplyToUserId: string | null = null
    let replyRecipientId: string | null = null

    if (args.parentId) {
      const resolved = await resolveReplyTarget(tx, {
        postId: args.postId,
        authorId: args.authorId,
        parentId: args.parentId,
        replyToUserId: args.replyToUserId ?? null,
      })
      resolvedParentId = resolved.parentId
      resolvedReplyToUserId = resolved.replyToUserId
      replyRecipientId = resolved.recipientId
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

    return { ...comment, replyRecipientId }
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
