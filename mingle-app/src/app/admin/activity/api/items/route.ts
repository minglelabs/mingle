import { requireAdminApi } from '@/server/admin/guard'
import { loadActivityList, normalizeActivityId } from '@/server/operator-activity/activity'
import { inboxError, inboxJson } from '../../../inbox/api/_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Operator activity, newest first. Query: `operator` (one operator's rows),
 * `cursor` (next page), `limit` (1-100), `ko=1` (Korean comment text for
 * staff). Always also returns the operator chips and `unreadTotal`.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const params = new URL(request.url).searchParams
  const rawOperator = params.get('operator')
  const operatorUserId = rawOperator ? normalizeActivityId(rawOperator) : null
  if (rawOperator && !operatorUserId) return inboxError('invalid_operator', 400)
  const rawCursor = params.get('cursor')
  const cursor = rawCursor ? normalizeActivityId(rawCursor) : null
  if (rawCursor && !cursor) return inboxError('invalid_cursor', 400)
  const rawLimit = params.get('limit')
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : null

  return inboxJson(await loadActivityList({
    operatorUserId,
    cursor,
    limit: Number.isFinite(limit) ? limit : null,
    includeKorean: params.get('ko') === '1',
  }))
}
