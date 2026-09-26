/**
 * Operator moderation actions for the reports admin console.
 *
 * The visibility modules (post/comment/block-visibility) already exclude any
 * row whose `moderationHiddenAt` is set and any author whose
 * `moderationHiddenAt` is set, so "make it disappear everywhere" is exactly
 * "stamp moderationHiddenAt". These actions only set/clear those stamps plus
 * the user restriction flag — they never touch a user's OWN hide/archive/delete
 * state, which is the whole point of the unhide contract below.
 *
 * Unhide contract (task item 5): an operator can only restore what was PUBLIC
 * before the action. A post the author had themselves archived or trashed must
 * stay gone. We therefore clear `moderationHiddenAt` ONLY on posts/comments
 * that are otherwise visible (not deleted, and — for posts — still `public`),
 * leaving author-hidden content hidden.
 */

import type { Prisma, PrismaClient } from '@prisma/client'

export const REPORT_TARGET_TYPES = ['user', 'post', 'comment'] as const
export type ModerationTargetType = (typeof REPORT_TARGET_TYPES)[number]

export const REPORT_STATUSES = ['open', 'in_review', 'resolved', 'rejected'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

/** Actions an operator can take on a report's target. */
export const MODERATION_ACTIONS = [
  'hide_content',
  'unhide_content',
  'hide_user',
  'unhide_user',
  'restrict_user',
  'unrestrict_user',
] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]

type TxClient = Prisma.TransactionClient | PrismaClient

/**
 * Hide one post from everyone until an operator unhides it. Idempotent: an
 * already-hidden post keeps its original timestamp.
 */
export async function hidePostByModerator(tx: TxClient, postId: string): Promise<void> {
  await tx.post.updateMany({
    where: { id: postId, moderationHiddenAt: null },
    data: { moderationHiddenAt: new Date() },
  })
}

/**
 * Un-hide a post — but ONLY if it is otherwise public and not deleted, so a
 * post the author archived/trashed while it was moderation-hidden stays gone.
 */
export async function unhidePostByModerator(tx: TxClient, postId: string): Promise<void> {
  await tx.post.updateMany({
    where: {
      id: postId,
      moderationHiddenAt: { not: null },
      visibility: 'public',
      OR: [{ isDeleted: null }, { isDeleted: false }],
    },
    data: { moderationHiddenAt: null },
  })
}

export async function hideCommentByModerator(tx: TxClient, commentId: string): Promise<void> {
  await tx.postComment.updateMany({
    where: { id: commentId, moderationHiddenAt: null },
    data: { moderationHiddenAt: new Date() },
  })
}

/** Un-hide a comment only if it is not soft-deleted by its author. */
export async function unhideCommentByModerator(tx: TxClient, commentId: string): Promise<void> {
  await tx.postComment.updateMany({
    where: {
      id: commentId,
      moderationHiddenAt: { not: null },
      OR: [{ isDeleted: null }, { isDeleted: false }],
    },
    data: { moderationHiddenAt: null },
  })
}

/**
 * Hide a user everywhere (feed, profile, search, comments) until an operator
 * unhides them. Their own content stays in the DB; visibleAuthorWhere filters
 * it out for everyone else.
 */
export async function hideUserByModerator(tx: TxClient, userId: string): Promise<void> {
  await tx.user.updateMany({
    where: { id: userId, moderationHiddenAt: null },
    data: { moderationHiddenAt: new Date() },
  })
}

export async function unhideUserByModerator(tx: TxClient, userId: string): Promise<void> {
  await tx.user.updateMany({
    where: { id: userId, moderationHiddenAt: { not: null } },
    data: { moderationHiddenAt: null },
  })
}

/** Flag a repeat-abuse account as restricted (write-side guards read this). */
export async function restrictUserByModerator(tx: TxClient, userId: string): Promise<void> {
  await tx.user.updateMany({
    where: { id: userId, moderationRestrictedAt: null },
    data: { moderationRestrictedAt: new Date() },
  })
}

export async function unrestrictUserByModerator(tx: TxClient, userId: string): Promise<void> {
  await tx.user.updateMany({
    where: { id: userId, moderationRestrictedAt: { not: null } },
    data: { moderationRestrictedAt: null },
  })
}

export function isValidReportStatus(value: string): value is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(value)
}

export function isValidModerationAction(value: string): value is ModerationAction {
  return (MODERATION_ACTIONS as readonly string[]).includes(value)
}

/** A resolved/rejected status closes a report and should notify the reporter. */
export function isClosingStatus(status: ReportStatus): boolean {
  return status === 'resolved' || status === 'rejected'
}

export const MIN_REPORT_REPLY_LENGTH = 2
export const MAX_REPORT_REPLY_LENGTH = 4000

/**
 * Normalise an operator reply body: trimmed and capped at 4000 chars, or null
 * when it does not meet the 2-char minimum. Shared so the admin action and its
 * test agree on the exact rule.
 */
export function normalizeReportReply(value: string): string | null {
  const message = value.trim().slice(0, MAX_REPORT_REPLY_LENGTH)
  return message.length >= MIN_REPORT_REPLY_LENGTH ? message : null
}

/**
 * Posting a reply nudges an untouched (`open`) report to `in_review`, but never
 * reopens a report an operator already closed (resolved / rejected) or one
 * already in review.
 */
export function shouldAdvanceOnReply(currentStatus: string): boolean {
  return currentStatus === 'open'
}

// ─── Admin console read helpers (reported-content preview) ───────────────────

export const REPORT_CONTENT_EXCERPT_LENGTH = 280

/** A one-glance excerpt of reported text: whitespace collapsed, capped with "…". */
export function reportContentExcerpt(text: string | null | undefined, max: number = REPORT_CONTENT_EXCERPT_LENGTH): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim()
  if (collapsed.length <= max) return collapsed
  return `${collapsed.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export type ReportedContentState = {
  moderationHiddenAt: Date | null
  isDeleted: boolean | null
}

/**
 * The one content action that makes sense for the target's CURRENT state:
 * hidden -> offer unhide, visible -> offer hide, missing/deleted -> none.
 * The console shows only this button instead of both.
 */
export function contentModerationToggle(target: ReportedContentState | null): 'hide_content' | 'unhide_content' | null {
  if (!target) return null
  if (target.moderationHiddenAt) return 'unhide_content'
  if (target.isDeleted === true) return null
  return 'hide_content'
}
