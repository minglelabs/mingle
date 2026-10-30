import { describe, expect, it } from 'vitest'
import {
  formatInboxRelativeTime,
  formatInboxUnreadCount,
  inboxCounterpartTitle,
  inboxLanguageName,
  inboxPersonLabel,
} from './inbox-format'
import { resolveAdminInboxWsUrl, withRealtimeToken } from './inbox-realtime'
import {
  createReplyRequestId,
  describeReplyError,
  isRetryableReplyError,
  pendingReplyClientMessageId,
  reconcilePendingReplies,
  removePendingReply,
  upsertPendingReply,
  type PendingReply,
} from './reply-outbox'
import {
  buildRoomTimeline,
  mergeUtterancePages,
  staffKoreanCandidateId,
  toBubbleUtterance,
  upsertUtterance,
  withStaffKorean,
  type RoomUtterance,
} from './room-timeline'

function utterance(id: string, createdAtMs: number, extra: Partial<RoomUtterance> = {}): RoomUtterance {
  return {
    id,
    originalText: `text ${id}`,
    originalLang: 'pt',
    targetLanguages: ['pt', 'en'],
    translations: { en: `en ${id}` },
    translationFinalized: { en: true },
    createdAtMs,
    serverCreatedAtMs: createdAtMs,
    serverMessageId: `db_${id}`,
    speaker: null,
    speakerAvatarSeed: null,
    speakerAvatarIndex: null,
    speakerName: 'João',
    speakerUserId: 'user_1',
    speakerImage: null,
    ...extra,
  }
}

describe('inbox formatting', () => {
  it('labels people and rooms', () => {
    expect(inboxPersonLabel({ name: ' Mina ', handle: 'mina' })).toBe('Mina')
    expect(inboxPersonLabel({ name: '', handle: 'mina' })).toBe('@mina')
    expect(inboxPersonLabel(null)).toBe('알 수 없음')
    expect(inboxCounterpartTitle([])).toBe('상대 없음')
    expect(inboxCounterpartTitle([{ name: 'A' }, { name: 'B' }])).toBe('A, B')
    expect(inboxCounterpartTitle([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { handle: 'd' }])).toBe('A, B 외 2명')
  })

  it('names languages in Korean', () => {
    expect(inboxLanguageName('pt')).toBe('포르투갈어')
    expect(inboxLanguageName(null)).toBe('알 수 없는 언어')
  })

  it('formats card times relative to now in the device time zone', () => {
    const now = new Date(2026, 8, 30, 15, 0).getTime()
    const at = (date: Date) => date.toISOString()
    expect(formatInboxRelativeTime(at(new Date(2026, 8, 30, 14, 59, 40)), now)).toBe('방금')
    expect(formatInboxRelativeTime(at(new Date(2026, 8, 30, 14, 35)), now)).toBe('25분 전')
    expect(formatInboxRelativeTime(at(new Date(2026, 8, 30, 9, 0)), now)).toBe('6시간 전')
    expect(formatInboxRelativeTime(at(new Date(2026, 8, 29, 23, 0)), now)).toBe('어제')
    expect(formatInboxRelativeTime(at(new Date(2026, 8, 2, 12, 0)), now)).toBe('9월 2일')
    expect(formatInboxRelativeTime(at(new Date(2025, 11, 31, 12, 0)), now)).toBe('2025. 12. 31.')
    expect(formatInboxRelativeTime(null, now)).toBe('')
  })

  it('caps unread badges', () => {
    expect(formatInboxUnreadCount(0)).toBe('')
    expect(formatInboxUnreadCount(7)).toBe('7')
    expect(formatInboxUnreadCount(120)).toBe('99+')
  })
})

describe('admin realtime socket URL', () => {
  const location = { protocol: 'https:', host: 'mingle.example' }

  it('resolves same-origin paths and switches http(s) to ws(s)', () => {
    expect(resolveAdminInboxWsUrl('/conversation-events', location)).toBe('wss://mingle.example/conversation-events')
    expect(resolveAdminInboxWsUrl('https://msg.example/conversation-events', location)).toBe('wss://msg.example/conversation-events')
    expect(resolveAdminInboxWsUrl('ws://127.0.0.1:4100/conversation-events', location)).toBe('ws://127.0.0.1:4100/conversation-events')
  })

  it('turns realtime off for missing or foreign URLs', () => {
    expect(resolveAdminInboxWsUrl(undefined, location)).toBeNull()
    expect(resolveAdminInboxWsUrl('', location)).toBeNull()
    expect(resolveAdminInboxWsUrl('ftp://x.example/', location)).toBeNull()
    expect(resolveAdminInboxWsUrl('javascript:alert(1)', location)).toBeNull()
  })

  it('adds the token as a query parameter', () => {
    expect(withRealtimeToken('wss://m.example/conversation-events', 'a b')).toBe('wss://m.example/conversation-events?token=a+b')
  })
})

describe('optimistic reply outbox', () => {
  const reply = (requestId: string, status: PendingReply['status'] = 'sending'): PendingReply => ({
    requestId, text: 'hi', createdAtMs: 1, status, error: status === 'failed' ? 'translation_failed' : null,
  })

  it('makes request ids the server accepts', () => {
    expect(createReplyRequestId(() => '123e4567-e89b-42d3-a456-426614174000')).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(createReplyRequestId(() => 'a_b!c')).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(createReplyRequestId()).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(pendingReplyClientMessageId('req-1')).toBe('op-req-1')
  })

  it('upserts, removes and reconciles with stored replies', () => {
    const list = upsertPendingReply(upsertPendingReply([], reply('a')), reply('b'))
    expect(upsertPendingReply(list, reply('a', 'failed')).map((item) => item.status)).toEqual(['failed', 'sending'])
    expect(removePendingReply(list, 'a').map((item) => item.requestId)).toEqual(['b'])
    expect(reconcilePendingReplies(list, ['op-b', 'u-1-1']).map((item) => item.requestId)).toEqual(['a'])
    expect(reconcilePendingReplies(list, [])).toBe(list)
  })

  it('explains failures in Korean and only retries what can succeed', () => {
    expect(describeReplyError('translation_failed')).toContain('번역')
    expect(describeReplyError('unknown_code')).toBe(describeReplyError('send_failed'))
    expect(isRetryableReplyError('translation_failed')).toBe(true)
    expect(isRetryableReplyError('network')).toBe(true)
    expect(isRetryableReplyError('blocked')).toBe(false)
  })
})

describe('room timeline', () => {
  it('merges pages by id in time order (the newer copy wins)', () => {
    const older = [utterance('a', 1), utterance('b', 2)]
    const latest = [utterance('b', 2, { originalText: 'fresh' }), utterance('c', 3)]
    const merged = mergeUtterancePages(older, latest)
    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(merged[1].originalText).toBe('fresh')
    expect(upsertUtterance(merged, utterance('z', 0)).map((item) => item.id)).toEqual(['z', 'a', 'b', 'c'])
  })

  it('places leave and invite notices by time and holds back ones older than the loaded history', () => {
    const items = buildRoomTimeline({
      utterances: [utterance('a', 100), utterance('b', 300)],
      leaveNotices: [{ userId: 'u2', name: 'Ana', handle: 'ana', leftAtMs: 200 }],
      inviteNotices: [{
        inviteeUserId: 'u3', inviteeName: null, inviteeHandle: 'leo',
        invitedByUserId: 'u1', invitedByName: 'João', invitedByHandle: 'joao', invitedAtMs: 50,
      }],
      hasMoreHistory: true,
    })
    expect(items.map((item) => (item.kind === 'notice' ? item.text : item.utterance.id))).toEqual(['a', 'Ana님이 나갔습니다', 'b'])
    const complete = buildRoomTimeline({
      utterances: [utterance('a', 100)],
      leaveNotices: [],
      inviteNotices: [{
        inviteeUserId: 'u3', inviteeName: null, inviteeHandle: 'leo',
        invitedByUserId: 'u1', invitedByName: 'João', invitedByHandle: 'joao', invitedAtMs: 50,
      }],
      hasMoreHistory: false,
    })
    expect(complete[0]).toMatchObject({ kind: 'notice', text: 'João님이 @leo님을 초대했습니다' })
  })

  it("maps hydration nulls to ChatBubble's optional fields", () => {
    const bubble = toBubbleUtterance(utterance('a', 1))
    expect(bubble.speaker).toBeUndefined()
    expect(bubble.speakerUserId).toBe('user_1')
    expect(bubble.serverMessageId).toBe('db_a')
  })
})

describe('staff Korean view', () => {
  it('asks for Korean only where the bubble has none', () => {
    expect(staffKoreanCandidateId(utterance('a', 1))).toBe('db_a')
    expect(staffKoreanCandidateId(utterance('a', 1, { originalLang: 'ko' }))).toBeNull()
    expect(staffKoreanCandidateId(utterance('a', 1, { translations: { ko: '안녕' } }))).toBeNull()
    expect(staffKoreanCandidateId(utterance('a', 1, { image: { conversationId: 'c', messageId: 'm', width: 1, height: 1 } }))).toBeNull()
    expect(staffKoreanCandidateId(utterance('a', 1, { serverMessageId: undefined }))).toBeNull()
  })

  it('adds Korean to the bubble client-side only (pending = target without text)', () => {
    const bubble = toBubbleUtterance(utterance('a', 1))
    expect(withStaffKorean(bubble, null, false)).toBe(bubble)
    const pending = withStaffKorean(bubble, null, true)
    expect(pending.targetLanguages).toEqual(['pt', 'en', 'ko'])
    expect(pending.translations).not.toHaveProperty('ko')
    const ready = withStaffKorean(bubble, '안녕하세요', false)
    expect(ready.translations.ko).toBe('안녕하세요')
    expect(ready.translationFinalized?.ko).toBe(true)
    // The source bubble object is never mutated.
    expect(bubble.translations).not.toHaveProperty('ko')
  })
})
