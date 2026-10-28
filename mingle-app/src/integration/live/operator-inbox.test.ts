import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

// Opt in with a LOCAL database that has the admin-operator migration:
//   OPERATOR_INBOX_TEST_DATABASE_URL=postgresql://…@127.0.0.1:5432/…?schema=app
// Normal unit runs never connect. The raw inbox SQL (memberships, LATERAL
// latest message, keyset cursor, unread per operator) is only proven here.
const context = vi.hoisted(() => {
  const raw = process.env.OPERATOR_INBOX_TEST_DATABASE_URL
  if (!raw) return { url: undefined as string | undefined }
  const url = new URL(raw)
  if (!url.searchParams.get('schema')) url.searchParams.set('schema', 'app')
  return { url: url.toString() }
})
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client')
  return { prisma: new PrismaClient({ datasources: { db: { url: context.url || 'postgresql://unused@localhost:1/unused?schema=app' } } }) }
})
vi.mock('@/server/translation/translate-texts', () => ({
  translateTexts: () => Promise.reject(new Error('no model calls in this test')),
}))

import { prisma } from '@/lib/prisma'
import {
  countOperatorInboxUnread,
  getOperatorInboxSummary,
  listOperatorInboxRooms,
  resolveInboxPhotoObjectKey,
  resolveInboxRoomAccess,
} from '@/server/operator-inbox/inbox'

const db = prisma as PrismaClient
const isLocal = Boolean(context.url && /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(context.url))
const run = randomUUID().slice(0, 8)
const id = (name: string) => `inboxtest-${run}-${name}`
const users = {
  op1: id('op1'), op2: id('op2'), op3: id('op3'),
  user1: id('user1'), user2: id('user2'), user3: id('user3'),
}
const rooms = {
  direct: id('direct'), group: id('group'), pending: id('pending'),
  left: id('left'), plain: id('plain'), deleted: id('deleted'),
}
const sessionKey = (room: string) => `sess-${room}`
const at = (minute: number) => new Date(Date.UTC(2026, 8, 30, 9, minute))

async function createRoom(roomId: string, owner: string, members: Array<{ userId: string; lastReadAt?: Date; leftAt?: Date }>, extra: { pendingInviteeUserIds?: string[]; isDeleted?: boolean } = {}) {
  await db.appConversationChannel.create({
    data: {
      id: roomId,
      ownerUserId: owner,
      sequenceNumber: Math.floor(Math.random() * 1_000_000_000),
      title: roomId,
      sessionKey: sessionKey(roomId),
      pendingInviteeUserIds: extra.pendingInviteeUserIds ?? [],
      isDeleted: extra.isDeleted ?? false,
      createdAt: at(0),
      members: {
        create: members.map((member) => ({
          userId: member.userId,
          selectedLanguages: ['en'],
          joinedAt: at(0),
          lastReadAt: member.lastReadAt ?? null,
          leftAt: member.leftAt ?? null,
        })),
      },
    },
  })
}

async function message(roomId: string, userId: string, minute: number, text: string, metadata?: object) {
  await db.appMessage.create({
    data: {
      userId,
      sessionKey: sessionKey(roomId),
      clientMessageId: `u-${minute}-${randomUUID()}`,
      sourceLanguage: 'en',
      isDeleted: false,
      createdAt: at(minute),
      ...(metadata ? { metadata } : {}),
      contents: { create: { contentType: 'SOURCE', language: 'en', text } },
    },
  })
}

describe.skipIf(!isLocal)('operator inbox SQL on a real database', () => {
  beforeAll(async () => {
    const operatorIds = new Set([users.op1, users.op2, users.op3])
    for (const userId of Object.values(users)) {
      await db.user.create({
        data: { id: userId, handle: userId.replace(/-/g, '_').slice(0, 30), name: userId, isOperator: operatorIds.has(userId), primaryLanguages: ['en'] },
      })
    }
    // 1:1 room: op1 read everything up to minute 5.
    await createRoom(rooms.direct, users.user1, [{ userId: users.user1 }, { userId: users.op1, lastReadAt: at(5) }])
    await message(rooms.direct, users.user1, 1, 'hi')
    await message(rooms.direct, users.user1, 2, 'are you there?')
    await message(rooms.direct, users.op1, 4, 'yes!')
    await message(rooms.direct, users.user1, 20, 'great', { image: { objectKey: 'conversation-images/abc.jpg', sha256: 'x', width: 1, height: 1 } })
    // Group with two operators that never opened it: operator messages never count as unread.
    await createRoom(rooms.group, users.user2, [{ userId: users.user2 }, { userId: users.op1 }, { userId: users.op2 }])
    await message(rooms.group, users.user2, 10, 'hello team')
    await message(rooms.group, users.op2, 11, 'welcome')
    await message(rooms.group, users.user2, 12, 'thanks')
    // Operator only invited (no member row): not in the inbox.
    await createRoom(rooms.pending, users.user3, [{ userId: users.user3 }], { pendingInviteeUserIds: [users.op3] })
    await message(rooms.pending, users.user3, 30, 'draft')
    // Operator left: not in the inbox.
    await createRoom(rooms.left, users.user1, [{ userId: users.user1 }, { userId: users.op2, leftAt: at(3) }])
    await message(rooms.left, users.user1, 31, 'bye')
    // No operator: not in the inbox.
    await createRoom(rooms.plain, users.user1, [{ userId: users.user1 }, { userId: users.user2 }])
    await message(rooms.plain, users.user2, 32, 'private', { image: { objectKey: 'conversation-images/def.jpg', sha256: 'y', width: 1, height: 1 } })
    // Deleted room with an operator: not in the inbox.
    await createRoom(rooms.deleted, users.user3, [{ userId: users.user3 }, { userId: users.op1 }], { isDeleted: true })
    await message(rooms.deleted, users.user3, 33, 'gone')
  })

  afterAll(async () => {
    await db.appMessage.deleteMany({ where: { sessionKey: { in: Object.values(rooms).map(sessionKey) } } })
    await db.appConversationChannel.deleteMany({ where: { id: { in: Object.values(rooms) } } })
    await db.user.deleteMany({ where: { id: { in: Object.values(users) } } })
    await db.$disconnect()
  })

  it('lists exactly the rooms with an active operator member, newest first, with real-user unread', async () => {
    const op1Rooms = await listOperatorInboxRooms({ operatorUserId: users.op1 })
    expect(op1Rooms.rooms.map((room) => room.conversationId)).toEqual([rooms.direct, rooms.group])
    const [direct, group] = op1Rooms.rooms
    expect(direct).toMatchObject({
      unreadCount: 1,
      isGroup: false,
      counterparts: [{ userId: users.user1 }],
      latestMessage: { kind: 'photo', senderUserId: users.user1 },
      activityAt: at(20).toISOString(),
    })
    expect(group).toMatchObject({ unreadCount: 2, isGroup: true })
    expect(group.operators.map((operator) => [operator.userId, operator.unreadCount]).sort())
      .toEqual([[users.op1, 2], [users.op2, 2]].sort())

    const op2Rooms = await listOperatorInboxRooms({ operatorUserId: users.op2 })
    expect(op2Rooms.rooms.map((room) => room.conversationId)).toEqual([rooms.group])
    const op3Rooms = await listOperatorInboxRooms({ operatorUserId: users.op3 })
    expect(op3Rooms.rooms).toEqual([])
  })

  it('pages with the keyset cursor', async () => {
    const first = await listOperatorInboxRooms({ operatorUserId: users.op1, limit: 1 })
    expect(first.rooms.map((room) => room.conversationId)).toEqual([rooms.direct])
    expect(first.nextCursor).toBe(`${at(20).getTime()}.${rooms.direct}`)
    const second = await listOperatorInboxRooms({
      operatorUserId: users.op1,
      limit: 1,
      cursor: { activityMs: at(20).getTime(), conversationId: rooms.direct },
    })
    expect(second.rooms.map((room) => room.conversationId)).toEqual([rooms.group])
    expect(second.nextCursor).toBeNull()
  })

  it('summarizes per operator and counts each room once in the total', async () => {
    const summary = await getOperatorInboxSummary()
    const mine = summary.operators.filter((operator) => Object.values(users).includes(operator.userId))
    expect(mine.map((operator) => [operator.userId, operator.roomCount, operator.unreadCount]).sort())
      .toEqual([[users.op1, 2, 3], [users.op2, 1, 2]].sort())
    // Other local data may add to the total, never subtract: direct 1 + group 2.
    expect(await countOperatorInboxUnread()).toBeGreaterThanOrEqual(3)
  })

  it('resolves room access and the photo proxy only inside the inbox', async () => {
    const direct = await resolveInboxRoomAccess({ conversationId: rooms.direct })
    expect(direct.ok && direct.room.operator.userId).toBe(users.op1)
    for (const room of [rooms.pending, rooms.left, rooms.plain, rooms.deleted]) {
      await expect(resolveInboxRoomAccess({ conversationId: room })).resolves.toEqual({ ok: false, error: 'not_found' })
    }
    const photos = (await db.appMessage.findMany({
      where: { sessionKey: { in: [sessionKey(rooms.direct), sessionKey(rooms.plain)] } },
      select: { id: true, sessionKey: true, metadata: true },
    })).filter((photo) => photo.metadata !== null)
    const directPhoto = photos.find((photo) => photo.sessionKey === sessionKey(rooms.direct))!
    const plainPhoto = photos.find((photo) => photo.sessionKey === sessionKey(rooms.plain))!
    await expect(resolveInboxPhotoObjectKey(directPhoto.id)).resolves.toBe('conversation-images/abc.jpg')
    await expect(resolveInboxPhotoObjectKey(plainPhoto.id)).resolves.toBeNull()
  })
})
