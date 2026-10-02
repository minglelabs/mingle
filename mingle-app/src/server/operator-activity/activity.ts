import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canonicalizeTranslationLanguageCode } from '@/lib/translation-languages'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { USER_IDENTITY_SELECT, identityBadgeFlags, type UserIdentityRecord } from '@/server/identity/user-identity-select'
import type { InboxPerson } from '@/server/operator-inbox/inbox'
import { STAFF_TRANSLATION_LANGUAGE, translateForStaff } from '@/server/operator-inbox/staff-translate'

/**
 * The unified operator activity feed: every in-app notification (follow,
 * like, comment, reply, comment like) addressed to an operator account, in
 * one list for staff. Operator accounts cannot sign in, so their
 * notification center is only ever read here.
 *
 * Unread for staff = rows with no `readAt` whose actor is a REAL user.
 * Activity between two operator accounts is staff's own doing and is left
 * out of the feed entirely, like operator replies in the inbox unread count.
 */
export const ACTIVITY_PAGE_SIZE = 30
export const ACTIVITY_MAX_PAGE_SIZE = 100
export const ACTIVITY_EXCERPT_MAX_CHARS = 140

export const OPERATOR_ACTIVITY_TYPES = ['follow', 'post_like', 'comment', 'comment_reply', 'comment_like'] as const
export type OperatorActivityType = (typeof OPERATOR_ACTIVITY_TYPES)[number]

const ID_PATTERN = /^[\w-]{1,128}$/

export type ActivityItem = {
  id: string
  type: OperatorActivityType
  isRead: boolean
  createdAt: string
  /** The operator account that received the notification. */
  operator: InboxPerson
  /** The real user who followed / liked / commented. */
  actor: InboxPerson
  postId: string | null
  /** Start of the post's text; null when it has none or the post is gone. */
  postExcerpt: string | null
  /** The post was deleted, hidden or archived: there is no thread to open. */
  postUnavailable: boolean
  /** comment / comment_reply: the actor's new comment. comment_like: the operator's liked comment. */
  commentId: string | null
  commentText: string | null
  /** Korean for staff: a Korean original, a stored `ko` translation, or (when requested) an admin-only translation. */
  commentKoText: string | null
  commentHasImage: boolean
  commentUnavailable: boolean
}

export type ActivityOperatorStat = InboxPerson & {
  isActive: boolean
  itemCount: number
  unreadCount: number
}

export type ActivityListData = {
  items: ActivityItem[]
  nextCursor: string | null
  /** Unread across every operator account. */
  unreadTotal: number
  operators: ActivityOperatorStat[]
  /** Entry snapshot: send it back when marking read so later arrivals stay unread. */
  readBefore: string
  serverNowMs: number
}

export function normalizeActivityId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return ID_PATTERN.test(trimmed) ? trimmed : null
}

function clampPageSize(limit: number | null | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return ACTIVITY_PAGE_SIZE
  return Math.min(ACTIVITY_MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)))
}

export function toActivityPerson(user: UserIdentityRecord): InboxPerson {
  return {
    userId: user.id,
    handle: user.handle ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
    imageCropScale: user.imageCropScale ?? null,
    imageCropX: user.imageCropX ?? null,
    imageCropY: user.imageCropY ?? null,
    ...identityBadgeFlags(user),
  }
}

/** Collapses whitespace and clips to `max` characters (code-point safe). */
export function clipActivityText(raw: string | null | undefined, max = ACTIVITY_EXCERPT_MAX_CHARS): string | null {
  const normalized = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  const characters = Array.from(normalized)
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : normalized
}

/** Rows staff see: addressed to a live operator account, from a real user. */
export function operatorActivityWhere(operatorUserId?: string | null): Prisma.UserNotificationWhereInput {
  return {
    type: { in: [...OPERATOR_ACTIVITY_TYPES] },
    recipient: { isOperator: true, isDeleted: false },
    actor: { isOperator: false },
    ...(operatorUserId ? { recipientId: operatorUserId } : {}),
  }
}

const ACTIVITY_ROW_SELECT = {
  id: true,
  type: true,
  readAt: true,
  createdAt: true,
  postId: true,
  commentId: true,
  recipient: { select: USER_IDENTITY_SELECT },
  actor: { select: USER_IDENTITY_SELECT },
  post: {
    select: {
      sourceText: true,
      isDeleted: true,
      moderationHiddenAt: true,
      archivedAt: true,
      visibility: true,
    },
  },
  comment: {
    select: {
      sourceText: true,
      sourceLanguage: true,
      bodyVersion: true,
      imageObjectKey: true,
      isDeleted: true,
      moderationHiddenAt: true,
      translations: {
        where: { status: 'ready', language: STAFF_TRANSLATION_LANGUAGE },
        select: { bodyVersion: true, text: true },
      },
    },
  },
} satisfies Prisma.UserNotificationSelect

type ActivityRow = Prisma.UserNotificationGetPayload<{ select: typeof ACTIVITY_ROW_SELECT }>

function isKorean(language: string | null | undefined): boolean {
  return (canonicalizeTranslationLanguageCode(language || '') || '') === STAFF_TRANSLATION_LANGUAGE
}

/** Stored Korean for a comment: a Korean original or a ready `ko` translation of the current body. */
export function storedCommentKorean(comment: {
  sourceText: string
  sourceLanguage: string | null
  bodyVersion: number
  translations: Array<{ bodyVersion: number; text: string | null }>
}): string | null {
  if (isKorean(comment.sourceLanguage)) return comment.sourceText.trim() || null
  const ready = comment.translations.find((row) => row.bodyVersion === comment.bodyVersion && row.text?.trim())
  return ready?.text?.trim() ?? null
}

function toActivityItem(row: ActivityRow): ActivityItem {
  const post = row.post
  const postUnavailable = Boolean(row.postId) && (
    !post || post.isDeleted === true || post.moderationHiddenAt !== null || post.archivedAt !== null || post.visibility !== 'public'
  )
  const comment = row.comment
  const commentUnavailable = Boolean(row.commentId) && (!comment || comment.isDeleted === true || comment.moderationHiddenAt !== null)
  const commentVisible = comment && !commentUnavailable ? comment : null
  return {
    id: row.id,
    type: row.type as OperatorActivityType,
    isRead: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
    operator: toActivityPerson(row.recipient),
    actor: toActivityPerson(row.actor),
    postId: row.postId,
    postExcerpt: post && !postUnavailable ? clipActivityText(post.sourceText) : null,
    postUnavailable,
    commentId: row.commentId,
    commentText: commentVisible ? commentVisible.sourceText.trim() || null : null,
    commentKoText: commentVisible ? storedCommentKorean(commentVisible) : null,
    commentHasImage: Boolean(commentVisible?.imageObjectKey),
    commentUnavailable,
  }
}

/** Staff-only cache id of a comment's Korean translation (never collides with a message id). */
export function staffCommentTranslationId(commentId: string, bodyVersion: number): string {
  return `comment-${commentId}-v${bodyVersion}`
}

async function fillKorean(items: ActivityItem[], rows: ActivityRow[]): Promise<void> {
  const requests = new Map<string, { commentId: string; text: string; sourceLanguage: string }>()
  rows.forEach((row, index) => {
    const item = items[index]
    if (!row.comment || !row.commentId || !item.commentText || item.commentKoText) return
    requests.set(staffCommentTranslationId(row.commentId, row.comment.bodyVersion), {
      commentId: row.commentId,
      text: item.commentText,
      sourceLanguage: row.comment.sourceLanguage ?? '',
    })
  })
  if (requests.size === 0) return
  const translated = await translateForStaff(
    [...requests].map(([messageId, request]) => ({ messageId, text: request.text, sourceLanguage: request.sourceLanguage })),
  )
  const koByCommentId = new Map<string, string>()
  for (const [messageId, request] of requests) {
    const text = translated[messageId]
    if (text) koByCommentId.set(request.commentId, text)
  }
  for (const item of items) {
    if (item.commentId && !item.commentKoText) item.commentKoText = koByCommentId.get(item.commentId) ?? null
  }
}

export async function listOperatorActivity(args: {
  operatorUserId?: string | null
  cursor?: string | null
  limit?: number | null
  includeKorean?: boolean
  /** First page only: rows that had arrived by this instant. */
  before?: Date
} = {}): Promise<{ items: ActivityItem[]; nextCursor: string | null }> {
  const limit = clampPageSize(args.limit)
  const rows = await prisma.userNotification.findMany({
    where: {
      ...operatorActivityWhere(args.operatorUserId),
      ...(!args.cursor && args.before ? { createdAt: { lte: args.before } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    take: limit + 1,
    select: ACTIVITY_ROW_SELECT,
  })
  const pageRows = rows.length > limit ? rows.slice(0, limit) : rows
  const items = pageRows.map(toActivityItem)
  if (args.includeKorean) await fillKorean(items, pageRows)
  return {
    items,
    nextCursor: rows.length > limit ? pageRows[pageRows.length - 1]?.id ?? null : null,
  }
}

/** Unread activity across every operator account (the 알림 tab badge). */
export async function countOperatorActivityUnread(): Promise<number> {
  return prisma.userNotification.count({ where: { ...operatorActivityWhere(), readAt: null } })
}

/** One chip per operator account that has activity, most unread first. */
export async function getOperatorActivitySummary(): Promise<{ unreadTotal: number; operators: ActivityOperatorStat[] }> {
  const [totals, unread] = await Promise.all([
    prisma.userNotification.groupBy({ by: ['recipientId'], where: operatorActivityWhere(), _count: { _all: true } }),
    prisma.userNotification.groupBy({
      by: ['recipientId'],
      where: { ...operatorActivityWhere(), readAt: null },
      _count: { _all: true },
    }),
  ])
  if (totals.length === 0) return { unreadTotal: 0, operators: [] }
  const unreadByOperator = new Map(unread.map((row) => [row.recipientId, row._count._all]))
  const users = await prisma.user.findMany({
    where: { id: { in: totals.map((row) => row.recipientId) } },
    select: { ...USER_IDENTITY_SELECT, isActive: true },
  })
  const userById = new Map(users.map((user) => [user.id, user]))
  const operators: ActivityOperatorStat[] = []
  for (const row of totals) {
    const user = userById.get(row.recipientId)
    if (!user) continue
    operators.push({
      ...toActivityPerson(user),
      isActive: user.isActive !== false,
      itemCount: row._count._all,
      unreadCount: unreadByOperator.get(row.recipientId) ?? 0,
    })
  }
  operators.sort((a, b) => (
    b.unreadCount - a.unreadCount
    || b.itemCount - a.itemCount
    || (a.name ?? a.handle ?? '').localeCompare(b.name ?? b.handle ?? '')
  ))
  return {
    unreadTotal: operators.reduce((total, operator) => total + operator.unreadCount, 0),
    operators,
  }
}

/** First page of the feed plus the operator chips and the unread total, for the list page and its API. */
export async function loadActivityList(args: {
  operatorUserId?: string | null
  cursor?: string | null
  limit?: number | null
  includeKorean?: boolean
} = {}): Promise<ActivityListData> {
  const readBefore = new Date()
  const [list, summary] = await Promise.all([
    listOperatorActivity({ ...args, before: readBefore }),
    getOperatorActivitySummary(),
  ])
  return { ...list, ...summary, readBefore: readBefore.toISOString(), serverNowMs: Date.now() }
}

/**
 * Marks operator activity read: everything (optionally one operator's, or
 * one post's) that had arrived by `before`. Rows from other operators' own
 * actions are marked too, so nothing hidden can stay unread.
 */
export async function markOperatorActivityRead(ctx: AdminContext | null, args: {
  operatorUserId?: string | null
  postId?: string | null
  before?: Date | null
  /** Skip the audit row for an implicit read (e.g. after a reply, which is audited itself). */
  audit?: boolean
} = {}): Promise<number> {
  const now = new Date()
  const before = args.before && args.before.getTime() <= now.getTime() ? args.before : now
  const result = await prisma.userNotification.updateMany({
    where: {
      type: { in: [...OPERATOR_ACTIVITY_TYPES] },
      recipient: { isOperator: true },
      ...(args.operatorUserId ? { recipientId: args.operatorUserId } : {}),
      ...(args.postId ? { postId: args.postId } : {}),
      readAt: null,
      createdAt: { lte: before },
    },
    data: { readAt: now },
  })
  if (args.audit !== false && result.count > 0) {
    await writeAdminAudit(ctx, {
      action: 'activity.mark_read',
      operatorUserId: args.operatorUserId ?? null,
      targetType: args.postId ? 'post' : 'notification',
      targetId: args.postId ?? null,
      metadata: { count: result.count },
    })
  }
  return result.count
}
