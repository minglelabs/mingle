// A recalled ("unsent") message stays soft-deleted (`isDeleted`) so every
// existing visibility filter hides it; this metadata key is what tells a
// recall apart from a "clear my history" delete, so rooms can drop the bubble.
export const MESSAGE_RECALLED_AT_METADATA_KEY = 'recalledAtMs'
export const MESSAGE_RECALLED_EVENT = 'mingle:message-recalled'
export type MessageRecalledEventDetail = { conversationId: string; messageId: string }
// Newest recalls a hydration response carries; older ones left every warm cache long ago.
export const RECALLED_MESSAGE_ID_LIMIT = 200

export function readMessageRecalledAtMs(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[MESSAGE_RECALLED_AT_METADATA_KEY]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function normalizeRecalledMessageIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256))]
}

export function messageRecallCopy(locale: string) {
  if (locale === 'ko') return { recall: '전송 취소', confirm: '한 번 더 눌러 모두에게서 삭제', pending: '취소하는 중…', error: '전송을 취소하지 못했습니다. 다시 시도해 주세요.' }
  if (locale === 'ja') return { recall: '送信取消', confirm: 'もう一度押すと全員から削除', pending: '取り消し中…', error: '送信を取り消せませんでした。もう一度お試しください。' }
  return { recall: 'Unsend', confirm: 'Tap again to delete for everyone', pending: 'Unsending…', error: 'Could not unsend the message. Please try again.' }
}
