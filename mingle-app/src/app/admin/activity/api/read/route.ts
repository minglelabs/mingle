import { requireAdminApi } from '@/server/admin/guard'
import { markOperatorActivityRead, normalizeActivityId } from '@/server/operator-activity/activity'
import { inboxError, inboxJson, readInboxJsonBody } from '../../../inbox/api/_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST `{ operatorUserId?, postId?, before? }`: marks operator activity read
 * (all of it, one operator's, or one post's) up to `before`, the
 * `readBefore` of the list read, so later arrivals stay unread.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = (await readInboxJsonBody(request)) ?? {}
  const operatorUserId = body.operatorUserId == null ? null : normalizeActivityId(body.operatorUserId)
  if (body.operatorUserId != null && !operatorUserId) return inboxError('invalid_operator', 400)
  const postId = body.postId == null ? null : normalizeActivityId(body.postId)
  if (body.postId != null && !postId) return inboxError('invalid_post', 400)
  const beforeMs = typeof body.before === 'string' ? Date.parse(body.before) : Number.NaN

  const updatedCount = await markOperatorActivityRead(auth.ctx, {
    operatorUserId,
    postId,
    before: Number.isFinite(beforeMs) ? new Date(beforeMs) : null,
  })
  return inboxJson({ updatedCount })
}
