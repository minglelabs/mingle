import { requireAdminApi } from '@/server/admin/guard'
import { normalizeActivityId } from '@/server/operator-activity/activity'
import { loadOperatorPostThread } from '@/server/operator-activity/thread'
import { inboxError, inboxJson } from '../../../../inbox/api/_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ postId: string }> }

/** A post's comment thread as an operator sees it. Query: `as` (operator), `ko=1` (Korean for staff). */
export async function GET(request: Request, context: Ctx) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const postId = normalizeActivityId((await context.params).postId)
  if (!postId) return inboxError('not_found', 404)
  const params = new URL(request.url).searchParams
  const rawAs = params.get('as')
  const operatorUserId = rawAs ? normalizeActivityId(rawAs) : null
  if (rawAs && !operatorUserId) return inboxError('operator_required', 403)

  const result = await loadOperatorPostThread({ postId, operatorUserId, includeKorean: params.get('ko') === '1' })
  if (!result.ok) return inboxError(result.error, result.error === 'operator_required' ? 403 : 404)
  return inboxJson(result.thread)
}
