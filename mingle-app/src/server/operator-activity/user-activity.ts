import type { Prisma } from '@prisma/client'
import { HAMZZI_USER_ID } from '@/lib/hamzzi'
import { prisma } from '@/lib/prisma'
import { ROYCE_USER_ID } from '@/lib/signup-welcome-onboarding'
import { USER_IDENTITY_SELECT } from '@/server/identity/user-identity-select'
import { STAFF_TRANSLATION_LANGUAGE } from '@/server/operator-inbox/staff-translate'
import { clipActivityText, storedCommentKorean, toActivityPerson, type ActivityItem } from './activity'

/**
 * Real users' activity that never reaches an operator account's notification
 * center: their own posts, comments on other real users' posts, likes of real
 * users' posts and comments, and follows of real users. Read straight from the
 * source tables, so it covers history too. Anything addressed to an operator is
 * left out here because the operator notification feed already lists it.
 *
 * Read state is one staff-wide instant (AdminSetting USER_ACTIVITY_READ_KEY):
 * rows after it are unread.
 */
export const USER_ACTIVITY_TYPES = ['user_post', 'user_comment', 'user_post_like', 'user_comment_like', 'user_follow'] as const
export type UserActivityType = (typeof USER_ACTIVITY_TYPES)[number]

/** `operator` filter value that selects this feed. */
export const USER_ACTIVITY_FILTER = 'users'

const USER_ACTIVITY_READ_KEY = 'activity_user_read_before'
// Before this feed shipped nobody could read it: start everything older as read.
const USER_ACTIVITY_READ_FALLBACK = new Date('2026-11-22T00:00:00.000Z')

// The team's own accounts (Royce, Hamzzi and other official ones) are left out both
// ways: every sign-up follows them and they follow back automatically
// (signup-welcome-onboarding.ts), which would bury real activity.
const TEAM_USER_IDS = [ROYCE_USER_ID, HAMZZI_USER_ID]
const REAL_USER: Prisma.UserWhereInput = {
  id: { notIn: TEAM_USER_IDS },
  isOperator: { not: true },
  isOfficial: { not: true },
  isDeleted: { not: true },
}
const NOT_OPERATOR: Prisma.UserWhereInput = { isOperator: { not: true } }
const NOT_STAFF: Prisma.UserWhereInput = { id: { notIn: TEAM_USER_IDS }, isOperator: { not: true }, isOfficial: { not: true } }

const POST_SELECT = {
  id: true,
  authorId: true,
  sourceText: true,
  isDeleted: true,
  moderationHiddenAt: true,
  archivedAt: true,
  visibility: true,
  author: { select: USER_IDENTITY_SELECT },
} satisfies Prisma.PostSelect

const COMMENT_SELECT = {
  id: true,
  postId: true,
  sourceText: true,
  sourceLanguage: true,
  bodyVersion: true,
  imageObjectKey: true,
  isDeleted: true,
  moderationHiddenAt: true,
  author: { select: USER_IDENTITY_SELECT },
  translations: {
    where: { status: 'ready', language: STAFF_TRANSLATION_LANGUAGE },
    select: { bodyVersion: true, text: true },
  },
  post: { select: POST_SELECT },
} satisfies Prisma.PostCommentSelect

type PostRow = Prisma.PostGetPayload<{ select: typeof POST_SELECT }>
type CommentRow = Prisma.PostCommentGetPayload<{ select: typeof COMMENT_SELECT }>

type TimeWindow = { olderThan?: Date; upTo?: Date }

function createdAtWhere(window: TimeWindow): { createdAt?: { lt?: Date; lte?: Date } } {
  if (!window.olderThan && !window.upTo) return {}
  return { createdAt: { ...(window.olderThan ? { lt: window.olderThan } : {}), ...(window.upTo ? { lte: window.upTo } : {}) } }
}

// Who each source's rows come from, and what is left to the operator feed.
const WHERE = {
  post: (): Prisma.PostWhereInput => ({ author: REAL_USER }),
  comment: (): Prisma.PostCommentWhereInput => ({
    author: REAL_USER,
    post: { author: NOT_OPERATOR },
    OR: [{ parentId: null }, { parent: { author: NOT_OPERATOR } }],
  }),
  postLike: (): Prisma.PostLikeWhereInput => ({ user: REAL_USER, post: { author: NOT_OPERATOR } }),
  commentLike: (): Prisma.PostCommentLikeWhereInput => ({ user: REAL_USER, comment: { author: NOT_OPERATOR } }),
  follow: (): Prisma.UserFollowWhereInput => ({ follower: REAL_USER, following: NOT_STAFF }),
}

function postUnavailable(post: PostRow | null): boolean {
  return !post || post.isDeleted === true || post.moderationHiddenAt !== null || post.archivedAt !== null || post.visibility !== 'public'
}

function commentFields(comment: CommentRow | null) {
  const unavailable = !comment || comment.isDeleted === true || comment.moderationHiddenAt !== null
  const visible = comment && !unavailable ? comment : null
  return {
    commentId: comment?.id ?? null,
    commentText: visible ? visible.sourceText.trim() || null : null,
    commentKoText: visible ? storedCommentKorean(visible) : null,
    commentHasImage: Boolean(visible?.imageObjectKey),
    commentUnavailable: Boolean(comment) && unavailable,
  }
}

function postFields(post: PostRow | null) {
  const unavailable = postUnavailable(post)
  return {
    postId: post?.id ?? null,
    postExcerpt: post && !unavailable ? clipActivityText(post.sourceText) : null,
    postUnavailable: Boolean(post) && unavailable,
  }
}

const NO_COMMENT = { commentId: null, commentText: null, commentKoText: null, commentHasImage: false, commentUnavailable: false }

function baseItem(id: string, type: UserActivityType, createdAt: Date, readBefore: Date) {
  return { id, type, createdAt: createdAt.toISOString(), isRead: createdAt.getTime() <= readBefore.getTime(), operator: null }
}

export async function readUserActivityReadBefore(): Promise<Date> {
  const row = await prisma.adminSetting.findUnique({ where: { key: USER_ACTIVITY_READ_KEY }, select: { value: true } })
  const at = (row?.value as { at?: unknown } | null)?.at
  const ms = typeof at === 'string' ? Date.parse(at) : Number.NaN
  return Number.isFinite(ms) ? new Date(ms) : USER_ACTIVITY_READ_FALLBACK
}

/** Newest first, up to `limit` items older than `olderThan` (and not after `upTo`). */
export async function listUserActivity(args: { limit: number } & TimeWindow): Promise<{ items: ActivityItem[]; hasMore: boolean }> {
  const take = args.limit + 1
  const time = createdAtWhere(args)
  const order = { createdAt: 'desc' } as const
  const [readBefore, posts, comments, postLikes, commentLikes, follows] = await Promise.all([
    readUserActivityReadBefore(),
    prisma.post.findMany({ where: { ...WHERE.post(), ...time }, orderBy: order, take, select: { ...POST_SELECT, createdAt: true } }),
    prisma.postComment.findMany({ where: { ...WHERE.comment(), ...time }, orderBy: order, take, select: { ...COMMENT_SELECT, createdAt: true } }),
    prisma.postLike.findMany({
      where: { ...WHERE.postLike(), ...time },
      orderBy: order,
      take,
      select: { id: true, createdAt: true, user: { select: USER_IDENTITY_SELECT }, post: { select: POST_SELECT } },
    }),
    prisma.postCommentLike.findMany({
      where: { ...WHERE.commentLike(), ...time },
      orderBy: order,
      take,
      select: { id: true, createdAt: true, user: { select: USER_IDENTITY_SELECT }, comment: { select: COMMENT_SELECT } },
    }),
    prisma.userFollow.findMany({
      where: { ...WHERE.follow(), ...time },
      orderBy: order,
      take,
      select: { id: true, createdAt: true, follower: { select: USER_IDENTITY_SELECT }, following: { select: USER_IDENTITY_SELECT } },
    }),
  ])

  const items: ActivityItem[] = [
    ...posts.map((row) => ({
      ...baseItem(`up-${row.id}`, 'user_post', row.createdAt, readBefore),
      actor: toActivityPerson(row.author),
      target: null,
      ...postFields(row),
      ...NO_COMMENT,
    })),
    ...comments.map((row) => ({
      ...baseItem(`uc-${row.id}`, 'user_comment', row.createdAt, readBefore),
      actor: toActivityPerson(row.author),
      target: toActivityPerson(row.post.author),
      ...postFields(row.post),
      ...commentFields(row),
    })),
    ...postLikes.map((row) => ({
      ...baseItem(`upl-${row.id}`, 'user_post_like', row.createdAt, readBefore),
      actor: toActivityPerson(row.user),
      target: toActivityPerson(row.post.author),
      ...postFields(row.post),
      ...NO_COMMENT,
    })),
    ...commentLikes.map((row) => ({
      ...baseItem(`ucl-${row.id}`, 'user_comment_like', row.createdAt, readBefore),
      actor: toActivityPerson(row.user),
      target: toActivityPerson(row.comment.author),
      ...postFields(row.comment.post),
      ...commentFields(row.comment),
    })),
    ...follows.map((row) => ({
      ...baseItem(`uf-${row.id}`, 'user_follow', row.createdAt, readBefore),
      actor: toActivityPerson(row.follower),
      target: toActivityPerson(row.following),
      postId: null,
      postExcerpt: null,
      postUnavailable: false,
      ...NO_COMMENT,
    })),
  ]
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  const sourceHasMore = [posts, comments, postLikes, commentLikes, follows].some((rows) => rows.length > args.limit)
  return { items: items.slice(0, args.limit), hasMore: sourceHasMore || items.length > args.limit }
}

export async function countUserActivityUnread(): Promise<number> {
  const readBefore = await readUserActivityReadBefore()
  const after = { createdAt: { gt: readBefore } }
  const counts = await Promise.all([
    prisma.post.count({ where: { ...WHERE.post(), ...after } }),
    prisma.postComment.count({ where: { ...WHERE.comment(), ...after } }),
    prisma.postLike.count({ where: { ...WHERE.postLike(), ...after } }),
    prisma.postCommentLike.count({ where: { ...WHERE.commentLike(), ...after } }),
    prisma.userFollow.count({ where: { ...WHERE.follow(), ...after } }),
  ])
  return counts.reduce((total, count) => total + count, 0)
}

/** Moves the read line forward to `before` (never back). True when it moved. */
export async function markUserActivityRead(before: Date): Promise<boolean> {
  const current = await readUserActivityReadBefore()
  if (before.getTime() <= current.getTime()) return false
  const value = { at: before.toISOString() }
  await prisma.adminSetting.upsert({
    where: { key: USER_ACTIVITY_READ_KEY },
    create: { key: USER_ACTIVITY_READ_KEY, value },
    update: { value },
  })
  return true
}
