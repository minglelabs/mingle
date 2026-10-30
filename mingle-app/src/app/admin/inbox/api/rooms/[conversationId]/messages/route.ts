import { requireAdminApi } from '@/server/admin/guard'
import { normalizeInboxId, resolveInboxRoomAccess } from '@/server/operator-inbox/inbox'
import { OperatorSendError, sendOperatorMessage } from '@/server/operator-inbox/send'
import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import { inboxAccessErrorStatus, inboxError, inboxJson, readInboxJsonBody, readInboxString } from '../../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ conversationId: string }> }

/**
 * Reply AS an operator account. Body: `{ text, as?, clientRequestId? }`.
 * `as` is required when the room has several operators. A retry with the
 * same `clientRequestId` returns the stored reply (200) instead of sending
 * twice (201 for a new reply). A failed persona-language translation is 503
 * with `retryable: true` and stores nothing.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { conversationId: rawConversationId } = await context.params
  const conversationId = normalizeInboxId(rawConversationId)
  if (!conversationId) return inboxError('not_found', 404)

  const body = await readInboxJsonBody(request)
  if (!body || typeof body.text !== 'string') return inboxError('invalid_body', 400)
  const clientRequestId = body.clientRequestId === undefined || body.clientRequestId === null
    ? null
    : readInboxString(body.clientRequestId, 64)
  if (body.clientRequestId !== undefined && body.clientRequestId !== null && !clientRequestId) {
    return inboxError('invalid_request_id', 400)
  }

  const requestedOperator = body.as === undefined || body.as === null ? null : normalizeInboxId(body.as)
  if (body.as !== undefined && body.as !== null && !requestedOperator) return inboxError('operator_not_in_room', 403)
  const access = await resolveInboxRoomAccess({
    conversationId,
    operatorUserId: requestedOperator,
    requireExplicitOperator: true,
  })
  if (!access.ok) return inboxError(access.error, inboxAccessErrorStatus(access.error))

  try {
    const result = await sendOperatorMessage(auth.ctx, {
      operatorUserId: access.room.operator.userId,
      conversationId: access.room.conversationId,
      text: body.text,
      clientRequestId,
    })
    return inboxJson({ message: result }, result.duplicate ? 200 : 201)
  } catch (error) {
    if (error instanceof OperatorAccountRequiredError) return inboxError('operator_required', 403)
    if (error instanceof OperatorSendError) {
      return inboxError(error.code, error.status, { retryable: error.retryable })
    }
    console.error('[admin-inbox] reply_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return inboxError('send_failed', 500, { retryable: true })
  }
}
