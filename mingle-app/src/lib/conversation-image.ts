export type ConversationMessageImage = { conversationId: string; messageId: string; width: number; height: number }
export const CONVERSATION_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export function normalizeConversationMessageImage(value: unknown): ConversationMessageImage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const image = value as Record<string, unknown>
  if (typeof image.conversationId !== 'string' || !/^[\w-]{1,128}$/.test(image.conversationId)
    || typeof image.messageId !== 'string' || !/^[\w-]{1,128}$/.test(image.messageId)
    || typeof image.width !== 'number' || !Number.isInteger(image.width) || image.width < 1 || image.width > 2048
    || typeof image.height !== 'number' || !Number.isInteger(image.height) || image.height < 1 || image.height > 2048) return undefined
  return { conversationId: image.conversationId, messageId: image.messageId, width: image.width, height: image.height }
}
