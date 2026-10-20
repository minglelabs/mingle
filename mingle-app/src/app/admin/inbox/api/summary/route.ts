import { requireAdminApi } from '@/server/admin/guard'
import { countOperatorInboxUnread } from '@/server/operator-inbox/inbox'
import { inboxJson } from '../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `{ unreadTotal }` for the admin tab bar's inbox badge. */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  return inboxJson({ unreadTotal: await countOperatorInboxUnread() })
}
