import { type NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { visibleSinglePostWhere } from '@/server/posts/post-visibility'
import { visibleCommentsWhere, notMutuallyBlockedWhere } from '@/server/posts/comment-visibility'
import { createComment } from '@/server/posts/comment-service'
import { createPostNotification } from '@/server/notifications/create-post-notification'
import { translateCommentOnDemand } from '@/server/translation/post-translation-service'
import { prismaTranslationDeps } from '@/server/posts/post-translation-repository'
import { resolveDefaultPostTranslationLanguages } from '@/server/translation/post-translation-service'

export const runtime = 'nodejs'

const MAX_COMMENT_LENGTH = 500

function json(payload: object, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  })
}

type Ctx = { params: Promise<{ postId: string }> }

/**
 * GET — list comments on a post.
 * Oldest-first, replies grouped under their parent in chronological order.
 */
export async function GET(request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { postId } = await context.params

  // Verify post is visible
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, userId),
    select: { id: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  // Fetch all comments (including soft-deleted parents with replies)
  const comments = await prisma.postComment.findMany({
    where: visibleCommentsWhere(postId, userId),
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, handle: true, name: true, image: true } },
      replyToUser: { select: { id: true, handle: true, name: true } },
      _count: { select: { replies: true } },
    },
  })

  // Check which comments the viewer has liked
  const commentIds = comments.map((c) => c.id)
  const likedSet = new Set(
    (
      await prisma.postCommentLike.findMany({
        where: { commentId: { in: commentIds }, userId },
        select: { commentId: true },
      })
    ).map((l) => l.commentId),
  )

  // Build threaded response: top-level first, replies grouped under parent.
  //
  // A soft-deleted comment survives the query only to keep a reply thread
  // readable. Two cases follow from that:
  //   - a deleted REPLY is dropped, since nothing hangs off it;
  //   - a deleted top-level comment is dropped once its last live reply is
  //     gone, and kept (body redacted) while replies remain.
  const liveReplyMap = new Map<string, typeof comments>()
  for (const c of comments) {
    if (!c.parentId) continue
    if (c.isDeleted === true) continue
    const group = liveReplyMap.get(c.parentId) ?? []
    group.push(c)
    liveReplyMap.set(c.parentId, group)
  }

  const topLevel = comments.filter((c) => {
    if (c.parentId) return false
    if (c.isDeleted !== true) return true
    return (liveReplyMap.get(c.id) ?? []).length > 0
  })

  function formatComment(c: (typeof comments)[number]) {
    const isDeleted = c.isDeleted === true
    return {
      id: c.id,
      postId: c.postId,
      authorId: c.authorId,
      parentId: c.parentId,
      replyToUserId: c.replyToUserId,
      bodyVersion: c.bodyVersion,
      sourceText: isDeleted ? null : c.sourceText,
      sourceLanguage: isDeleted ? null : c.sourceLanguage,
      likeCount: c.likeCount,
      isDeleted,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      author: { id: c.author.id, handle: c.author.handle, name: c.author.name, image: c.author.image },
      replyToUser: c.replyToUser ? { id: c.replyToUser.id, handle: c.replyToUser.handle, name: c.replyToUser.name } : null,
      // Live replies only: this drives the "N replies" affordance, so counting
      // deleted rows would promise replies the client never receives.
      replyCount: (liveReplyMap.get(c.id) ?? []).length,
      liked: likedSet.has(c.id),
    }
  }

  const result = topLevel.map((parent) => ({
    ...formatComment(parent),
    replies: (liveReplyMap.get(parent.id) ?? []).map(formatComment),
  }))

  return json({ comments: result })
}

/**
 * POST — create a comment or reply.
 * Body: { sourceText, sourceLanguage?, parentId?, replyToUserId? }
 */
export async function POST(request: NextRequest, context: Ctx) {
  const session = await getServerSession(getAuthOptions())
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return json({ error: 'unauthorized' }, { status: 401 })

  const { postId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') return json({ error: 'invalid_body' }, { status: 400 })

  const { sourceText, sourceLanguage, parentId, replyToUserId } = body as Record<string, unknown>

  // Validate sourceText
  const text = typeof sourceText === 'string' ? sourceText : null
  if (!text || text.trim().length === 0) return json({ error: 'text_required' }, { status: 400 })
  if (text.length > MAX_COMMENT_LENGTH) return json({ error: 'text_too_long' }, { status: 400 })

  // Verify post is visible and not deleted
  const post = await prisma.post.findFirst({
    where: visibleSinglePostWhere(postId, userId),
    select: { id: true, authorId: true },
  })
  if (!post) return json({ error: 'not_found' }, { status: 404 })

  const lang = typeof sourceLanguage === 'string' && sourceLanguage.trim() ? sourceLanguage.trim() : null
  const pId = typeof parentId === 'string' && parentId.trim() ? parentId.trim() : null
  const rUserId = typeof replyToUserId === 'string' && replyToUserId.trim() ? replyToUserId.trim() : null

  let comment
  try {
    comment = await createComment({
      postId,
      authorId: userId,
      sourceText: text,
      sourceLanguage: lang,
      parentId: pId,
      replyToUserId: rUserId,
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'parent_not_found') {
      return json({ error: 'parent_not_found' }, { status: 400 })
    }
    throw err
  }

  // Notify the right recipient. A reply notifies the person being replied to
  // (the target comment's author); a top-level comment notifies the post
  // author. createComment resolves replyToUserId for reply-to-a-reply, but a
  // direct reply to a top-level comment may arrive without it, so fall back to
  // the parent comment's author. Fire-and-forget so the response is not
  // delayed; comment/reply also push.
  const notifyParentId = comment.parentId ?? pId
  after(async () => {
    let replyRecipientId = comment.replyToUserId ?? null
    if (!replyRecipientId && notifyParentId) {
      const parentComment = await prisma.postComment.findUnique({
        where: { id: notifyParentId },
        select: { authorId: true },
      })
      replyRecipientId = parentComment?.authorId ?? null
    }

    if (replyRecipientId) {
      await createPostNotification({
        type: 'comment_reply',
        recipientId: replyRecipientId,
        actorId: userId,
        postId: comment.postId,
        commentId: comment.id,
      })
    } else {
      await createPostNotification({
        type: 'comment',
        recipientId: post.authorId,
        actorId: userId,
        postId: comment.postId,
        commentId: comment.id,
      })
    }
  })

  // Fire-and-forget translation for default languages (like post creation)
  if (lang) {
    after(async () => {
      try {
        const targets = resolveDefaultPostTranslationLanguages(lang)
        await Promise.allSettled(
          targets.map((targetLang) =>
            translateCommentOnDemand(prismaTranslationDeps, {
              commentId: comment.id,
              bodyVersion: comment.bodyVersion,
              sourceText: text,
              sourceLanguage: lang,
              language: targetLang,
            }),
          ),
        )
      } catch (err) {
        console.error('[comment-create] translation failed', err instanceof Error ? err.message : 'unknown')
      }
    })
  }

  return json(
    {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      replyToUserId: comment.replyToUserId,
      bodyVersion: comment.bodyVersion,
      createdAt: comment.createdAt,
    },
    { status: 201 },
  )
}
