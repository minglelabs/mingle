import { requireAdminApi } from '@/server/admin/guard'
import { markInboxRoomRead, normalizeInboxId } from '@/server/operator-inbox/inbox'
import { inboxAccessErrorStatus, inboxError, inboxJson, readInboxJsonBody } from '../../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ conversationId: string }> }

/** Mark the room read AS the operator (`{ as? }`, required when the room has several). Audited. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { conversationId: rawConversationId } = await context.params
  const conversationId = normalizeInboxId(rawConversationId)
  if (!conversationId) return inboxError('not_found', 404)

  const body = (await readInboxJsonBody(request)) ?? {}
  const operatorUserId = body.as === undefined || body.as === null ? null : normalizeInboxId(body.as)
  if (body.as !== undefined && body.as !== null && !operatorUserId) return inboxError('operator_not_in_room', 403)

  const result = await markInboxRoomRead({ ctx: auth.ctx, conversationId, operatorUserId })
  if (!result.ok) return inboxError(result.error, inboxAccessErrorStatus(result.error))
  return inboxJson({ ok: true, operatorUserId: result.operatorUserId })
}
