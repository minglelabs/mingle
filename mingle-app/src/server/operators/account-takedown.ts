import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import type { Prisma } from '@prisma/client'
import { frontOfReviewRank } from '@/server/operator-automation/worker'

/** Accounts this button hid from the app; only these are shown again on approval (a hide from a report stays). */
const HIDDEN_KEY = 'operator_takedown_hidden'

function hiddenIds(value: unknown): string[] {
  const ids = value && typeof value === 'object' && !Array.isArray(value) ? (value as { ids?: unknown }).ids : null
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

async function changeHidden(tx: Prisma.TransactionClient, update: (ids: string[]) => string[]): Promise<void> {
  await tx.adminSetting.upsert({ where: { key: HIDDEN_KEY }, create: { key: HIDDEN_KEY, value: { ids: [] } }, update: {} })
  await tx.$queryRaw`SELECT key FROM app.app_admin_settings WHERE key = ${HIDDEN_KEY} FOR UPDATE`
  const row = await tx.adminSetting.findUnique({ where: { key: HIDDEN_KEY }, select: { value: true } })
  await tx.adminSetting.update({ where: { key: HIDDEN_KEY }, data: { value: { ids: update(hiddenIds(row?.value)) } } })
}

/**
 * Shows an account this button hid again (its profile, posts and comments),
 * when staff approve it in review or press 다시 올리기. Never throws.
 */
export async function showAccountHiddenByTakedown(userId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.adminSetting.findUnique({ where: { key: HIDDEN_KEY }, select: { value: true } })
      if (!hiddenIds(row?.value).includes(userId)) return
      await tx.user.updateMany({ where: { id: userId, moderationHiddenAt: { not: null } }, data: { moderationHiddenAt: null } })
      await changeHidden(tx, (ids) => ids.filter((id) => id !== userId))
    })
  } catch (error) {
    console.warn('[operator-takedown] show_failed', { userId, error: error instanceof Error ? error.name : 'unknown' })
  }
}

export type AccountTakedownResult = { ok: true; state: 'review' | 'approved' } | { ok: false; error: 'not_found' }

/**
 * 내리고 검토로 for an operator account (staff, 2026-11-25), as for a post:
 * the account goes back to the front of the review tab and stops being live
 * (no automatic posts, replies or likes) until staff approve it there again.
 * Its profile, posts and comments are hidden from the app meanwhile (the
 * moderation hide), unless a report had already hidden the account.
 */
export async function sendAccountBackToReview(ctx: AdminContext, userId: string): Promise<AccountTakedownResult> {
  const account = await prisma.operatorAccount.findFirst({ where: { userId, user: { isOperator: true, isDeleted: false } }, select: { userId: true } })
  if (!account) return { ok: false, error: 'not_found' }
  const reviewRank = await frontOfReviewRank()
  const hidden = await prisma.$transaction(async (tx) => {
    await tx.operatorAccount.update({ where: { userId }, data: { reviewState: 'pending', reviewRank } })
    await tx.user.update({ where: { id: userId }, data: { isActive: false } })
    const hid = await tx.user.updateMany({ where: { id: userId, moderationHiddenAt: null }, data: { moderationHiddenAt: new Date() } })
    if (hid.count) await changeHidden(tx, (ids) => (ids.includes(userId) ? ids : [...ids, userId]))
    return hid.count > 0
  }, { maxWait: 15_000, timeout: 30_000 })
  await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'back_to_review', hidden } })
  return { ok: true, state: 'review' }
}

/** 다시 올리기: the account is approved and live again without going through the review tab. */
export async function restoreAccountFromReview(ctx: AdminContext, userId: string): Promise<AccountTakedownResult> {
  const account = await prisma.operatorAccount.findFirst({ where: { userId, user: { isOperator: true, isDeleted: false } }, select: { userId: true } })
  if (!account) return { ok: false, error: 'not_found' }
  await prisma.$transaction([
    prisma.operatorAccount.update({ where: { userId }, data: { reviewState: 'approved' } }),
    prisma.user.update({ where: { id: userId }, data: { isActive: true } }),
  ])
  await showAccountHiddenByTakedown(userId)
  await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'restore_from_card' } })
  return { ok: true, state: 'approved' }
}
