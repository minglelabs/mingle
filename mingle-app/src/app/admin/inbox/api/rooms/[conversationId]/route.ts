import { requireAdminApi } from '@/server/admin/guard'
import { loadInboxRoomView, normalizeInboxId } from '@/server/operator-inbox/inbox'
import { inboxAccessErrorStatus, inboxError, inboxJson } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ conversationId: string }> }

/**
 * The room exactly as the operator account sees it (hydration with the
 * operator as viewer). Query: `as` (which operator, when a room has
 * several), `beforeMs` + `beforeId` (older page), `open=1` (a fresh open:
 * audited as `inbox.open`; background refreshes omit it).
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { conversationId: rawConversationId } = await context.params
  const conversationId = normalizeInboxId(rawConversationId)
  if (!conversationId) return inboxError('not_found', 404)

  const params = new URL(request.url).searchParams
  const rawAs = params.get('as')
  const operatorUserId = rawAs ? normalizeInboxId(rawAs) : null
  if (rawAs && !operatorUserId) return inboxError('operator_not_in_room', 403)

  const beforeMs = Number(params.get('beforeMs'))
  const beforeId = normalizeInboxId(params.get('beforeId'))
  const before = Number.isSafeInteger(beforeMs) && beforeMs > 0 && beforeId
    ? { createdAtMs: beforeMs, messageId: beforeId }
    : null

  const result = await loadInboxRoomView({
    ctx: auth.ctx,
    conversationId,
    operatorUserId,
    before,
    auditOpen: params.get('open') === '1' && !before,
  })
  if (!result.ok) return inboxError(result.error, inboxAccessErrorStatus(result.error))
  return inboxJson(result.view)
}
