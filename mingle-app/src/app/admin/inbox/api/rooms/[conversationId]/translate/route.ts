import { requireAdminApi } from '@/server/admin/guard'
import { normalizeInboxId, resolveInboxRoomAccess } from '@/server/operator-inbox/inbox'
import {
  STAFF_TRANSLATION_LANGUAGE,
  STAFF_TRANSLATION_MAX_MESSAGES,
  translateRoomMessagesForStaff,
} from '@/server/operator-inbox/staff-translate'
import { inboxAccessErrorStatus, inboxError, inboxJson, readInboxJsonBody } from '../../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ conversationId: string }> }

/**
 * Korean for staff, on demand: `{ messageIds }` (server message ids of this
 * room, at most 50) -> `{ language: 'ko', translations: { [id]: text|null } }`.
 * Admin-only: nothing is stored in the room and no member sees it.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { conversationId: rawConversationId } = await context.params
  const conversationId = normalizeInboxId(rawConversationId)
  if (!conversationId) return inboxError('not_found', 404)

  const body = await readInboxJsonBody(request)
  const rawIds = body?.messageIds
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > STAFF_TRANSLATION_MAX_MESSAGES) {
    return inboxError('invalid_message_ids', 400)
  }
  const messageIds = rawIds.map((id) => normalizeInboxId(id))
  if (messageIds.some((id) => !id)) return inboxError('invalid_message_ids', 400)

  // Only rooms in the inbox (an active operator member) can be read here.
  const access = await resolveInboxRoomAccess({ conversationId })
  if (!access.ok) return inboxError(access.error, inboxAccessErrorStatus(access.error))

  const translations = await translateRoomMessagesForStaff({
    sessionKey: access.room.sessionKey,
    messageIds: messageIds as string[],
    language: STAFF_TRANSLATION_LANGUAGE,
  })
  return inboxJson({ language: STAFF_TRANSLATION_LANGUAGE, translations })
}
