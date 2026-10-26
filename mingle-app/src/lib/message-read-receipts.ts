import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n/config'

export const MESSAGE_READ_RECEIPTS_REFRESH_EVENT = 'mingle:message-read-receipts-refresh'

export type MessageReadReceiptMember = {
  userId: string
  joinedAtMs: number
  lastReadAtMs: number | null
}

// KakaoTalk-style unread count for one message: active members other than
// the sender who were already in the room when it was sent and whose read
// cursor is still before it. The viewer has the room open, so they count as
// having read everything regardless of their (possibly lagging) server cursor.
export function countMessageUnreadMembers(input: {
  members: ReadonlyArray<MessageReadReceiptMember>
  senderUserId: string
  createdAtMs: number
  viewerUserId: string | null
}): number {
  let unread = 0
  for (const member of input.members) {
    if (member.userId === input.senderUserId || member.userId === input.viewerUserId) continue
    if (member.joinedAtMs > input.createdAtMs) continue
    if (member.lastReadAtMs === null || member.lastReadAtMs < input.createdAtMs) unread += 1
  }
  return unread
}

export type MessageReadReceiptCopy = {
  read: string
  // Accessible label for the numeric badge; {count} is replaced.
  unreadLabel: string
}

const MESSAGE_READ_RECEIPT_COPY_BY_LOCALE = {
  ko: { read: '읽음', unreadLabel: '{count}명 안 읽음' },
  en: { read: 'Read', unreadLabel: '{count} unread' },
  ja: { read: '既読', unreadLabel: '未読 {count}人' },
  'zh-CN': { read: '已读', unreadLabel: '{count}人未读' },
  'zh-TW': { read: '已讀', unreadLabel: '{count}人未讀' },
  fr: { read: 'Lu', unreadLabel: '{count} non lu(s)' },
  de: { read: 'Gelesen', unreadLabel: '{count} ungelesen' },
  es: { read: 'Leído', unreadLabel: '{count} sin leer' },
  pt: { read: 'Lida', unreadLabel: '{count} não leram' },
  it: { read: 'Letto', unreadLabel: '{count} non letto' },
  ru: { read: 'Прочитано', unreadLabel: 'Не прочитали: {count}' },
  ar: { read: 'تمت القراءة', unreadLabel: 'لم يقرأها {count}' },
  hi: { read: 'पढ़ा गया', unreadLabel: '{count} ने नहीं पढ़ा' },
  th: { read: 'อ่านแล้ว', unreadLabel: 'ยังไม่อ่าน {count} คน' },
  vi: { read: 'Đã xem', unreadLabel: '{count} người chưa xem' },
} satisfies Record<LegalDocumentLocale, MessageReadReceiptCopy>

export function resolveMessageReadReceiptCopy(uiLocale: string): MessageReadReceiptCopy {
  const supportedLocale = resolveSupportedLocaleTag(uiLocale) ?? DEFAULT_LOCALE
  return MESSAGE_READ_RECEIPT_COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)]
    ?? MESSAGE_READ_RECEIPT_COPY_BY_LOCALE.en
}
