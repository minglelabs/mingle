import { requireAdminApi } from '@/server/admin/guard'
import { decodeInboxCursor, loadInboxList, normalizeInboxId } from '@/server/operator-inbox/inbox'
import { inboxError, inboxJson } from '../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Inbox rooms, newest first. Query: `operator` (one operator's rooms),
 * `cursor` (next page), `limit` (1-50), `ko=1` (Korean previews for staff).
 * Always also returns the operator chips and `unreadTotal`.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const params = new URL(request.url).searchParams
  const rawOperator = params.get('operator')
  const operatorUserId = rawOperator ? normalizeInboxId(rawOperator) : null
  if (rawOperator && !operatorUserId) return inboxError('invalid_operator', 400)
  const rawCursor = params.get('cursor')
  const cursor = rawCursor ? decodeInboxCursor(rawCursor) : null
  if (rawCursor && !cursor) return inboxError('invalid_cursor', 400)
  const rawLimit = params.get('limit')
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : null

  const result = await loadInboxList({
    operatorUserId,
    cursor,
    limit: Number.isFinite(limit) ? limit : null,
    includeKorean: params.get('ko') === '1',
  })
  return inboxJson(result)
}
