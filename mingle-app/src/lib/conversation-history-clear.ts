export const CONVERSATION_CLEAR_CUTOFF_HEADER = 'x-mingle-conversation-cleared-at-ms'
export const CONVERSATION_HISTORY_CLEARED_EVENT_TYPE = 'conversation_history_cleared'

export function parseConversationMessageCreatedAtMs(clientMessageId: string | null | undefined): number | null {
  const normalized = (clientMessageId || '').trim()
  const match = /^u-(\d+)-/.exec(normalized)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}

export function sanitizeConversationClearCutoffMs(rawValue: string | null | undefined): number | null {
  const normalized = (rawValue || '').trim()
  if (!normalized) return null
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}
