import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getAdminContext } from '@/server/admin/guard'

/** `all`: every operator post. `own`: only the posts of that operator account. */
export type OperatorPostStatsAccess = { scope: 'all' } | { scope: 'own'; operatorUserId: string }

/**
 * Who may read operator post stats from the app. The role checks are the
 * ones the post "⋯" menu uses (`/admin/api/app-viewer`): an admin session
 * (the app's web view shares the operator tool's cookie) or a signed-in staff
 * app account (an admin notify target) sees every operator post's stats. A
 * signed-in operator account sees its own posts' stats. Anyone else gets
 * null: no stats, and no hint of which posts are operator posts.
 */
export async function resolveOperatorPostStatsAccess(): Promise<OperatorPostStatsAccess | null> {
  const [admin, session] = await Promise.all([getAdminContext(), getServerSession(getAuthOptions())])
  if (admin) return { scope: 'all' }
  const userId = typeof session?.user?.id === 'string' ? session.user.id.trim() : ''
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isOperator: true, isDeleted: true, adminNotifyTarget: { select: { userId: true } } },
  })
  if (!user || user.isDeleted) return null
  if (user.adminNotifyTarget) return { scope: 'all' }
  if (user.isOperator) return { scope: 'own', operatorUserId: userId }
  return null
}
