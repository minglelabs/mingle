import { requireAdminApi } from '@/server/admin/guard'
import { normalizeActivityId } from '@/server/operator-activity/activity'
import {
  commentAsOperator,
  OperatorCommentError,
  type OperatorCommentErrorCode,
} from '@/server/operator-activity/thread'
import { inboxError, inboxJson, readInboxJsonBody } from '../../../../../inbox/api/_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ postId: string }> }

const ERROR_STATUS: Record<OperatorCommentErrorCode, number> = {
  not_operator: 404,
  operator_inactive: 403,
  account_restricted: 403,
  text_required: 400,
  text_too_long: 400,
  not_found: 404,
  parent_not_found: 400,
  persona_language_missing: 422,
  conversion_failed: 502,
}

/**
 * POST `{ operatorUserId, text, parentId?, replyToUserId? }`: comments on the
 * post (or replies to `parentId`) as the operator account. The text is
 * converted to the operator's persona language before it is posted.
 */
export async function POST(request: Request, context: Ctx) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const postId = normalizeActivityId((await context.params).postId)
  if (!postId) return inboxError('not_found', 404)
  const body = await readInboxJsonBody(request)
  if (!body) return inboxError('invalid_body', 400)
  const operatorUserId = normalizeActivityId(body.operatorUserId)
  if (!operatorUserId) return inboxError('not_operator', 404)
  if (typeof body.text !== 'string') return inboxError('text_required', 400)
  const parentId = body.parentId == null ? null : normalizeActivityId(body.parentId)
  if (body.parentId != null && !parentId) return inboxError('parent_not_found', 400)
  const replyToUserId = body.replyToUserId == null ? null : normalizeActivityId(body.replyToUserId)

  try {
    const result = await commentAsOperator(auth.ctx, { operatorUserId, postId, text: body.text, parentId, replyToUserId })
    return inboxJson(result, 201)
  } catch (error) {
    if (error instanceof OperatorCommentError) return inboxError(error.code, ERROR_STATUS[error.code])
    throw error
  }
}
