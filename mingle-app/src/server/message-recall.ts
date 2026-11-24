import type { Prisma } from '@prisma/client'
import { listChannelMemberUserIdsBySessionKey } from '@/lib/app-conversations'
import { MESSAGE_RECALLED_AT_METADATA_KEY } from '@/lib/message-recall'
import { prisma } from '@/lib/prisma'
import { notifyConversationMessage } from '@/server/conversation-realtime'
import { sendPushNotificationForRecalledConversationMessage } from '@/server/push-notifications'

/**
 * Unsends one message for everyone in the room: the app's own "전송 취소"
 * (message-recall-controller) and staff deleting an operator account's
 * message from the admin inbox. Soft delete only: the row, its contents and
 * any stored photo stay for moderation, while every member-facing read
 * already filters them out. The caller checks who may recall what.
 *
 * Returns the room members plus a push rewrite to run after the response
 * (`after()`), so a slow push never delays the recall.
 */
export async function recallMessageForEveryone(args: {
  message: { id: string; clientMessageId: string | null; createdAt: Date }
  sessionKey: string
  senderUserId: string
}): Promise<{ members: string[]; rewritePush: () => Promise<void> }> {
  const { message, sessionKey } = args
  await prisma.$transaction(async tx => {
    // Same lock as the finalize upsert (log-client-event-handler), which
    // rewrites isDeleted and metadata: a translation update landing now either
    // commits first and is recalled here, or sees the recall and is dropped.
    if (message.clientMessageId) {
      const lockKey = JSON.stringify([sessionKey, message.clientMessageId])
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
    }
    const current = await tx.appMessage.findUnique({ where: { id: message.id }, select: { metadata: true } })
    const metadata = current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
      ? current.metadata as Prisma.JsonObject : {}
    await tx.appMessage.update({
      where: { id: message.id },
      data: { isDeleted: true, metadata: { ...metadata, [MESSAGE_RECALLED_AT_METADATA_KEY]: Date.now() } },
    })
    await tx.appMessageContent.updateMany({ where: { messageId: message.id }, data: { isDeleted: true } })
  })
  // Open rooms drop the bubble on their next hydration; lists refresh their preview.
  const members = await listChannelMemberUserIdsBySessionKey(sessionKey)
  await notifyConversationMessage(sessionKey, members, undefined, { timeoutMs: 3000 })
  // The push already on recipients' lock screens still shows the text:
  // rewrite it into the "deleted message" placeholder. Never fails the recall.
  const rewritePush = async () => {
    try {
      await sendPushNotificationForRecalledConversationMessage({
        messageId: message.id, messageCreatedAt: message.createdAt, sessionKey,
        senderUserId: args.senderUserId, memberUserIds: members,
      })
    } catch (error) {
      console.error('[message-recall] push rewrite failed', error instanceof Error ? error.name : 'unknown')
    }
  }
  return { members, rewritePush }
}
