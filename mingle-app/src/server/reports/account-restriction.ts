/**
 * Write-side enforcement of the operator "restrict user" moderation action.
 *
 * `restrictUserByModerator` stamps `User.moderationRestrictedAt`; this module is
 * the single place posting write APIs read it. A restricted account can still
 * read, delete/archive/hide its own content, unlike, and report (reporting is a
 * safety channel and stays open), but it cannot publish or amplify anything:
 * post create/update/restore, comment create/update, likes, drafts and post
 * image upload all answer 403 `{ error: 'account_restricted' }`.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** Stable error code the client branches on to show the restriction notice. */
export const ACCOUNT_RESTRICTED_ERROR = 'account_restricted' as const

export async function isAccountRestricted(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { moderationRestrictedAt: true },
  })
  return Boolean(user?.moderationRestrictedAt)
}

/**
 * Returns a 403 response when the user is restricted, otherwise null. Call it
 * right after authentication in every posting write handler:
 *
 *   const restricted = await accountRestrictionGuard(userId)
 *   if (restricted) return restricted
 */
export async function accountRestrictionGuard(userId: string): Promise<NextResponse | null> {
  if (!(await isAccountRestricted(userId))) return null
  return NextResponse.json(
    { error: ACCOUNT_RESTRICTED_ERROR },
    { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
