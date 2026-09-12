import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { after, NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getConversationSessionKeyForMember, isMessageSenderBlockedInConversation, materializePendingConversationInvitees, listChannelMemberUserIdsBySessionKey } from '@/lib/app-conversations'
import { CONVERSATION_IMAGE_MAX_BYTES } from '@/lib/conversation-image'
import { putConversationImage, getConversationImage, deleteConversationImage } from '@/server/conversation-image-storage'
import { notifyConversationMessage } from '@/server/conversation-realtime'
import { sendPushNotificationForConversationMessage } from '@/server/push-notifications'

async function authorize(conversationId: string) {
  const session = await getServerSession(getAuthOptions())
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.user.id
  const sessionKey = await getConversationSessionKeyForMember({ conversationId, userId })
  return sessionKey ? { userId, sessionKey } : NextResponse.json({ error: 'not_found' }, { status: 404 })
}
function storedImage(metadata: unknown): { objectKey: string; sha256: string; width: number; height: number } | null {
  const image = (metadata as { image?: { objectKey?: unknown; sha256?: unknown; width?: unknown; height?: unknown } } | null)?.image
  return image && typeof image.objectKey === 'string' && /^conversation-images\/[\w-]+\.jpg$/.test(image.objectKey)
    && typeof image.sha256 === 'string' && typeof image.width === 'number' && typeof image.height === 'number'
    ? image as { objectKey: string; sha256: string; width: number; height: number } : null
}
export async function postConversationImage(request: NextRequest, conversationId: string) {
  const scope = await authorize(conversationId)
  if (scope instanceof NextResponse) return scope
  if (await isMessageSenderBlockedInConversation(scope)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (Number(request.headers.get('content-length')) > CONVERSATION_IMAGE_MAX_BYTES + 65536) return NextResponse.json({ error: 'image_too_large' }, { status: 413 })
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 }) }
  const file = form.get('file'), clientMessageId = form.get('clientMessageId')
  if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || !file.size || file.size > CONVERSATION_IMAGE_MAX_BYTES || typeof clientMessageId !== 'string'
    || !/^[\w-]{12,128}$/.test(clientMessageId)) return NextResponse.json({ error: 'invalid_image' }, { status: 400 })
  const bytes = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const identity = { sessionKey_clientMessageId: { sessionKey: scope.sessionKey, clientMessageId } }
  let message = await prisma.appMessage.findUnique({ where: identity })
  let created = false
  if (message && (message.userId !== scope.userId || message.isDeleted || storedImage(message.metadata)?.sha256 !== sha256)) return NextResponse.json({ error: 'message_conflict' }, { status: 409 })
  if (!message) {
    let image
    try {
      const input = sharp(bytes, { limitInputPixels: 80_000_000, animated: false })
      const info = await input.metadata()
      if (!['jpeg', 'png', 'webp'].includes(info.format ?? '')) throw new Error('unsupported_image')
      image = await input.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true })
    } catch { return NextResponse.json({ error: 'invalid_image' }, { status: 400 }) }
    const objectKey = `conversation-images/${randomUUID()}.jpg`
    try { await putConversationImage(objectKey, image.data) }
    catch { return NextResponse.json({ error: 'image_upload_failed' }, { status: 503 }) }
    try {
      if (!await getConversationSessionKeyForMember({ conversationId, userId: scope.userId }) || await isMessageSenderBlockedInConversation(scope)) {
        await deleteConversationImage(objectKey).catch(() => {})
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
      message = await prisma.appMessage.create({ data: {
        userId: scope.userId, sessionKey: scope.sessionKey, clientMessageId, sourceLanguage: 'en',
        metadata: { image: { objectKey, sha256, width: image.info.width, height: image.info.height } },
        contents: { create: { contentType: 'SOURCE', language: 'en', text: '📷 Photo' } },
      } })
      created = true
    } catch (error) {
      await deleteConversationImage(objectKey).catch(() => {})
      // A retry arriving concurrently may have committed the identical image.
      message = await prisma.appMessage.findUnique({ where: identity })
      if (!message || message.userId !== scope.userId || message.isDeleted || storedImage(message.metadata)?.sha256 !== sha256) {
        console.error('[conversation-image] persist failed', error instanceof Error ? error.name : 'unknown')
        return NextResponse.json({ error: 'image_save_failed' }, { status: 500 })
      }
    }
  }
  // Only the insert winner schedules a push. Retried/concurrent uploads reuse
  // that message without notifying recipients again. Notification failures must
  // not turn a committed photo into a failed send in the composer.
  if (created) {
    const messageId = message.id
    after(async () => {
      try {
        const memberUserIds = await listChannelMemberUserIdsBySessionKey(scope.sessionKey)
        await sendPushNotificationForConversationMessage({
          messageId, sessionKey: scope.sessionKey, senderUserId: scope.userId,
          sourceText: '📷 Photo', memberUserIds,
        })
      } catch (error) {
        console.error('[conversation-image] push failed', error instanceof Error ? error.name : 'unknown')
      }
    })
  }
  await materializePendingConversationInvitees(scope.sessionKey, message.createdAt)
  const members = await listChannelMemberUserIdsBySessionKey(scope.sessionKey)
  await notifyConversationMessage(scope.sessionKey, members, undefined, { timeoutMs: 3000 })
  return NextResponse.json({ messageId: message.id, clientMessageId }, { status: 201 })
}
export async function readConversationImage(_request: NextRequest, conversationId: string, messageId: string) {
  const scope = await authorize(conversationId)
  if (scope instanceof NextResponse) return scope
  const message = await prisma.appMessage.findFirst({ where: { id: messageId, sessionKey: scope.sessionKey, OR: [{ isDeleted: null }, { isDeleted: false }] }, select: { metadata: true } })
  const image = storedImage(message?.metadata)
  if (!image) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    const bytes = await getConversationImage(image.objectKey)
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return NextResponse.json({ error: 'image_unavailable' }, { status: 503 }) }
}
