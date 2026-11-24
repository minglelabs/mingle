import { requireAdminApi } from '@/server/admin/guard'
import { normalizeActivityId } from '@/server/operator-activity/activity'
import { setOperatorCommentLike, type OperatorCommentLikeError } from '@/server/operator-activity/thread'
import { inboxError, inboxJson, readInboxJsonBody } from '../../../../../../../inbox/api/_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ postId: string; commentId: string }> }

const ERROR_STATUS: Record<OperatorCommentLikeError, number> = {
  not_operator: 404,
  operator_inactive: 403,
  not_found: 404,
  own_comment: 400,
}

/** POST `{ operatorUserId, liked }`: like or unlike the comment as the operator account. */
export async function POST(request: Request, context: Ctx) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const params = await context.params
  const postId = normalizeActivityId(params.postId)
  const commentId = normalizeActivityId(params.commentId)
  if (!postId || !commentId) return inboxError('not_found', 404)
  const body = await readInboxJsonBody(request)
  const operatorUserId = normalizeActivityId(body?.operatorUserId)
  if (!operatorUserId) return inboxError('not_operator', 404)
  if (typeof body?.liked !== 'boolean') return inboxError('invalid_body', 400)
  const result = await setOperatorCommentLike(auth.ctx, { operatorUserId, postId, commentId, liked: body.liked })
  return result.ok ? inboxJson(result) : inboxError(result.error, ERROR_STATUS[result.error])
}
