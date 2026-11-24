import { prisma } from '@/lib/prisma'
import { writeAdminAudit } from '@/server/admin/audit'
import type { AdminContext } from '@/server/admin/guard'
import { resolveInboxRoomAccess, type InboxRoomAccessError } from '@/server/operator-inbox/inbox'
import { createReport, type ReportReason } from '@/server/reports/report-service'
import { blockUser, unblockUser } from '@/server/user-blocks'

/**
 * Staff block, unblock or report the other person in an inbox room AS the
 * operator account, exactly as a user does from the app (same block row and
 * follow removal, same report service and dedup). Only a counterpart of this
 * room; never another operator. Audited (staff, 2026-11-24).
 */
export type InboxModerationError = InboxRoomAccessError | 'operator_required' | 'not_counterpart'

async function resolveCounterpart(args: { conversationId: string; operatorUserId: string | null; counterpartUserId: string }) {
  const access = await resolveInboxRoomAccess({
    conversationId: args.conversationId,
    operatorUserId: args.operatorUserId,
    requireExplicitOperator: true,
  })
  if (!access.ok) return access
  if (!access.room.counterparts.some((person) => person.userId === args.counterpartUserId)) {
    return { ok: false as const, error: 'not_counterpart' as const }
  }
  return { ok: true as const, room: access.room }
}

export async function setInboxCounterpartBlocked(args: {
  ctx: AdminContext
  conversationId: string
  operatorUserId: string | null
  counterpartUserId: string
  blocked: boolean
}): Promise<{ ok: true; blocked: boolean } | { ok: false; error: InboxModerationError }> {
  const resolved = await resolveCounterpart(args)
  if (!resolved.ok) return resolved
  const operatorUserId = resolved.room.operator.userId
  if (args.blocked) await blockUser(operatorUserId, args.counterpartUserId)
  else await unblockUser(operatorUserId, args.counterpartUserId)
  await writeAdminAudit(args.ctx, {
    action: args.blocked ? 'inbox.block' : 'inbox.unblock',
    operatorUserId,
    targetType: 'user',
    targetId: args.counterpartUserId,
    metadata: { conversationId: resolved.room.conversationId },
  })
  return { ok: true, blocked: args.blocked }
}

export async function reportInboxCounterpart(args: {
  ctx: AdminContext
  conversationId: string
  operatorUserId: string | null
  counterpartUserId: string
  reason: ReportReason
  message: string | null
}): Promise<{ ok: true; status: 'reported' | 'already_reported' } | { ok: false; error: InboxModerationError }> {
  const resolved = await resolveCounterpart(args)
  if (!resolved.ok) return resolved
  const operatorUserId = resolved.room.operator.userId
  const result = await createReport(prisma, {
    reporterId: operatorUserId,
    reportedUserId: args.counterpartUserId,
    targetType: 'user',
    reason: args.reason,
    message: args.message,
  })
  const status = result.status === 'duplicate' ? 'already_reported' as const : 'reported' as const
  await writeAdminAudit(args.ctx, {
    action: 'inbox.report',
    operatorUserId,
    targetType: 'user',
    targetId: args.counterpartUserId,
    metadata: { conversationId: resolved.room.conversationId, reason: args.reason, status },
  })
  return { ok: true, status }
}
