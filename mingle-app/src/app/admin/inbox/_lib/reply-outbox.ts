/**
 * Optimistic replies in the admin room: a reply shows at once as "sending",
 * becomes "failed" (with a retry that reuses its request id, so the server
 * never sends it twice) or disappears once the stored reply is in the room.
 */
export type PendingReply = {
  /** Client request id; the stored message's clientMessageId is `op-<requestId>`. */
  requestId: string
  text: string
  createdAtMs: number
  status: 'sending' | 'failed'
  error: string | null
}

export function pendingReplyClientMessageId(requestId: string): string {
  return `op-${requestId}`
}

/** 8-64 chars of [A-Za-z0-9-] (the server's request id rule). */
export function createReplyRequestId(random: () => string = defaultRandomId): string {
  const id = random().replace(/[^A-Za-z0-9-]/g, '').slice(0, 64)
  return id.length >= 8 ? id : `${id}${'0'.repeat(8 - id.length)}`
}

function defaultRandomId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function upsertPendingReply(list: PendingReply[], reply: PendingReply): PendingReply[] {
  const index = list.findIndex((item) => item.requestId === reply.requestId)
  if (index < 0) return [...list, reply]
  const next = [...list]
  next[index] = reply
  return next
}

export function removePendingReply(list: PendingReply[], requestId: string): PendingReply[] {
  const next = list.filter((item) => item.requestId !== requestId)
  return next.length === list.length ? list : next
}

/** Drops pending replies whose stored message is already in the room (same clientMessageId). */
export function reconcilePendingReplies(list: PendingReply[], utteranceIds: Iterable<string>): PendingReply[] {
  if (list.length === 0) return list
  const ids = new Set(utteranceIds)
  const next = list.filter((item) => !ids.has(pendingReplyClientMessageId(item.requestId)))
  return next.length === list.length ? list : next
}

const REPLY_ERROR_COPY: Record<string, string> = {
  translation_failed: '번역에 실패해 보내지 못했습니다. 다시 보내 주세요.',
  send_failed: '보내지 못했습니다. 다시 보내 주세요.',
  network: '네트워크 문제로 보내지 못했습니다. 다시 보내 주세요.',
  blocked: '차단된 대화방이라 보낼 수 없습니다.',
  no_recipients: '상대방이 대화방을 나가 보낼 수 없습니다.',
  not_member: '이 운영 계정은 더 이상 이 대화방의 멤버가 아닙니다.',
  conversation_not_found: '대화방을 찾을 수 없습니다.',
  operator_inactive: '비활성화된 운영 계정이라 보낼 수 없습니다.',
  operator_required: '운영 계정으로만 보낼 수 있습니다.',
  operator_ambiguous: '답장할 운영 계정을 먼저 골라 주세요.',
  text_too_long: '메시지가 너무 깁니다. 2,000자 이내로 줄여 주세요.',
  empty_text: '보낼 내용을 입력해 주세요.',
  persona_language_missing: '이 운영 계정에 사용 언어가 없어 보낼 수 없습니다.',
  message_conflict: '같은 메시지가 이미 다른 내용으로 저장되어 있습니다.',
  unauthorized: '관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.',
}

export function describeReplyError(code: string | null | undefined): string {
  return (code && REPLY_ERROR_COPY[code]) || REPLY_ERROR_COPY.send_failed
}

/** Whether a failed reply can be sent again as is (anything but a hard refusal). */
export function isRetryableReplyError(code: string | null | undefined): boolean {
  return !code || ['translation_failed', 'send_failed', 'network', 'unauthorized'].includes(code)
}
