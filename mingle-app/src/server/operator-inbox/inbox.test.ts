import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'

const m = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  memberFindMany: vi.fn(),
  memberFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  channelFindFirst: vi.fn(),
  blockFindMany: vi.fn(),
  userFindMany: vi.fn(),
  hydrate: vi.fn(),
  markRead: vi.fn(),
  writeAdminAudit: vi.fn(),
  requireOperatorAccount: vi.fn(),
  translateForStaff: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: m.queryRaw,
    appConversationChannelMember: { findMany: m.memberFindMany, findFirst: m.memberFindFirst },
    appMessage: { findMany: m.messageFindMany, findFirst: m.messageFindFirst },
    appConversationChannel: { findFirst: m.channelFindFirst },
    userBlock: { findMany: m.blockFindMany },
    user: { findMany: m.userFindMany },
  },
}))
vi.mock('@/lib/app-conversations', () => ({
  getConversationHydrationStateForUser: m.hydrate,
  markConversationChannelRead: m.markRead,
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: m.writeAdminAudit }))
vi.mock('@/server/operators/operator-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operators/operator-guard')>()),
  requireOperatorAccount: m.requireOperatorAccount,
}))
vi.mock('@/server/operator-inbox/staff-translate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operator-inbox/staff-translate')>()),
  translateForStaff: m.translateForStaff,
}))

import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import {
  countOperatorInboxUnread,
  decodeInboxCursor,
  encodeInboxCursor,
  getOperatorInboxSummary,
  listOperatorInboxRooms,
  loadInboxRoomView,
  markInboxRoomRead,
  resolveInboxPhotoObjectKey,
  resolveInboxRoomAccess,
} from '@/server/operator-inbox/inbox'

const ctx = { sessionId: 'adm_1', ip: '127.0.0.1', userAgent: 'test' }

type MemberOptions = {
  operator?: boolean
  name?: string
  primary?: string[]
  displayLanguage?: string | null
  isActive?: boolean
  isOfficial?: boolean
}

function memberRow(channelId: string, userId: string, options: MemberOptions = {}) {
  return {
    channelId,
    userId,
    displayLanguage: options.displayLanguage ?? null,
    user: {
      id: userId,
      handle: userId,
      name: options.name ?? userId,
      image: null,
      imageCropScale: null,
      imageCropX: null,
      imageCropY: null,
      isOfficial: options.isOfficial ?? false,
      isOperator: options.operator ?? false,
      isDeleted: false,
      isActive: options.isActive ?? true,
      primaryLanguages: options.primary ?? [],
      defaultDisplayLanguage: null,
    },
  }
}

function sqlText(query: unknown): string {
  return (query as Prisma.Sql).sql
}

type RawHandlers = {
  page?: unknown[]
  unread?: unknown[]
  total?: unknown[]
  perOperator?: unknown[]
}

function routeQueries(handlers: RawHandlers) {
  m.queryRaw.mockImplementation(async (query: unknown) => {
    const text = sqlText(query)
    if (text.includes('"latestMessageId"')) return handlers.page ?? []
    if (text.includes('"unreadTotal"')) return handlers.total ?? [{ unreadTotal: 0 }]
    if (text.includes('"roomCount"')) return handlers.perOperator ?? []
    if (text.includes('"unreadCount"')) return handlers.unread ?? []
    throw new Error(`unexpected query: ${text.slice(0, 80)}`)
  })
}

describe('operator inbox queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.blockFindMany.mockResolvedValue([])
    m.messageFindMany.mockResolvedValue([])
    m.memberFindMany.mockResolvedValue([])
    m.translateForStaff.mockResolvedValue({})
    m.writeAdminAudit.mockResolvedValue(undefined)
  })

  it('only counts active, materialized operator memberships and unread from real users', async () => {
    routeQueries({})
    await listOperatorInboxRooms()
    const memberships = sqlText(m.queryRaw.mock.calls[0][0])
    // left_at IS NULL: a departed operator's room is not in the inbox; a pending
    // invitee has no member row at all, so it can never match this join.
    expect(memberships).toContain('member.left_at IS NULL')
    expect(memberships).toContain('operator_user.is_operator = true')
    expect(memberships).toContain('operator_user.is_deleted = false')
    expect(memberships).toMatch(/channel\.is_deleted = false OR channel\.is_deleted IS NULL/)

    routeQueries({ total: [{ unreadTotal: 7 }] })
    await expect(countOperatorInboxUnread()).resolves.toBe(7)
    const unreadSql = sqlText(m.queryRaw.mock.calls.at(-1)![0])
    expect(unreadSql).toContain('message.user_id <> membership.operator_user_id')
    expect(unreadSql).toContain('membership.last_read_at IS NULL OR message.created_at > membership.last_read_at')
    // A reply sent as another operator in the same room is not new for staff.
    expect(unreadSql).toMatch(/message\.user_id NOT IN \(\s*SELECT staff\.id FROM app\.app_users AS staff WHERE staff\.is_operator = true/)
    // Each room counts once, with its most-behind operator.
    expect(unreadSql).toContain('MAX(unread_count)')
  })

  it('maps a page of rooms: operators vs counterparts, per-operator unread, preview in the operator language', async () => {
    routeQueries({
      page: [
        { conversationId: 'c1', sessionKey: 's1', latestMessageId: 'm1', activityMs: BigInt(Date.parse('2026-09-30T09:00:00Z')) },
        { conversationId: 'c2', sessionKey: 's2', latestMessageId: 'm2', activityMs: Date.parse('2026-09-30T08:00:00Z') },
      ],
      unread: [
        { channelId: 'c1', operatorUserId: 'op_1', unreadCount: 3 },
        { channelId: 'c2', operatorUserId: 'op_1', unreadCount: 0 },
        { channelId: 'c2', operatorUserId: 'op_2', unreadCount: 2 },
      ],
    })
    m.memberFindMany.mockResolvedValue([
      memberRow('c1', 'op_1', { operator: true, name: 'Mina', primary: ['pt'] }),
      memberRow('c1', 'user_1', { name: 'João' }),
      memberRow('c2', 'op_1', { operator: true, name: 'Mina', primary: ['pt'] }),
      memberRow('c2', 'op_2', { operator: true, name: 'Leo', primary: ['en'] }),
      memberRow('c2', 'user_2', { name: 'Ana', isOfficial: true }),
    ])
    m.messageFindMany.mockResolvedValue([
      {
        id: 'm1', userId: 'user_1', createdAt: new Date('2026-09-30T09:00:00Z'), sourceLanguage: 'en', metadata: null,
        contents: [
          { contentType: 'SOURCE', language: 'en', text: 'Hello  there' },
          { contentType: 'TRANSLATION_FINAL', language: 'pt', text: 'Olá' },
          { contentType: 'TRANSLATION_FINAL', language: 'ko', text: '안녕' },
        ],
      },
      {
        id: 'm2', userId: 'user_2', createdAt: new Date('2026-09-30T08:00:00Z'), sourceLanguage: 'en',
        metadata: { image: { objectKey: 'conversation-images/x.jpg' } },
        contents: [{ contentType: 'SOURCE', language: 'en', text: '📷 Photo' }],
      },
    ])

    const result = await listOperatorInboxRooms()
    expect(result.nextCursor).toBeNull()
    expect(result.rooms).toHaveLength(2)
    const [first, second] = result.rooms
    expect(first).toMatchObject({
      conversationId: 'c1',
      isGroup: false,
      unreadCount: 3,
      blocked: false,
      activityAt: '2026-09-30T09:00:00.000Z',
      operators: [{ userId: 'op_1', name: 'Mina', personaLanguage: 'pt', unreadCount: 3, isOperator: true }],
      counterparts: [{ userId: 'user_1', name: 'João' }],
      latestMessage: { messageId: 'm1', kind: 'text', text: 'Olá', language: 'pt', koText: '안녕', fromOperator: false },
    })
    expect(first.counterparts[0]).not.toHaveProperty('isOperator')
    // Group room: the room's unread is its most-behind operator; the official counterpart keeps its flag.
    expect(second).toMatchObject({
      conversationId: 'c2',
      isGroup: true,
      unreadCount: 2,
      counterparts: [{ userId: 'user_2', isOfficial: true }],
      latestMessage: { kind: 'photo', text: '', koText: null },
    })
    expect(second.operators.map((operator) => [operator.userId, operator.unreadCount])).toEqual([['op_1', 0], ['op_2', 2]])
  })

  it("uses the filtered operator's own unread and paginates with a keyset cursor", async () => {
    routeQueries({
      page: [
        { conversationId: 'c1', sessionKey: 's1', latestMessageId: null, activityMs: 2000 },
        { conversationId: 'c2', sessionKey: 's2', latestMessageId: null, activityMs: 1000 },
      ],
      unread: [
        { channelId: 'c1', operatorUserId: 'op_1', unreadCount: 1 },
        { channelId: 'c1', operatorUserId: 'op_2', unreadCount: 9 },
      ],
    })
    m.memberFindMany.mockResolvedValue([
      memberRow('c1', 'op_1', { operator: true }),
      memberRow('c1', 'op_2', { operator: true }),
      memberRow('c1', 'user_1'),
    ])
    const result = await listOperatorInboxRooms({ operatorUserId: 'op_1', limit: 1, cursor: { activityMs: 5000, conversationId: 'c9' } })
    const pageQuery = m.queryRaw.mock.calls[0][0] as Prisma.Sql
    expect(pageQuery.text).toContain('AND member.user_id = $1')
    expect(pageQuery.values).toEqual(expect.arrayContaining(['op_1', 5000, 'c9', 2]))
    expect(result.rooms.map((room) => [room.conversationId, room.unreadCount])).toEqual([['c1', 1]])
    expect(result.nextCursor).toBe('2000.c1')
    expect(decodeInboxCursor(result.nextCursor)).toEqual({ activityMs: 2000, conversationId: 'c1' })
  })

  it('marks 1:1 rooms with a block in either direction', async () => {
    routeQueries({ page: [{ conversationId: 'c1', sessionKey: 's1', latestMessageId: null, activityMs: 1 }] })
    m.memberFindMany.mockResolvedValue([memberRow('c1', 'op_1', { operator: true }), memberRow('c1', 'user_1')])
    m.blockFindMany.mockResolvedValue([{ blockerId: 'user_1', blockedId: 'op_1' }])
    const result = await listOperatorInboxRooms()
    expect(result.rooms[0].blocked).toBe(true)
  })

  it('fills Korean previews through the staff translation only when asked', async () => {
    routeQueries({ page: [{ conversationId: 'c1', sessionKey: 's1', latestMessageId: 'm1', activityMs: 1 }] })
    m.memberFindMany.mockResolvedValue([memberRow('c1', 'op_1', { operator: true, primary: ['pt'] }), memberRow('c1', 'user_1')])
    m.messageFindMany.mockResolvedValue([{
      id: 'm1', userId: 'user_1', createdAt: new Date(1), sourceLanguage: 'es', metadata: null,
      contents: [{ contentType: 'SOURCE', language: 'es', text: 'Hola' }],
    }])
    m.translateForStaff.mockResolvedValue({ m1: '안녕하세요' })

    const plain = await listOperatorInboxRooms()
    expect(plain.rooms[0].latestMessage?.koText).toBeNull()
    expect(m.translateForStaff).not.toHaveBeenCalled()

    const korean = await listOperatorInboxRooms({ includeKorean: true })
    expect(korean.rooms[0].latestMessage?.koText).toBe('안녕하세요')
    expect(m.translateForStaff).toHaveBeenCalledWith([{ messageId: 'm1', text: 'Hola', sourceLanguage: 'es' }])
  })

  it('summarizes unread per operator with identities', async () => {
    routeQueries({
      total: [{ unreadTotal: 4 }],
      perOperator: [
        { operatorUserId: 'op_2', roomCount: 1, unreadCount: 0 },
        { operatorUserId: 'op_1', roomCount: 3, unreadCount: 4 },
      ],
    })
    m.userFindMany.mockResolvedValue([
      memberRow('', 'op_1', { operator: true, name: 'Mina', primary: ['pt'] }).user,
      memberRow('', 'op_2', { operator: true, name: 'Leo', primary: ['en'] }).user,
    ])
    const summary = await getOperatorInboxSummary()
    expect(summary.unreadTotal).toBe(4)
    expect(summary.operators.map((operator) => [operator.userId, operator.roomCount, operator.unreadCount, operator.personaLanguage]))
      .toEqual([['op_1', 3, 4, 'pt'], ['op_2', 1, 0, 'en']])
  })

  it('round-trips and rejects malformed cursors', () => {
    expect(decodeInboxCursor(encodeInboxCursor({ activityMs: 1727690400123, conversationId: 'cm1abc' })))
      .toEqual({ activityMs: 1727690400123, conversationId: 'cm1abc' })
    expect(decodeInboxCursor('abc')).toBeNull()
    expect(decodeInboxCursor('12.c1;drop')).toBeNull()
    expect(decodeInboxCursor(42)).toBeNull()
  })
})

describe('operator inbox room access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.blockFindMany.mockResolvedValue([])
    m.channelFindFirst.mockResolvedValue({ id: 'c1', sessionKey: 's1', pendingInviteeUserIds: [] })
    m.memberFindMany.mockResolvedValue([
      memberRow('c1', 'op_1', { operator: true, name: 'Mina', primary: ['pt'] }),
      memberRow('c1', 'user_1', { name: 'João' }),
    ])
    routeQueries({ unread: [{ channelId: 'c1', operatorUserId: 'op_1', unreadCount: 2 }] })
    m.requireOperatorAccount.mockResolvedValue({ id: 'op_1' })
    m.hydrate.mockResolvedValue({ conversation: { id: 'c1' }, utterances: [], leaveNotices: [], inviteNotices: [] })
    m.markRead.mockResolvedValue(true)
    m.writeAdminAudit.mockResolvedValue(undefined)
  })

  it('is not_found for a room without an active operator member (never reveals other rooms)', async () => {
    m.memberFindMany.mockResolvedValue([memberRow('c1', 'user_1'), memberRow('c1', 'user_2')])
    await expect(resolveInboxRoomAccess({ conversationId: 'c1' })).resolves.toEqual({ ok: false, error: 'not_found' })
    m.channelFindFirst.mockResolvedValue(null)
    await expect(resolveInboxRoomAccess({ conversationId: 'c1' })).resolves.toEqual({ ok: false, error: 'not_found' })
    await expect(resolveInboxRoomAccess({ conversationId: '../x' })).resolves.toEqual({ ok: false, error: 'not_found' })
  })

  it('queries active members only', async () => {
    await resolveInboxRoomAccess({ conversationId: 'c1' })
    expect(m.memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId: { in: ['c1'] }, leftAt: null },
    }))
  })

  it('picks the requested operator, refuses a non-operator `as`, and asks for a choice when writing to a multi-operator room', async () => {
    await expect(resolveInboxRoomAccess({ conversationId: 'c1', operatorUserId: 'user_1' }))
      .resolves.toEqual({ ok: false, error: 'operator_not_in_room' })

    m.memberFindMany.mockResolvedValue([
      memberRow('c1', 'op_1', { operator: true }),
      memberRow('c1', 'op_2', { operator: true }),
      memberRow('c1', 'user_1'),
    ])
    await expect(resolveInboxRoomAccess({ conversationId: 'c1', requireExplicitOperator: true }))
      .resolves.toEqual({ ok: false, error: 'operator_ambiguous' })
    const picked = await resolveInboxRoomAccess({ conversationId: 'c1', operatorUserId: 'op_2', requireExplicitOperator: true })
    expect(picked.ok && picked.room.operator.userId).toBe('op_2')
    const fallback = await resolveInboxRoomAccess({ conversationId: 'c1' })
    expect(fallback.ok && fallback.room.operator.userId).toBe('op_1')
  })

  it('explains why a reply is not possible', async () => {
    m.blockFindMany.mockResolvedValue([{ blockerId: 'op_1', blockedId: 'user_1' }])
    const blocked = await resolveInboxRoomAccess({ conversationId: 'c1' })
    expect(blocked.ok && blocked.room.replyUnavailableReason).toBe('blocked')

    m.blockFindMany.mockResolvedValue([])
    m.memberFindMany.mockResolvedValue([memberRow('c1', 'op_1', { operator: true })])
    const alone = await resolveInboxRoomAccess({ conversationId: 'c1' })
    expect(alone.ok && alone.room.replyUnavailableReason).toBe('no_recipients')

    m.memberFindMany.mockResolvedValue([memberRow('c1', 'op_1', { operator: true, isActive: false }), memberRow('c1', 'user_1')])
    const retired = await resolveInboxRoomAccess({ conversationId: 'c1' })
    expect(retired.ok && retired.room.replyUnavailableReason).toBe('operator_inactive')
  })

  it('hydrates as the operator after the operator guard, and audits only a real open', async () => {
    const quiet = await loadInboxRoomView({ ctx, conversationId: 'c1' })
    expect(quiet.ok).toBe(true)
    expect(m.requireOperatorAccount).toHaveBeenCalledWith('op_1')
    expect(m.hydrate).toHaveBeenCalledWith({ conversationId: 'c1', userId: 'op_1', before: null })
    expect(m.writeAdminAudit).not.toHaveBeenCalled()
    if (quiet.ok) {
      expect(quiet.view.room).not.toHaveProperty('sessionKey')
      expect(quiet.view.room.operator).toMatchObject({ userId: 'op_1', unreadCount: 2 })
    }

    await loadInboxRoomView({ ctx, conversationId: 'c1', auditOpen: true })
    expect(m.writeAdminAudit).toHaveBeenCalledWith(ctx, {
      action: 'inbox.open',
      operatorUserId: 'op_1',
      targetType: 'conversation',
      targetId: 'c1',
    })
  })

  it('refuses to hydrate when the operator guard fails', async () => {
    m.requireOperatorAccount.mockRejectedValue(new OperatorAccountRequiredError('op_1'))
    await expect(loadInboxRoomView({ ctx, conversationId: 'c1', auditOpen: true }))
      .resolves.toEqual({ ok: false, error: 'operator_required' })
    expect(m.hydrate).not.toHaveBeenCalled()
    expect(m.writeAdminAudit).not.toHaveBeenCalled()
  })

  it("marks read as the operator (only that operator's cursor) and audits it", async () => {
    await expect(markInboxRoomRead({ ctx, conversationId: 'c1' })).resolves.toEqual({ ok: true, operatorUserId: 'op_1' })
    expect(m.markRead).toHaveBeenCalledWith({ conversationId: 'c1', userId: 'op_1' })
    expect(m.writeAdminAudit).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'inbox.mark_read', operatorUserId: 'op_1', targetId: 'c1' }))

    m.requireOperatorAccount.mockRejectedValue(new OperatorAccountRequiredError('op_1'))
    m.markRead.mockClear()
    await expect(markInboxRoomRead({ ctx, conversationId: 'c1' })).resolves.toEqual({ ok: false, error: 'operator_required' })
    expect(m.markRead).not.toHaveBeenCalled()
  })
})

describe('inbox photo proxy lookup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('serves only visible photos from rooms with an active operator member', async () => {
    m.messageFindFirst.mockResolvedValue({ sessionKey: 's1', metadata: { image: { objectKey: 'conversation-images/abc-1.jpg' } } })
    m.memberFindFirst.mockResolvedValue({ id: 'mem_1' })
    await expect(resolveInboxPhotoObjectKey('m1')).resolves.toBe('conversation-images/abc-1.jpg')
    expect(m.memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ leftAt: null, user: { isOperator: true, isDeleted: false } }),
    }))

    m.memberFindFirst.mockResolvedValue(null)
    await expect(resolveInboxPhotoObjectKey('m1')).resolves.toBeNull()

    m.memberFindFirst.mockResolvedValue({ id: 'mem_1' })
    m.messageFindFirst.mockResolvedValue({ sessionKey: 's1', metadata: { image: { objectKey: 'post-images/u/x.jpg' } } })
    await expect(resolveInboxPhotoObjectKey('m1')).resolves.toBeNull()

    m.messageFindFirst.mockResolvedValue({ sessionKey: 's1', metadata: null })
    await expect(resolveInboxPhotoObjectKey('m1')).resolves.toBeNull()
    await expect(resolveInboxPhotoObjectKey('bad/id')).resolves.toBeNull()
  })
})
