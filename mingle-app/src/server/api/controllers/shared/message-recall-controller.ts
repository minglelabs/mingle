import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client/index'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getConversationSessionKeyForMember, listChannelMemberUserIdsBySessionKey } from '@/lib/app-conversations'
import { MESSAGE_RECALLED_AT_METADATA_KEY, readMessageRecalledAtMs } from '@/lib/message-recall'
import { notifyConversationMessage } from '@/server/conversation-realtime'
import { messageIdentity } from './message-reaction-controller'

// Unsends one of the caller's own messages (text, voice or photo) for everyone
// in the room. Soft delete only: the row, its contents and any stored photo
// stay for moderation, while every member-facing read already filters them out.
export async function recallConversationMessage(request: NextRequest, conversationId: string) {
  const session = await getServerSession(getAuthOptions())
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sessionKey = await getConversationSessionKeyForMember({ conversationId, userId })
  if (!sessionKey) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const messageId = body?.messageId
  if (typeof messageId !== 'string' || !messageId || messageId.length > 256) {
    return NextResponse.json({ error: 'invalid_message_id' }, { status: 400 })
  }
  const message = await prisma.appMessage.findFirst({
    where: { sessionKey, AND: [messageIdentity([messageId])] },
    select: { id: true, userId: true, clientMessageId: true, isDeleted: true, metadata: true },
  })
  if (!message) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
  if (message.userId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  // Retries stay idempotent; a message removed by "clear history" is not turned into a recall.
  if (readMessageRecalledAtMs(message.metadata) !== null) return NextResponse.json({ ok: true, messageId })
  if (message.isDeleted) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
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
  return NextResponse.json({ ok: true, messageId })
}
