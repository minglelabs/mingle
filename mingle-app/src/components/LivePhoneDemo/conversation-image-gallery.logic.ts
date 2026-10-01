// The photos of one room, in conversation order, for paging through them in the full-screen
// viewer. Pure helpers: the chat list collects them from its messages and the viewer looks
// the tapped photo up in the list.

import { buildClientApiPath } from '@/lib/api-contract'
import { normalizeConversationMessageImage, type ConversationMessageImage } from '@/lib/conversation-image'

/** The valid photos among `messages`, in the given (conversation) order, each message once. */
export function collectConversationImages(messages: readonly { image?: unknown }[]): ConversationMessageImage[] {
  const seen = new Set<string>()
  const images: ConversationMessageImage[] = []
  for (const message of messages) {
    const image = normalizeConversationMessageImage(message.image)
    if (!image || seen.has(image.messageId)) continue
    seen.add(image.messageId)
    images.push(image)
  }
  return images
}

/** Changes exactly when the photos (or their order) change: a photo's size never does. */
export function conversationImagesKey(images: readonly ConversationMessageImage[]): string {
  return images.map(image => `${image.conversationId}/${image.messageId}`).join('|')
}

export function findConversationImageIndex(images: readonly ConversationMessageImage[], messageId: string): number {
  return images.findIndex(image => image.messageId === messageId)
}

/** The authenticated image endpoint (without a retry marker). */
export function conversationImagePath(image: Pick<ConversationMessageImage, 'conversationId' | 'messageId'>): string {
  return buildClientApiPath(`/conversations/${encodeURIComponent(image.conversationId)}/images/${encodeURIComponent(image.messageId)}`)
}

/** The endpoint with the retry marker that busts a failed load. */
export function conversationImageSrc(image: Pick<ConversationMessageImage, 'conversationId' | 'messageId'>, retry = 0): string {
  const path = conversationImagePath(image)
  return retry ? `${path}?retry=${retry}` : path
}
