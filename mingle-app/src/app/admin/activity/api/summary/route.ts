import { requireAdminApi } from '@/server/admin/guard'
import { countOperatorActivityUnread } from '@/server/operator-activity/activity'
import { inboxJson } from '../../../inbox/api/_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `{ unreadTotal }` for the admin tab bar's 알림 badge. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  return inboxJson({ unreadTotal: await countOperatorActivityUnread() })
}
