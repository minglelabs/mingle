import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PushMessage, PushRecipient } from '@/server/push-notifications'

const m = vi.hoisted(() => ({
  channelFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  targetFindMany: vi.fn(),
  publishAdminInboxEvent: vi.fn(),
  sendPushToUsers: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConversationChannel: { findFirst: m.channelFindFirst },
    user: { findUnique: m.userFindUnique },
    adminNotifyTarget: { findMany: m.targetFindMany },
  },
}))
vi.mock('@/server/conversation-realtime', () => ({ publishAdminInboxEvent: m.publishAdminInboxEvent }))
vi.mock('@/server/push-notifications', () => ({ sendPushToUsers: m.sendPushToUsers }))

import { notifyOperatorInboxActivity, OPERATOR_INBOX_PUSH_COALESCE_MS, type OperatorInboxActivity } from './notify'

const { resolvePushCopy } = await vi.importActual<typeof import('@/server/push-notifications')>('@/server/push-notifications')

let roomSeq = 0
function nextRoomId() {
  roomSeq += 1
  return `conv_${roomSeq}`
}

function roomWithOperators(roomId: string, operators: Array<{ userId: string; name: string | null; handle: string }>) {
  m.channelFindFirst.mockResolvedValue({
    id: roomId,
    members: operators.map(({ userId, name, handle }) => ({ userId, user: { name, handle } })),
  })
}

function activity(overrides: Partial<OperatorInboxActivity> = {}): OperatorInboxActivity {
  return {
    sessionKey: 'sess_1',
    senderUserId: 'user_1',
    memberUserIds: ['user_1', 'op_1'],
    messageId: 'msg_1',
    preview: '안녕하세요, 서울 여행 중이에요',
    kind: 'text',
    ...overrides,
  }
}

/** The messages `sendPushToUsers` would send, built for each recipient. */
async function builtPushes(recipients: PushRecipient[], call = 0): Promise<PushMessage[]> {
  const build = m.sendPushToUsers.mock.calls[call][1] as (recipient: PushRecipient) => PushMessage | null
  return recipients.map((recipient) => build(recipient) as PushMessage)
}

describe('notifyOperatorInboxActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.publishAdminInboxEvent.mockResolvedValue(undefined)
    m.sendPushToUsers.mockResolvedValue(undefined)
    m.userFindUnique.mockResolvedValue({ name: 'Mina', handle: 'mina', isOfficial: false, isOperator: false })
    m.targetFindMany.mockResolvedValue([{ userId: 'staff_ko' }, { userId: 'staff_en' }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing beyond one lookup for a room without an active operator member', async () => {
    m.channelFindFirst.mockResolvedValue({ id: nextRoomId(), members: [] })
    await notifyOperatorInboxActivity(activity())
    m.channelFindFirst.mockResolvedValue(null)
    await notifyOperatorInboxActivity(activity())

    expect(m.channelFindFirst).toHaveBeenCalledTimes(2)
    expect(m.publishAdminInboxEvent).not.toHaveBeenCalled()
    expect(m.targetFindMany).not.toHaveBeenCalled()
    expect(m.sendPushToUsers).not.toHaveBeenCalled()
  })

  it('looks the room up by id when known, else by session key, counting only live operator memberships', async () => {
    m.channelFindFirst.mockResolvedValue(null)
    await notifyOperatorInboxActivity(activity({ conversationId: 'conv_x', sessionKey: 'sess_x' }))
    await notifyOperatorInboxActivity(activity({ sessionKey: ' sess_y ' }))

    const [byId, byKey] = m.channelFindFirst.mock.calls.map(([args]) => args)
    expect(byId.where).toMatchObject({ id: 'conv_x', sessionKey: 'sess_x' })
    expect(byKey.where).toMatchObject({ sessionKey: 'sess_y' })
    expect(byKey.where.id).toBeUndefined()
    expect(byKey.where.OR).toEqual([{ isDeleted: false }, { isDeleted: null }])
    expect(byKey.select.members.where).toEqual({ leftAt: null, user: { isOperator: true, isDeleted: false } })
  })

  it('only refreshes the admin inbox when an operator sends', async () => {
    roomWithOperators(nextRoomId(), [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    await notifyOperatorInboxActivity(activity({ senderUserId: 'op_1' }))

    expect(m.publishAdminInboxEvent).toHaveBeenCalledTimes(1)
    expect(m.userFindUnique).not.toHaveBeenCalled()
    expect(m.sendPushToUsers).not.toHaveBeenCalled()
  })

  it('never alerts for a sender flagged as an operator', async () => {
    roomWithOperators(nextRoomId(), [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    m.userFindUnique.mockResolvedValue({ name: 'Other persona', handle: 'other', isOfficial: false, isOperator: true })
    await notifyOperatorInboxActivity(activity({ senderUserId: 'op_2' }))

    expect(m.publishAdminInboxEvent).toHaveBeenCalledTimes(1)
    expect(m.sendPushToUsers).not.toHaveBeenCalled()
  })

  it('refreshes the inbox and pushes staff targets (never the sender) when a user writes', async () => {
    const roomId = nextRoomId()
    roomWithOperators(roomId, [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    await notifyOperatorInboxActivity(activity({ messageId: 'msg_42' }))

    expect(m.publishAdminInboxEvent).toHaveBeenCalledTimes(1)
    expect(m.targetFindMany.mock.calls[0][0].where).toEqual({
      userId: { not: 'user_1' },
      user: { isActive: true, isDeleted: false, deletedAt: null, withdrawnAt: null, isOperator: false },
    })
    expect(m.sendPushToUsers).toHaveBeenCalledTimes(1)
    expect(m.sendPushToUsers.mock.calls[0][0]).toEqual(['staff_ko', 'staff_en'])

    const [ko, en] = await builtPushes([
      { userId: 'staff_ko', language: 'ko' },
      { userId: 'staff_en', language: 'en' },
    ])
    expect(ko).toMatchObject({
      notificationId: 'operator-inbox:msg_42',
      type: 'operator_inbox_message',
      actorId: 'user_1',
      recipientLanguage: 'ko',
      conversationId: roomId,
      navigationUrl: `/admin/inbox/${roomId}`,
    })
    expect(ko.sessionKey).toBeUndefined()
    expect(resolvePushCopy(ko)).toEqual({ title: '루카에게 새 메시지', body: 'Mina: 안녕하세요, 서울 여행 중이에요' })
    expect(resolvePushCopy(en)).toEqual({ title: 'New message for 루카', body: 'Mina: 안녕하세요, 서울 여행 중이에요' })
  })

  it('uses the photo copy and labels an official sender in each staff language', async () => {
    roomWithOperators(nextRoomId(), [
      { userId: 'op_1', name: null, handle: 'luca.kr' },
      { userId: 'op_2', name: 'Mina', handle: 'mina_op' },
      { userId: 'op_3', name: 'Sol', handle: 'sol' },
    ])
    m.userFindUnique.mockResolvedValue({ name: 'Mingle', handle: 'mingle_team', isOfficial: true, isOperator: false })
    await notifyOperatorInboxActivity(activity({ kind: 'photo', preview: null, conversationId: 'conv_photo' }))

    const [ko, en] = await builtPushes([
      { userId: 'staff_ko', language: 'ko' },
      { userId: 'staff_en', language: 'en' },
    ])
    expect(ko.messagePreview).toBeUndefined()
    expect(resolvePushCopy(ko)).toEqual({ title: '@luca.kr, Mina 외 1명에게 새 메시지', body: 'Mingle (공식): 사진을 보냈습니다' })
    expect(resolvePushCopy(en)).toEqual({ title: 'New message for @luca.kr, Mina and 1 more', body: 'Mingle (Official): Sent a photo' })
  })

  it('does not push when no staff target is configured, and then does not hold the room window', async () => {
    const roomId = nextRoomId()
    roomWithOperators(roomId, [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    m.targetFindMany.mockResolvedValueOnce([])
    await notifyOperatorInboxActivity(activity())
    expect(m.publishAdminInboxEvent).toHaveBeenCalledTimes(1)
    expect(m.sendPushToUsers).not.toHaveBeenCalled()

    await notifyOperatorInboxActivity(activity({ messageId: 'msg_2' }))
    expect(m.sendPushToUsers).toHaveBeenCalledTimes(1)
  })

  it('pushes at most once per room per 20 s but still refreshes the inbox every time', async () => {
    const now = vi.spyOn(Date, 'now')
    const roomA = nextRoomId()
    const roomB = nextRoomId()
    roomWithOperators(roomA, [{ userId: 'op_1', name: '루카', handle: 'luca' }])

    now.mockReturnValue(1_000_000)
    await notifyOperatorInboxActivity(activity({ messageId: 'a1' }))
    now.mockReturnValue(1_000_000 + OPERATOR_INBOX_PUSH_COALESCE_MS - 1)
    await notifyOperatorInboxActivity(activity({ messageId: 'a2' }))
    expect(m.sendPushToUsers).toHaveBeenCalledTimes(1)

    roomWithOperators(roomB, [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    await notifyOperatorInboxActivity(activity({ messageId: 'b1', sessionKey: 'sess_b' }))
    expect(m.sendPushToUsers).toHaveBeenCalledTimes(2)

    roomWithOperators(roomA, [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    now.mockReturnValue(1_000_000 + OPERATOR_INBOX_PUSH_COALESCE_MS)
    await notifyOperatorInboxActivity(activity({ messageId: 'a3' }))
    expect(m.sendPushToUsers).toHaveBeenCalledTimes(3)
    expect(m.publishAdminInboxEvent).toHaveBeenCalledTimes(4)
  })

  it('pushes with an unknown-sender label when the message has no sender', async () => {
    roomWithOperators(nextRoomId(), [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    await notifyOperatorInboxActivity(activity({ senderUserId: null }))

    expect(m.userFindUnique).not.toHaveBeenCalled()
    expect(m.targetFindMany.mock.calls[0][0].where.userId).toBeUndefined()
    const [ko] = await builtPushes([{ userId: 'staff_ko', language: 'ko' }])
    expect(ko.actorId).toBe('')
    expect(resolvePushCopy(ko).body).toBe('알 수 없는 사용자: 안녕하세요, 서울 여행 중이에요')
  })

  it('never throws when a lookup or the push rejects', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.channelFindFirst.mockRejectedValueOnce(new Error('db down'))
    await expect(notifyOperatorInboxActivity(activity())).resolves.toBeUndefined()

    roomWithOperators(nextRoomId(), [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    m.sendPushToUsers.mockRejectedValueOnce(new Error('push down'))
    await expect(notifyOperatorInboxActivity(activity())).resolves.toBeUndefined()

    roomWithOperators(nextRoomId(), [{ userId: 'op_1', name: '루카', handle: 'luca' }])
    m.publishAdminInboxEvent.mockRejectedValueOnce(new Error('bus down'))
    await expect(notifyOperatorInboxActivity(activity())).resolves.toBeUndefined()

    expect(error).toHaveBeenCalledWith('[operator-inbox] notify_failed', expect.objectContaining({ error: 'Error' }))
    await expect(notifyOperatorInboxActivity(null as unknown as OperatorInboxActivity)).resolves.toBeUndefined()
  })
})
