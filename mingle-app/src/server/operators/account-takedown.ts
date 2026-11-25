import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { frontOfReviewRank } from '@/server/operator-automation/worker'

export type AccountTakedownResult = { ok: true; state: 'review' | 'approved' } | { ok: false; error: 'not_found' }

/**
 * 내리고 검토로 for an operator account (staff, 2026-11-25), as for a post:
 * the account goes back to the front of the review tab and stops being live
 * (no automatic posts, replies or likes) until staff approve it there again.
 * Its profile and published posts stay as they are.
 */
export async function sendAccountBackToReview(ctx: AdminContext, userId: string): Promise<AccountTakedownResult> {
  const account = await prisma.operatorAccount.findFirst({ where: { userId, user: { isOperator: true, isDeleted: false } }, select: { userId: true } })
  if (!account) return { ok: false, error: 'not_found' }
  const reviewRank = await frontOfReviewRank()
  await prisma.$transaction([
    prisma.operatorAccount.update({ where: { userId }, data: { reviewState: 'pending', reviewRank } }),
    prisma.user.update({ where: { id: userId }, data: { isActive: false } }),
  ])
  await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'back_to_review' } })
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
  await writeAdminAudit(ctx, { action: 'operator.review', operatorUserId: userId, targetType: 'user', targetId: userId, metadata: { decision: 'restore_from_card' } })
  return { ok: true, state: 'approved' }
}
