import { after } from 'next/server'
import { requireAdminApi } from '@/server/admin/guard'
import { deleteInboxOperatorMessage, normalizeInboxId } from '@/server/operator-inbox/inbox'
import { inboxAccessErrorStatus, inboxError, inboxJson, readInboxJsonBody } from '../../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ conversationId: string }> }

/**
 * Delete an operator account's message for everyone in the room
 * (`{ messageId }`, the server message id), the app's own "전송 취소". Audited.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { conversationId: rawConversationId } = await context.params
  const conversationId = normalizeInboxId(rawConversationId)
  if (!conversationId) return inboxError('not_found', 404)

  const body = await readInboxJsonBody(request)
  const messageId = normalizeInboxId(body?.messageId)
  if (!messageId) return inboxError('invalid_message_id', 400)

  const result = await deleteInboxOperatorMessage({ ctx: auth.ctx, conversationId, messageId })
  if (!result.ok) {
    if (result.error === 'message_not_found') return inboxError(result.error, 404)
    if (result.error === 'not_operator_message') return inboxError(result.error, 403)
    return inboxError(result.error, inboxAccessErrorStatus(result.error))
  }
  if (result.rewritePush) after(result.rewritePush)
  return inboxJson({ ok: true, messageId: result.messageId })
}
