import { after, NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getConversationSessionKeyForMember } from '@/lib/app-conversations'
import { readMessageRecalledAtMs } from '@/lib/message-recall'
import { recallMessageForEveryone } from '@/server/message-recall'
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
    select: { id: true, userId: true, clientMessageId: true, isDeleted: true, metadata: true, createdAt: true },
  })
  if (!message) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
  if (message.userId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  // Retries stay idempotent; a message removed by "clear history" is not turned into a recall.
  if (readMessageRecalledAtMs(message.metadata) !== null) return NextResponse.json({ ok: true, messageId })
  if (message.isDeleted) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
  const { rewritePush } = await recallMessageForEveryone({ message, sessionKey, senderUserId: userId })
  after(rewritePush)
  return NextResponse.json({ ok: true, messageId })
}
