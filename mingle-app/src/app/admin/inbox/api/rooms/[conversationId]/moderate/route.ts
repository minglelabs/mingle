import { requireAdminApi } from '@/server/admin/guard'
import { normalizeInboxId } from '@/server/operator-inbox/inbox'
import { reportInboxCounterpart, setInboxCounterpartBlocked } from '@/server/operator-inbox/moderate'
import { normalizeReportMessage, normalizeReportReason } from '@/server/reports/report-service'
import { inboxAccessErrorStatus, inboxError, inboxJson, readInboxJsonBody } from '../../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ conversationId: string }> }

/**
 * Block, unblock or report the room's other person AS the operator account:
 * `{ as, userId, action: 'block' | 'unblock' | 'report', reason?, message? }`.
 * The app's own block and report, with the app's report reasons. Audited.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { conversationId: rawConversationId } = await context.params
  const conversationId = normalizeInboxId(rawConversationId)
  if (!conversationId) return inboxError('not_found', 404)

  const body = await readInboxJsonBody(request)
  if (!body) return inboxError('invalid_json', 400)
  const operatorUserId = body.as === undefined || body.as === null ? null : normalizeInboxId(body.as)
  if (body.as !== undefined && body.as !== null && !operatorUserId) return inboxError('operator_not_in_room', 403)
  const counterpartUserId = normalizeInboxId(body.userId)
  if (!counterpartUserId) return inboxError('invalid_user_id', 400)

  const fail = (error: string) => inboxError(error, error === 'not_counterpart' ? 403 : inboxAccessErrorStatus(error))

  if (body.action === 'block' || body.action === 'unblock') {
    const result = await setInboxCounterpartBlocked({
      ctx: auth.ctx, conversationId, operatorUserId, counterpartUserId, blocked: body.action === 'block',
    })
    return result.ok ? inboxJson({ ok: true, blocked: result.blocked }) : fail(result.error)
  }
  if (body.action === 'report') {
    const reason = normalizeReportReason(body.reason)
    if (!reason) return inboxError('invalid_reason', 400)
    const message = normalizeReportMessage(body.message)
    if (!message.ok) return inboxError('invalid_message', 400)
    const result = await reportInboxCounterpart({
      ctx: auth.ctx, conversationId, operatorUserId, counterpartUserId, reason, message: message.message,
    })
    return result.ok ? inboxJson({ ok: true, status: result.status }) : fail(result.error)
  }
  return inboxError('invalid_action', 400)
}
