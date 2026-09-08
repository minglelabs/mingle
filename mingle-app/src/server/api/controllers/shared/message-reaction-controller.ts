import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getConversationSessionKeyForMember, isMessageSenderBlockedInConversation } from '@/lib/app-conversations'
import { isMessageReactionKind, summarizeMessageReactions } from '@/lib/message-reactions'
import { notifyConversationMessage } from '@/server/conversation-realtime'

async function authorize(conversationId: string) {
  const session = await getServerSession(getAuthOptions())
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sessionKey = await getConversationSessionKeyForMember({ conversationId, userId })
  if (!sessionKey) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return { userId, sessionKey }
}

// The UI uses stable client IDs, including the legacy db-ID fallback used by hydration.
function messageIdentity(ids: string[]) {
  return { OR: [
    { clientMessageId: { in: ids } },
    { id: { in: ids.filter(id => id.startsWith('db-')).map(id => id.slice(3)) }, clientMessageId: null },
  ] }
}

export async function getMessageReactions(request: NextRequest, conversationId: string) {
  const scope = await authorize(conversationId)
  if (scope instanceof NextResponse) return scope
  const ids = [...new Set(request.nextUrl.searchParams.getAll('id'))]
  if (!ids.length || ids.length > 100 || ids.some(id => !id || id.length > 256)) {
    return NextResponse.json({ error: 'invalid_message_ids' }, { status: 400 })
  }
  const messages = await prisma.appMessage.findMany({
    where: { sessionKey: scope.sessionKey, AND: [messageIdentity(ids), { OR: [{ isDeleted: null }, { isDeleted: false }] }] },
    select: { id: true, clientMessageId: true, reactions: { select: { kind: true, userId: true } } },
  })
  return NextResponse.json({ reactions: Object.fromEntries(messages.map(message => [
    message.clientMessageId || `db-${message.id}`, summarizeMessageReactions(message.reactions, scope.userId),
  ])) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function putMessageReaction(request: NextRequest, conversationId: string) {
  const scope = await authorize(conversationId)
  if (scope instanceof NextResponse) return scope
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!body || typeof body.messageId !== 'string' || !body.messageId || body.messageId.length > 256
    || (body.kind !== null && !isMessageReactionKind(body.kind))) {
    return NextResponse.json({ error: 'invalid_reaction' }, { status: 400 })
  }
  if (await isMessageSenderBlockedInConversation(scope)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const message = await prisma.appMessage.findFirst({
    where: { sessionKey: scope.sessionKey, AND: [messageIdentity([body.messageId]), { OR: [{ isDeleted: null }, { isDeleted: false }] }] },
    select: { id: true },
  })
  if (!message) return NextResponse.json({ error: 'message_not_found' }, { status: 404 })
  // Explicit set/remove operations remain idempotent on retries and across devices.
  if (body.kind === null) {
    await prisma.appMessageReaction.deleteMany({ where: { messageId: message.id, userId: scope.userId } })
  } else {
    await prisma.appMessageReaction.upsert({
      where: { messageId_userId: { messageId: message.id, userId: scope.userId } },
      create: { messageId: message.id, userId: scope.userId, kind: body.kind },
      update: { kind: body.kind },
    })
  }
  const rows = await prisma.appMessageReaction.findMany({ where: { messageId: message.id }, select: { kind: true, userId: true } })
  await notifyConversationMessage(scope.sessionKey)
  return NextResponse.json({ reactions: summarizeMessageReactions(rows, scope.userId) })
}
