import { NextResponse } from 'next/server'
import { loadUserActivityStats } from '@/server/admin/user-activity-stats'
import { resolveOperatorPostStatsAccess } from '@/server/operator-post-stats/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const USER_ID_PATTERN = /^[\w-]{1,128}$/

function json(payload: object, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: { 'cache-control': 'private, no-store' } })
}

/**
 * GET /admin/api/user-stats?userId= — the staff-only activity report for one
 * account, opened from the app's profile screen (the web view shares the
 * operator tool's cookie). Staff only: an admin session or a staff app
 * account (admin notify target). Operator persona accounts and everyone else
 * get 403 before the id is even read.
 */
export async function GET(request: Request) {
  const access = await resolveOperatorPostStatsAccess()
  if (access?.scope !== 'all') return json({ error: 'forbidden' }, 403)

  const userId = new URL(request.url).searchParams.get('userId')?.trim() ?? ''
  if (!USER_ID_PATTERN.test(userId)) return json({ error: 'invalid_user_id' }, 400)

  const stats = await loadUserActivityStats(userId)
  if (!stats) return json({ error: 'not_found' }, 404)
  return json({ stats })
}
