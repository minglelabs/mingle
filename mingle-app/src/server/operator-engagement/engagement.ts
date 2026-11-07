import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { markPostViewed } from '@/server/feed/post-view'
import { commentOnPostAsOperator, replyToCommentAsOperator } from '@/server/operator-comments/comment'
import { seededRandom } from '@/server/operator-avatars/taxonomy'
import { visiblePostWhere } from '@/server/posts/post-visibility'

/**
 * Reactions on operator posts, the way they build up on a real one: likes come
 * in over the hours after it goes up, a few comments follow, the author answers
 * some of them, another reader sometimes joins a thread, and comments and
 * replies get their own likes (the post's author liking comments, the commenter
 * liking the reply to them, a reader or two).
 *
 * Each post and each comment has a fixed plan seeded by its id (how many, and
 * at what delay), so a run only adds what is due by now and is missing:
 * running it again, or after a restart, never doubles anything. Only operator
 * accounts act, and only on operator content: a real person's comment is never
 * answered or liked here (that is the auto-reply feature, kept off).
 * Comments and replies are AI-written, so each run writes at most a few.
 */

const HOUR_MS = 60 * 60_000
const MINUTE_MS = 60_000
/** Posts and comments get reactions for this long after they go up. */
export const ENGAGEMENT_WINDOW_MS = 4 * 24 * HOUR_MS
/** AI-written comments and replies per run; the rest wait for the next run. */
const MAX_WRITTEN_PER_RUN = 2

type Random = () => number
const WORKER_CONTEXT: AdminContext = { sessionId: null, ip: null, userAgent: 'operator-engagement' }

/** A delay between `min` and `max`, mostly near the start (log-uniform), as reactions come in. */
function delay(random: Random, minMs: number, maxMs: number): number {
  return Math.round(Math.exp(Math.log(minMs) + random() * (Math.log(maxMs) - Math.log(minMs))))
}

function weightedCount(random: Random, weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll = random() * total
  for (let count = 0; count < weights.length; count += 1) {
    roll -= weights[count]
    if (roll < 0) return count
  }
  return weights.length - 1
}

export type PostEngagementPlan = {
  /** Delays after publishing, ascending: one like each. */
  likes: number[]
  /** Delays after publishing, ascending: one comment each. */
  comments: number[]
}

/** How a post's reactions build up. */
export function planPostEngagement(postId: string): PostEngagementPlan {
  const random = seededRandom(`engage-post:${postId}`)
  // 1-24 likes, most posts around 6-10.
  const likeCount = 1 + Math.floor(24 * random() ** 1.7)
  const likes = Array.from({ length: likeCount }, () => delay(random, 3 * MINUTE_MS, 36 * HOUR_MS)).sort((a, b) => a - b)
  const commentCount = weightedCount(random, [22, 36, 25, 12, 5])
  const comments = Array.from({ length: commentCount }, () => delay(random, 8 * MINUTE_MS, 30 * HOUR_MS)).sort((a, b) => a - b)
  return { likes, comments }
}

export type CommentEngagementPlan = {
  /** The post's author answers this root comment after this delay (null: no answer). */
  authorReply: number | null
  /** Another reader replies in the thread after this delay. */
  otherReply: number | null
  /** The post's author likes the comment (a root) / the root's author likes this reply. */
  closeLike: number | null
  /** Likes from other readers. */
  otherLikes: number[]
}

/** How one comment or reply gets answered and liked. */
export function planCommentEngagement(commentId: string, isRoot: boolean): CommentEngagementPlan {
  const random = seededRandom(`engage-comment:${commentId}`)
  const chance = (p: number, min: number, max: number) => {
    const hit = random() < p
    const at = delay(random, min, max)
    return hit ? at : null
  }
  if (isRoot) {
    return {
      authorReply: chance(0.45, 10 * MINUTE_MS, 12 * HOUR_MS),
      otherReply: chance(0.15, 30 * MINUTE_MS, 24 * HOUR_MS),
      closeLike: chance(0.6, 5 * MINUTE_MS, 10 * HOUR_MS),
      otherLikes: Array.from({ length: weightedCount(random, [50, 30, 15, 5]) }, () => delay(random, 20 * MINUTE_MS, 30 * HOUR_MS)).sort((a, b) => a - b),
    }
  }
  return {
    authorReply: null,
    otherReply: null,
    closeLike: chance(0.5, 5 * MINUTE_MS, 8 * HOUR_MS),
    otherLikes: Array.from({ length: weightedCount(random, [75, 20, 5]) }, () => delay(random, 30 * MINUTE_MS, 30 * HOUR_MS)).sort((a, b) => a - b),
  }
}

/** `ids` in an order fixed by `seed`, so the same accounts are picked again on the next run. */
export function seededOrder(ids: readonly string[], seed: string): string[] {
  const random = seededRandom(seed)
  const order = [...ids].sort()
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export type EngagementRunResult = { likes: number; comments: number; replies: number; commentLikes: number }

type CommentRow = { id: string; postId: string; authorId: string; parentId: string | null; createdAt: Date; likes: Array<{ userId: string }> }

/** One run: adds every reaction that is due and missing on recent operator posts. */
export async function runOperatorEngagement(now: Date = new Date(), options: { maxWritten?: number } = {}): Promise<EngagementRunResult> {
  const result: EngagementRunResult = { likes: 0, comments: 0, replies: 0, commentLikes: 0 }
  let writeBudget = options.maxWritten ?? MAX_WRITTEN_PER_RUN
  const nowMs = now.getTime()
  const since = new Date(nowMs - ENGAGEMENT_WINDOW_MS)

  const operators = (await prisma.user.findMany({
    where: { isOperator: true, isActive: true, isDeleted: false, operatorAccount: { reviewState: 'approved' } },
    select: { id: true },
  })).map((user) => user.id)
  if (operators.length < 2) return result
  const isOperator = new Set(operators)

  const posts = await prisma.post.findMany({
    where: { ...visiblePostWhere(null), author: { isOperator: true }, publishedAt: { gte: since, lte: now } },
    orderBy: { publishedAt: 'asc' },
    select: { id: true, authorId: true, publishedAt: true, likes: { select: { userId: true } } },
  })
  if (posts.length === 0) return result

  const comments: CommentRow[] = await prisma.postComment.findMany({
    where: { postId: { in: posts.map((post) => post.id) }, moderationHiddenAt: null, OR: [{ isDeleted: null }, { isDeleted: false }] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, postId: true, authorId: true, parentId: true, createdAt: true, likes: { select: { userId: true } } },
  })
  const commentsByPost = new Map<string, CommentRow[]>()
  for (const comment of comments) commentsByPost.set(comment.postId, [...(commentsByPost.get(comment.postId) ?? []), comment])

  for (const post of posts) {
    const plan = planPostEngagement(post.id)
    const start = post.publishedAt.getTime()
    const others = operators.filter((id) => id !== post.authorId)

    // Likes: as many operator likes as are due by now.
    const liked = new Set(post.likes.map((like) => like.userId))
    const operatorLikes = post.likes.filter((like) => isOperator.has(like.userId)).length
    const dueLikes = plan.likes.filter((at) => start + at <= nowMs)
    const likers = seededOrder(others, `like:${post.id}`).filter((id) => !liked.has(id)).slice(0, Math.max(0, dueLikes.length - operatorLikes))
    for (const [index, userId] of likers.entries()) {
      const createdAt = new Date(Math.min(nowMs, start + dueLikes[operatorLikes + index]))
      const created = await prisma.postLike.createMany({ data: [{ postId: post.id, userId, createdAt }], skipDuplicates: true })
      if (!created.count) continue
      await prisma.post.update({ where: { id: post.id }, data: { likeCount: { increment: created.count } } })
      await markPostViewed(userId, post.id)
      result.likes += 1
    }

    const postComments = commentsByPost.get(post.id) ?? []
    const roots = postComments.filter((comment) => comment.parentId === null)

    // Comments by other operator accounts, one each.
    const commented = new Set(postComments.map((comment) => comment.authorId))
    const operatorRoots = roots.filter((comment) => comment.authorId !== post.authorId && isOperator.has(comment.authorId)).length
    const dueComments = plan.comments.filter((at) => start + at <= nowMs).length
    if (writeBudget > 0 && dueComments > operatorRoots) {
      const commenter = seededOrder(others, `comment:${post.id}`).find((id) => !commented.has(id))
      if (commenter) {
        writeBudget -= 1
        const written = await commentOnPostAsOperator(WORKER_CONTEXT, { operatorUserId: commenter, postId: post.id, now })
        if (written.ok) result.comments += 1
      }
    }

    for (const comment of postComments) {
      // Only operator content gets answered and liked here.
      if (!isOperator.has(comment.authorId)) continue
      const commentPlan = planCommentEngagement(comment.id, comment.parentId === null)
      const commentStart = comment.createdAt.getTime()
      const due = (at: number | null) => at !== null && commentStart + at <= nowMs
      const thread = postComments.filter((reply) => reply.parentId === comment.id)

      if (comment.parentId === null) {
        // The post's author answers under their own post.
        if (writeBudget > 0 && comment.authorId !== post.authorId && due(commentPlan.authorReply) && !thread.some((reply) => reply.authorId === post.authorId)) {
          writeBudget -= 1
          const written = await replyToCommentAsOperator(WORKER_CONTEXT, { operatorUserId: post.authorId, commentId: comment.id, now })
          if (written.ok) result.replies += 1
        }
        // Another reader joins the thread.
        if (writeBudget > 0 && due(commentPlan.otherReply)) {
          const replier = seededOrder(others.filter((id) => id !== comment.authorId), `reply:${comment.id}`)[0]
          if (replier && !thread.some((reply) => reply.authorId === replier)) {
            writeBudget -= 1
            const written = await replyToCommentAsOperator(WORKER_CONTEXT, { operatorUserId: replier, commentId: comment.id, now })
            if (written.ok) result.replies += 1
          }
        }
      }

      // Likes on the comment: the closest person first, then other readers.
      const close = comment.parentId === null ? post.authorId : postComments.find((root) => root.id === comment.parentId)?.authorId ?? null
      const wanted: Array<{ userId: string; at: number }> = []
      if (close && close !== comment.authorId && isOperator.has(close) && due(commentPlan.closeLike)) wanted.push({ userId: close, at: commentPlan.closeLike! })
      const readers = seededOrder(operators.filter((id) => id !== comment.authorId && id !== close), `comment-like:${comment.id}`)
      commentPlan.otherLikes.forEach((at, index) => {
        if (readers[index] && due(at)) wanted.push({ userId: readers[index], at })
      })
      const likedComment = new Set(comment.likes.map((like) => like.userId))
      for (const like of wanted) {
        if (likedComment.has(like.userId)) continue
        const createdAt = new Date(Math.min(nowMs, commentStart + like.at))
        const created = await prisma.postCommentLike.createMany({ data: [{ commentId: comment.id, userId: like.userId, createdAt }], skipDuplicates: true })
        if (!created.count) continue
        await prisma.postComment.update({ where: { id: comment.id }, data: { likeCount: { increment: created.count } } })
        result.commentLikes += 1
      }
    }
  }
  return result
}
