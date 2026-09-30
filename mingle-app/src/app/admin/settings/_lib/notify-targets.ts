import { prisma } from '@/lib/prisma'
import { isAnonymousTrackingHandle, normalizeHandle } from '@/lib/handles'
import { resolveAccountStatus } from '@/server/account-status'
import type { AdminContext } from '@/server/admin/guard'
import { writeAdminAudit } from '@/server/admin/audit'
import { identityBadgeFlags, USER_IDENTITY_SELECT, type IdentityBadgeFlags } from '@/server/identity/user-identity-select'

/**
 * Staff notification targets (app_admin_notify_targets): a staff member's OWN
 * Mingle account, whose devices receive an `operator_inbox_message` push when
 * a user writes to an operator account (see notifyOperatorInboxActivity).
 */
export type AdminNotifyTargetDto = {
  userId: string
  handle: string
  name: string | null
  image: string | null
  imageCropScale: number | null
  imageCropX: number | null
  imageCropY: number | null
  /** False once the account is deactivated, withdrawn or deleted: it gets no alerts. */
  active: boolean
  /** Devices currently registered for push on this account. */
  deviceCount: number
  createdAt: string
} & IdentityBadgeFlags

export type AddNotifyTargetError =
  | 'invalid_handle'
  | 'not_found'
  | 'operator_account'
  | 'inactive_account'
  | 'guest_account'

export type AddNotifyTargetResult =
  | { ok: true; added: boolean; targets: AdminNotifyTargetDto[] }
  | { ok: false; error: AddNotifyTargetError }

export type RemoveNotifyTargetResult =
  | { ok: true; removed: boolean; targets: AdminNotifyTargetDto[] }
  | { ok: false; error: 'invalid_user_id' }

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

const TARGET_USER_SELECT = {
  ...USER_IDENTITY_SELECT,
  isActive: true,
  isDeleted: true,
  deactivatedAt: true,
  withdrawnAt: true,
  deletedAt: true,
  _count: { select: { pushTokens: true } },
} as const

/** Every target, oldest first. */
export async function listAdminNotifyTargets(): Promise<AdminNotifyTargetDto[]> {
  const rows = await prisma.adminNotifyTarget.findMany({
    orderBy: { createdAt: 'asc' },
    select: { userId: true, createdAt: true, user: { select: TARGET_USER_SELECT } },
  })
  return rows.map(({ userId, createdAt, user }) => ({
    userId,
    handle: user.handle,
    name: user.name,
    image: user.image,
    imageCropScale: user.imageCropScale,
    imageCropX: user.imageCropX,
    imageCropY: user.imageCropY,
    ...identityBadgeFlags(user),
    active: !user.isOperator && resolveAccountStatus(user) === 'active',
    deviceCount: user._count.pushTokens,
    createdAt: createdAt.toISOString(),
  }))
}

/** `@mina`, ` Mina ` and `mina` all name the handle `mina`; null when it cannot be a handle. */
export function parseTargetHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const normalized = normalizeHandle(raw.trim().replace(/^@+/, ''))
  return normalized.valid && normalized.value ? normalized.value : null
}

/**
 * Adds the account with this @handle. Only an active, signed-up, non-operator
 * account qualifies: operator accounts never get push tokens, and a guest
 * (anon_) account cannot be signed into on a staff phone. Adding an existing
 * target is a no-op (`added: false`).
 */
export async function addAdminNotifyTarget(ctx: AdminContext, rawHandle: unknown): Promise<AddNotifyTargetResult> {
  const handle = parseTargetHandle(rawHandle)
  if (!handle) return { ok: false, error: 'invalid_handle' }

  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      id: true,
      handle: true,
      isOperator: true,
      isActive: true,
      isDeleted: true,
      deactivatedAt: true,
      withdrawnAt: true,
      deletedAt: true,
    },
  })
  if (!user) return { ok: false, error: 'not_found' }
  if (user.isOperator) return { ok: false, error: 'operator_account' }
  if (resolveAccountStatus(user) !== 'active') return { ok: false, error: 'inactive_account' }
  if (isAnonymousTrackingHandle(user.handle)) return { ok: false, error: 'guest_account' }

  let added = false
  try {
    await prisma.adminNotifyTarget.create({ data: { userId: user.id, createdBySessionId: ctx.sessionId } })
    added = true
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
  }
  if (added) {
    await writeAdminAudit(ctx, {
      action: 'notify_target.add',
      targetType: 'user',
      targetId: user.id,
      metadata: { handle: user.handle },
    })
  }
  return { ok: true, added, targets: await listAdminNotifyTargets() }
}

/** Removes a target by user id. Removing one that is not there is a no-op (`removed: false`). */
export async function removeAdminNotifyTarget(ctx: AdminContext, rawUserId: unknown): Promise<RemoveNotifyTargetResult> {
  const userId = typeof rawUserId === 'string' ? rawUserId.trim() : ''
  if (!USER_ID_PATTERN.test(userId)) return { ok: false, error: 'invalid_user_id' }

  const target = await prisma.adminNotifyTarget.findUnique({
    where: { userId },
    select: { user: { select: { handle: true } } },
  })
  const { count } = await prisma.adminNotifyTarget.deleteMany({ where: { userId } })
  if (count > 0) {
    await writeAdminAudit(ctx, {
      action: 'notify_target.remove',
      targetType: 'user',
      targetId: userId,
      ...(target?.user.handle ? { metadata: { handle: target.user.handle } } : {}),
    })
  }
  return { ok: true, removed: count > 0, targets: await listAdminNotifyTargets() }
}
