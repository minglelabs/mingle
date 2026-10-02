import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AdminContext } from '@/server/admin/guard'

/** Every action written to app_admin_audit_logs (contract §2). */
export type AdminAuditAction =
  | 'admin.login'
  | 'admin.login_failed'
  | 'admin.logout'
  | 'operator.create'
  | 'operator.update'
  | 'operator.avatar'
  | 'operator_post.batch_create'
  | 'operator_post.cancel'
  | 'operator_post.published'
  | 'inbox.open'
  | 'inbox.reply'
  | 'inbox.mark_read'
  | 'activity.mark_read'
  | 'activity.comment'
  | 'notify_target.add'
  | 'notify_target.remove'

export type AdminAuditEntry = {
  action: AdminAuditAction
  /** The operator account acted as or on, if any. */
  operatorUserId?: string | null
  /** What was touched, e.g. 'conversation' / 'post' / 'message' / 'batch'. */
  targetType?: string | null
  targetId?: string | null
  metadata?: Prisma.InputJsonValue | null
}

/**
 * Appends one row to the admin audit log. Never throws: a failed write is
 * logged as `[admin-audit] write_failed` (action and error name only, never
 * the metadata, which can hold users' message text) and the admin action
 * carries on. Pass the context from `requireAdmin` / `requireAdminApi`; null
 * (no session, e.g. a failed login) records neither session nor ip.
 */
export async function writeAdminAudit(ctx: AdminContext | null, entry: AdminAuditEntry): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        sessionId: ctx?.sessionId ?? null,
        ip: ctx?.ip ?? null,
        action: entry.action,
        operatorUserId: entry.operatorUserId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ...(entry.metadata === undefined || entry.metadata === null ? {} : { metadata: entry.metadata }),
      },
    })
  } catch (error) {
    console.error('[admin-audit] write_failed', {
      action: entry?.action ?? null,
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}
