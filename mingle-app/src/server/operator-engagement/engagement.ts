import { HAMZZI_USER_ID } from '@/lib/hamzzi'
import { prisma } from '@/lib/prisma'
import { ROYCE_USER_ID } from '@/lib/signup-welcome-onboarding'
import { createPostNotification } from '@/server/notifications/create-post-notification'
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
 * accounts act. A real person's comment on an operator post gets its own plan
 * (`planRealCommentEngagement`): the operator it was left for likes about a
 * third of them and, now and then, answers it (Claude Sonnet 5.5, `operator-comments/generate.ts`).
 * Comments and replies are AI-written, so each run writes at most a few.
 *
 * A real person's own post gets a plan too (`planRealPostEngagement`): a
 * first like within minutes, more over the day (a photo more than text), and
 * up to two comments (three on a photo), hours apart, from operators who
 * already talked with that person first, else ones writing its language.
 */

const HOUR_MS = 60 * 60_000
const MINUTE_MS = 60_000
/** Posts and comments get reactions for this long after they go up. */
export const ENGAGEMENT_WINDOW_MS = 4 * 24 * HOUR_MS
/** AI-written comments and replies per run; the rest wait for the next run. */
const MAX_WRITTEN_PER_RUN = 2
/** Replies to real people's comments per run, on top of `MAX_WRITTEN_PER_RUN`. */
const MAX_REAL_REPLIES_PER_RUN = 3
/** Comments on real people's posts per run, on top of the above. */
const MAX_REAL_POST_COMMENTS_PER_RUN = 1
/** Real people's posts get operator reactions for this long after they go up. */
export const REAL_POST_WINDOW_MS = 3 * 24 * HOUR_MS
/** Team accounts whose posts are not real people's (sign-up auto-follows, the mascot). */
const TEAM_USER_IDS = [ROYCE_USER_ID, HAMZZI_USER_ID]

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

/** What a post draws: photos more than text, a striking face (미남미녀) a lot more (staff, 2026-11-23). */
export type PostAppeal = { photo: boolean; attractive: boolean }

/** Likes: `likesMin` plus up to `likesSpread` more (higher `skew`: big counts rarer). Comments: weights for 0, 1, 2… */
const APPEAL_REACTIONS: Record<'text' | 'photo' | 'attractiveText' | 'attractivePhoto', { likesMin: number; likesSpread: number; skew: number; comments: readonly number[] }> = {
  text: { likesMin: 1, likesSpread: 11, skew: 1.8, comments: [40, 35, 17, 6, 2] },
  photo: { likesMin: 1, likesSpread: 24, skew: 1.7, comments: [22, 36, 25, 12, 5] },
  attractiveText: { likesMin: 3, likesSpread: 24, skew: 1.5, comments: [18, 32, 27, 14, 6, 3] },
  attractivePhoto: { likesMin: 8, likesSpread: 40, skew: 1.3, comments: [4, 12, 20, 20, 16, 12, 8, 5, 3] },
}

/** How a post's reactions build up. */
export function planPostEngagement(postId: string, appeal: PostAppeal = { photo: true, attractive: false }): PostEngagementPlan {
  const random = seededRandom(`engage-post:${postId}`)
  const shape = APPEAL_REACTIONS[appeal.attractive ? (appeal.photo ? 'attractivePhoto' : 'attractiveText') : appeal.photo ? 'photo' : 'text']
  // A photo post by an ordinary account: 1-24 likes, most around 6-10.
  const likeCount = shape.likesMin + Math.floor(shape.likesSpread * random() ** shape.skew)
  const likes = Array.from({ length: likeCount }, () => delay(random, 3 * MINUTE_MS, 36 * HOUR_MS)).sort((a, b) => a - b)
  const commentCount = weightedCount(random, shape.comments)
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

export type RealCommentEngagementPlan = {
  /** The operator the comment was left for likes it after this delay (null: no like, ~65%). */
  like: number | null
  /** That operator answers it after this delay (null: no answer). Root comments only. */
  reply: number | null
}

/** Share of real comments the operator likes (liking every one read as staged). */
export const REAL_COMMENT_LIKE_CHANCE = 0.35

/** How a real person's comment on an operator post is liked and answered. */
export function planRealCommentEngagement(commentId: string, isRoot: boolean): RealCommentEngagementPlan {
  const random = seededRandom(`engage-real:${commentId}`)
  const like = delay(random, 3 * MINUTE_MS, 3 * HOUR_MS)
  const replies = random() < 0.6
  const replyAt = delay(random, 10 * MINUTE_MS, 6 * HOUR_MS)
  // Drawn last so the reply rolls stay what they were for existing comments.
  const likes = random() < REAL_COMMENT_LIKE_CHANCE
  return { like: likes ? like : null, reply: isRoot && replies ? replyAt : null }
}

export type RealPostEngagementPlan = {
  /** Delays after publishing, ascending: one operator comment each (0-2, hours apart). */
  comments: number[]
  /** Delays after publishing, ascending: one operator like each. */
  likes: number[]
}

/** Real posts: likes `likesMin` plus up to `likesSpread` more (higher `skew`: big counts rarer); comments: weights for 0, 1, 2… */
const REAL_POST_REACTIONS: Record<'text' | 'photo', { likesMin: number; likesSpread: number; skew: number; comments: readonly number[] }> = {
  text: { likesMin: 1, likesSpread: 4, skew: 1.6, comments: [30, 55, 15] },
  photo: { likesMin: 2, likesSpread: 9, skew: 1.4, comments: [10, 45, 33, 12] },
}

/**
 * How a real person's own post is liked and commented on: never the same twice
 * (seeded per post), a photo drawing more than text. The first like comes fast
 * (1-20 minutes), the rest spread over the day; comments come hours apart.
 */
export function planRealPostEngagement(postId: string, options: { photo?: boolean } = {}): RealPostEngagementPlan {
  const random = seededRandom(`engage-real-post:${postId}`)
  const shape = REAL_POST_REACTIONS[options.photo ? 'photo' : 'text']
  const commentCount = weightedCount(random, shape.comments)
  const comments: number[] = []
  let at = delay(random, 25 * MINUTE_MS, 5 * HOUR_MS)
  for (let index = 0; index < commentCount; index += 1) {
    comments.push(at)
    at += delay(random, 90 * MINUTE_MS, 12 * HOUR_MS)
  }
  const likeCount = shape.likesMin + Math.floor((shape.likesSpread + 1) * random() ** shape.skew)
  const first = delay(random, MINUTE_MS, 20 * MINUTE_MS)
  const rest = Array.from({ length: likeCount - 1 }, () => first + delay(random, 4 * MINUTE_MS, 18 * HOUR_MS))
  return { comments, likes: [first, ...rest].sort((a, b) => a - b) }
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

export type EngagementRunResult = {
  likes: number
  comments: number
  replies: number
  commentLikes: number
  realLikes: number
  realReplies: number
  realPostLikes: number
  realPostComments: number
}

type CommentRow = { id: string; postId: string; authorId: string; parentId: string | null; createdAt: Date; likes: Array<{ userId: string }> }

/** One run: adds every reaction that is due and missing on recent operator posts. */
export async function runOperatorEngagement(now: Date = new Date(), options: { maxWritten?: number } = {}): Promise<EngagementRunResult> {
  const result: EngagementRunResult = {
    likes: 0, comments: 0, replies: 0, commentLikes: 0, realLikes: 0, realReplies: 0, realPostLikes: 0, realPostComments: 0,
  }
  let writeBudget = options.maxWritten ?? MAX_WRITTEN_PER_RUN
  const nowMs = now.getTime()
  const since = new Date(nowMs - ENGAGEMENT_WINDOW_MS)

  const operatorRows = await prisma.user.findMany({
    where: { isOperator: true, isActive: true, isDeleted: false, operatorAccount: { reviewState: 'approved' } },
    select: { id: true, primaryLanguages: true },
  })
  const operators = operatorRows.map((user) => user.id)
  if (operators.length === 0) return result
  const isOperator = new Set(operators)
  await engageRealComments(now, isOperator, result)
  await engageRealPosts(now, operatorRows, result)
  if (operators.length < 2) return result

  const posts = await prisma.post.findMany({
    where: { ...visiblePostWhere(null), author: { isOperator: true }, publishedAt: { gte: since, lte: now } },
    orderBy: { publishedAt: 'asc' },
    select: { id: true, authorId: true, publishedAt: true, imageObjectKey: true, likes: { select: { userId: true } } },
  })
  if (posts.length === 0) return result
  // 미남미녀: accounts whose profile photo was drawn with a striking face.
  const striking = new Set((await prisma.operatorAccount.findMany({
    where: { userId: { in: [...new Set(posts.map((post) => post.authorId))] } },
    select: { userId: true, avatarSpec: true },
  })).filter((account) => {
    const spec = account.avatarSpec as { attributes?: { attractiveness?: unknown } } | null
    return spec?.attributes?.attractiveness === 'striking'
  }).map((account) => account.userId))

  const comments: CommentRow[] = await prisma.postComment.findMany({
    where: { postId: { in: posts.map((post) => post.id) }, moderationHiddenAt: null, OR: [{ isDeleted: null }, { isDeleted: false }] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, postId: true, authorId: true, parentId: true, createdAt: true, likes: { select: { userId: true } } },
  })
  const commentsByPost = new Map<string, CommentRow[]>()
  for (const comment of comments) commentsByPost.set(comment.postId, [...(commentsByPost.get(comment.postId) ?? []), comment])

  for (const post of posts) {
    const plan = planPostEngagement(post.id, { photo: Boolean(post.imageObjectKey), attractive: striking.has(post.authorId) })
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

/**
 * Real people's comments on operator posts from the last `ENGAGEMENT_WINDOW_MS`
 * (on a post of any age): a root comment is liked and maybe answered by the
 * post's author; a reply is liked by the operator it answers (else the post's
 * author). Due steps only, and each step at most once, like the rest.
 */
async function engageRealComments(now: Date, isOperator: Set<string>, result: EngagementRunResult): Promise<void> {
  const nowMs = now.getTime()
  let replyBudget = MAX_REAL_REPLIES_PER_RUN
  const comments = await prisma.postComment.findMany({
    where: {
      createdAt: { gte: new Date(nowMs - ENGAGEMENT_WINDOW_MS), lte: now },
      author: { isOperator: false, isDeleted: false },
      post: { ...visiblePostWhere(null), author: { isOperator: true } },
      moderationHiddenAt: null,
      OR: [{ isDeleted: null }, { isDeleted: false }],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, parentId: true, replyToUserId: true, createdAt: true,
      post: { select: { authorId: true } },
      likes: { select: { userId: true } },
      replies: { where: { OR: [{ isDeleted: null }, { isDeleted: false }] }, select: { authorId: true } },
    },
  })
  for (const comment of comments) {
    const plan = planRealCommentEngagement(comment.id, comment.parentId === null)
    const start = comment.createdAt.getTime()
    const operatorId = comment.replyToUserId && isOperator.has(comment.replyToUserId) ? comment.replyToUserId : comment.post.authorId
    if (!isOperator.has(operatorId)) continue

    if (plan.like !== null && start + plan.like <= nowMs && !comment.likes.some((like) => like.userId === operatorId)) {
      const createdAt = new Date(Math.min(nowMs, start + plan.like))
      const created = await prisma.postCommentLike.createMany({ data: [{ commentId: comment.id, userId: operatorId, createdAt }], skipDuplicates: true })
      if (created.count) {
        await prisma.postComment.update({ where: { id: comment.id }, data: { likeCount: { increment: created.count } } })
        result.realLikes += 1
      }
    }

    // Any operator answer in the thread (staff writing by hand included) ends it: no automatic second one.
    if (replyBudget > 0 && plan.reply !== null && start + plan.reply <= nowMs && !comment.replies.some((reply) => reply.authorId === operatorId || isOperator.has(reply.authorId))) {
      replyBudget -= 1
      const written = await replyToCommentAsOperator(WORKER_CONTEXT, { operatorUserId: operatorId, commentId: comment.id, now })
      if (written.ok) result.realReplies += 1
    }
  }
}

/**
 * Real people's own posts from the last `REAL_POST_WINDOW_MS`: the due operator
 * likes (each one notifies the author, like a person's like) and, at most one
 * per run, the due operator comment. Commenters are operators who already
 * talked with the author (notifications either way) first, then operators whose
 * persona writes the post's language, then any other.
 */
async function engageRealPosts(
  now: Date,
  operators: Array<{ id: string; primaryLanguages: string[] }>,
  result: EngagementRunResult,
): Promise<void> {
  const nowMs = now.getTime()
  let commentBudget = MAX_REAL_POST_COMMENTS_PER_RUN
  const isOperator = new Set(operators.map((operator) => operator.id))
  const posts = await prisma.post.findMany({
    where: {
      ...visiblePostWhere(null),
      author: { id: { notIn: TEAM_USER_IDS }, isOperator: { not: true }, isOfficial: { not: true }, isDeleted: { not: true } },
      publishedAt: { gte: new Date(nowMs - REAL_POST_WINDOW_MS), lte: now },
    },
    orderBy: { publishedAt: 'asc' },
    select: {
      id: true, authorId: true, sourceLanguage: true, publishedAt: true, imageObjectKey: true,
      likes: { select: { userId: true } },
      comments: { where: { parentId: null, OR: [{ isDeleted: null }, { isDeleted: false }] }, select: { authorId: true } },
    },
  })
  for (const post of posts) {
    const plan = planRealPostEngagement(post.id, { photo: Boolean(post.imageObjectKey) })
    const start = post.publishedAt.getTime()

    // Likes from operators, in a fixed order per post.
    const liked = new Set(post.likes.map((like) => like.userId))
    const operatorLikes = post.likes.filter((like) => isOperator.has(like.userId)).length
    const dueLikes = plan.likes.filter((at) => start + at <= nowMs)
    const likers = seededOrder([...isOperator], `real-post-like:${post.id}`)
      .filter((id) => !liked.has(id))
      .slice(0, Math.max(0, dueLikes.length - operatorLikes))
    for (const [index, userId] of likers.entries()) {
      const createdAt = new Date(Math.min(nowMs, start + dueLikes[operatorLikes + index]))
      const created = await prisma.postLike.createMany({ data: [{ postId: post.id, userId, createdAt }], skipDuplicates: true })
      if (!created.count) continue
      await prisma.post.update({ where: { id: post.id }, data: { likeCount: { increment: created.count } } })
      await markPostViewed(userId, post.id)
      await createPostNotification({ type: 'post_like', recipientId: post.authorId, actorId: userId, postId: post.id })
      result.realPostLikes += 1
    }

    const commented = new Set(post.comments.map((comment) => comment.authorId))
    const operatorComments = post.comments.filter((comment) => isOperator.has(comment.authorId)).length
    const dueComments = plan.comments.filter((at) => start + at <= nowMs).length
    if (commentBudget <= 0 || dueComments <= operatorComments) continue
    const commenter = (await realPostCommenters(post, operators)).find((id) => !commented.has(id))
    if (!commenter) continue
    commentBudget -= 1
    const written = await commentOnPostAsOperator(WORKER_CONTEXT, { operatorUserId: commenter, postId: post.id, now })
    if (written.ok) result.realPostComments += 1
  }
}

/** Operators in the order they should comment on a real person's post. */
async function realPostCommenters(
  post: { id: string; authorId: string; sourceLanguage: string | null },
  operators: Array<{ id: string; primaryLanguages: string[] }>,
): Promise<string[]> {
  const ids = operators.map((operator) => operator.id)
  const talked = await prisma.userNotification.findMany({
    where: {
      OR: [
        { actorId: post.authorId, recipientId: { in: ids } },
        { recipientId: post.authorId, actorId: { in: ids } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { actorId: true, recipientId: true },
  })
  const known: string[] = []
  for (const row of talked) {
    const id = row.actorId === post.authorId ? row.recipientId : row.actorId
    if (id && !known.includes(id)) known.push(id)
  }
  const language = post.sourceLanguage?.trim().toLowerCase() ?? ''
  const base = language.split('-')[0]
  const sameLanguage = operators
    .filter((operator) => !known.includes(operator.id) && operator.primaryLanguages.some((code) => {
      const value = code.toLowerCase()
      return value === language || (base !== '' && value.split('-')[0] === base)
    }))
    .map((operator) => operator.id)
  const rest = ids.filter((id) => !known.includes(id) && !sameLanguage.includes(id))
  return [...known, ...seededOrder(sameLanguage, `real-post-comment:${post.id}`), ...seededOrder(rest, `real-post-comment:${post.id}`)]
}
