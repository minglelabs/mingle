import { describe, expect, it } from 'vitest'
import { PRIMARY_UI_LOCALES } from '@/i18n/mingle-locales'
import { countMessageUnreadMembers, resolveMessageReadReceiptCopy } from './message-read-receipts'

describe('message read receipts', () => {
  const members = [
    { userId: 'me', joinedAtMs: 0, lastReadAtMs: 0 },
    { userId: 'sender', joinedAtMs: 0, lastReadAtMs: null },
    { userId: 'read', joinedAtMs: 0, lastReadAtMs: 2000 },
    { userId: 'behind', joinedAtMs: 0, lastReadAtMs: 500 },
    { userId: 'never', joinedAtMs: 0, lastReadAtMs: null },
    { userId: 'late-joiner', joinedAtMs: 1500, lastReadAtMs: null },
  ]

  it('counts members who have not read the message, excluding sender, viewer and later joiners', () => {
    expect(countMessageUnreadMembers({ members, senderUserId: 'sender', createdAtMs: 1000, viewerUserId: 'me' })).toBe(2)
    expect(countMessageUnreadMembers({ members, senderUserId: 'sender', createdAtMs: 3000, viewerUserId: 'me' })).toBe(4)
  })

  it('reports zero once everyone has read', () => {
    expect(countMessageUnreadMembers({
      members: [{ userId: 'me', joinedAtMs: 0, lastReadAtMs: null }, { userId: 'a', joinedAtMs: 0, lastReadAtMs: 5000 }],
      senderUserId: 'b', createdAtMs: 4000, viewerUserId: 'me',
    })).toBe(0)
  })

  it('defines read copy for all 15 primary UI locales', () => {
    expect(resolveMessageReadReceiptCopy('ko').read).toBe('읽음')
    for (const locale of PRIMARY_UI_LOCALES) {
      const copy = resolveMessageReadReceiptCopy(locale)
      expect(copy.read.trim(), locale).not.toBe('')
      expect(copy.unreadLabel, locale).toContain('{count}')
    }
  })
})
