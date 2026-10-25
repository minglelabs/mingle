import { prisma } from '@/lib/prisma'
import { readMessageRecalledAtMs } from '@/lib/message-recall'
import {
  normalizeMessageReplyReference,
  toRecalledMessageReplyReference,
  type MessageReplyReference,
} from '@/lib/message-reply'
import { messageIdentity } from '@/server/api/controllers/shared/message-reaction-controller'

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

// The client only says WHICH message it replies to. Everything the quote
// shows (text, translations, sender) is rebuilt from that message's own row in
// the same room, so a client cannot attribute a fabricated quote to someone.
// Null when the target isn't a message of this room (or was cleared).
export async function resolveVerifiedMessageReplyReference(args: {
  sessionKey: string
  raw: unknown
}): Promise<MessageReplyReference | null> {
  const requested = readObject(args.raw)
  const id = typeof requested?.id === 'string' ? requested.id.trim() : ''
  if (!id || id.length > 256) return null
  const target = await prisma.appMessage.findFirst({
    where: { sessionKey: args.sessionKey, ...messageIdentity([id]) },
    select: {
      userId: true,
      isDeleted: true,
      sourceLanguage: true,
      metadata: true,
      user: { select: { name: true } },
      contents: {
        where: { OR: [{ isDeleted: null }, { isDeleted: false }], contentType: { in: ['SOURCE', 'TRANSLATION_FINAL'] } },
        select: { contentType: true, language: true, text: true },
      },
    },
  })
  if (!target) return null
  const metadata = readObject(target.metadata)
  // A solo-room turn has no account name; its own diarization label stands in.
  const soloSpeaker = readObject(metadata?.clientMetadata)?.speaker
  const speakerName = target.user?.name ?? (typeof soloSpeaker === 'string' ? soloSpeaker : null)
  const base = { id, speakerName, speakerUserId: target.userId }
  if (readMessageRecalledAtMs(metadata) !== null) {
    return toRecalledMessageReplyReference({ ...base, text: '' })
  }
  if (target.isDeleted) return null
  const sources = target.contents.filter(content => content.contentType === 'SOURCE')
  const source = sources.find(content => content.language === target.sourceLanguage) ?? sources[0]
  const translations = Object.fromEntries(target.contents
    .filter(content => content.contentType === 'TRANSLATION_FINAL')
    .map(content => [content.language, content.text]))
  return normalizeMessageReplyReference({
    ...base,
    text: source?.text ?? '',
    translations,
    image: readObject(metadata?.image) ? true : undefined,
  })
}
