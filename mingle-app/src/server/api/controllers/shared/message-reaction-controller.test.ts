import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({
  session: vi.fn(), member: vi.fn(), blocked: vi.fn(), notify: vi.fn(),
  findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), reactions: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/app-conversations', () => ({ getConversationSessionKeyForMember: mocks.member, isMessageSenderBlockedInConversation: mocks.blocked }))
vi.mock('@/server/conversation-realtime', () => ({ notifyConversationMessage: mocks.notify }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  appMessage: { findFirst: mocks.findFirst, findMany: mocks.findMany },
  appMessageReaction: { upsert: mocks.upsert, deleteMany: mocks.deleteMany, findMany: mocks.reactions },
} }))
import { getMessageReactions, putMessageReaction } from './message-reaction-controller'
const request = (body: unknown) => new NextRequest('http://localhost/api/conversations/room/reactions', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ user: { id: 'viewer' } })
  mocks.member.mockResolvedValue('room-session')
  mocks.blocked.mockResolvedValue(false)
  mocks.findFirst.mockResolvedValue({ id: 'message-db' })
  mocks.reactions.mockResolvedValue([{ kind: 'heart', userId: 'viewer' }])
})
describe('message reaction permissions and persistence', () => {
  it.each([['anonymous', 401], ['nonmember', 404], ['blocked', 403]])('rejects %s writes', async (who, status) => {
    if (who === 'anonymous') mocks.session.mockResolvedValue(null)
    if (who === 'nonmember') mocks.member.mockResolvedValue(null)
    if (who === 'blocked') mocks.blocked.mockResolvedValue(true)
    expect((await putMessageReaction(request({ messageId: 'client', kind: 'heart' }), 'room')).status).toBe(status)
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })
  it.each([null, {}, { messageId: 'client', kind: 'fire' }, { messageId: '', kind: 'heart' }])('rejects malformed reaction %j', async body => {
    expect((await putMessageReaction(request(body), 'room')).status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('scopes the message lookup to this room and excludes deleted messages', async () => {
    mocks.findFirst.mockResolvedValue(null)
    expect((await putMessageReaction(request({ messageId: 'foreign-message', kind: 'like' }), 'room')).status).toBe(404)
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual(expect.objectContaining({ sessionKey: 'room-session', AND: expect.arrayContaining([{ OR: [{ isDeleted: null }, { isDeleted: false }] }]) }))
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('sets the authenticated user reaction idempotently and publishes after persistence', async () => {
    const response = await putMessageReaction(request({ messageId: 'client', kind: 'heart', userId: 'someone-else' }), 'room')
    expect(await response.json()).toEqual({ reactions: [{ kind: 'heart', count: 1, mine: true }] })
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { messageId_userId: { messageId: 'message-db', userId: 'viewer' } }, create: { messageId: 'message-db', userId: 'viewer', kind: 'heart' }, update: { kind: 'heart' } })
    expect(mocks.notify).toHaveBeenCalledWith('room-session', [], undefined, { timeoutMs: 3000 })
    expect(mocks.notify.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.upsert.mock.invocationCallOrder[0])
  })
  it('removes only the viewer reaction', async () => {
    await putMessageReaction(request({ messageId: 'client', kind: null }), 'room')
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { messageId: 'message-db', userId: 'viewer' } })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('returns bounded, private summaries with stable message identifiers', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'one', clientMessageId: 'client', reactions: [{ userId: 'viewer', kind: 'heart' }] }, { id: 'old', clientMessageId: null, reactions: [] }])
    const response = await getMessageReactions(new NextRequest('http://localhost/api/conversations/room/reactions?id=client&id=db-old'), 'room')
    expect(await response.json()).toEqual({ reactions: { client: [{ kind: 'heart', count: 1, mine: true }], 'db-old': [] } })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('rejects unauthorized reads and unbounded batches', async () => {
    const url = 'http://localhost/api/conversations/room/reactions'
    expect((await getMessageReactions(new NextRequest(url), 'room')).status).toBe(400)
    expect((await getMessageReactions(new NextRequest(`${url}?${Array.from({ length: 101 }, (_, i) => `id=${i}`).join('&')}`), 'room')).status).toBe(400)
    mocks.member.mockResolvedValue(null)
    expect((await getMessageReactions(new NextRequest(`${url}?id=client`), 'room')).status).toBe(404)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})

describe('reaction participant list', () => {
  const query = (suffix: string) => new NextRequest(`http://localhost/api/conversations/room/reactions?${suffix}`)
  it('returns only public names/handles for the selected reaction and identifies the viewer', async () => {
    mocks.reactions.mockResolvedValue([{ userId: 'viewer', user: { name: 'Alice', handle: 'alice' } }])
    const response = await getMessageReactions(query('id=client&kind=heart'), 'room')
    expect(await response.json()).toEqual({ participants: [{ id: 'viewer', name: 'Alice', handle: 'alice', mine: true }], nextCursor: null })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.reactions).toHaveBeenCalledWith({ where: { messageId: 'message-db', kind: 'heart' }, orderBy: { userId: 'asc' }, take: 51, select: { userId: true, user: { select: { name: true, handle: true } } } })
  })
  it('paginates without depending on the cursor user still having a reaction', async () => {
    mocks.reactions.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ userId: `user-${String(i).padStart(3, '0')}`, user: { name: null, handle: `handle-${i}` } })))
    const body = await (await getMessageReactions(query('id=client&kind=like&after=deleted-user'), 'room')).json()
    expect(body.participants).toHaveLength(50)
    expect(body.nextCursor).toBe('user-049')
    expect(mocks.reactions.mock.calls[0][0].where.userId).toEqual({ gt: 'deleted-user' })
  })
  it.each(['id=client&kind=unknown', 'id=a&id=b&kind=heart', 'id=client&kind=heart&after=', 'id=client&after=user'])('rejects malformed participant query %s', async suffix => {
    expect((await getMessageReactions(query(suffix), 'room')).status).toBe(400)
    expect(mocks.reactions).not.toHaveBeenCalled()
  })
  it('denies nonmembers and messages absent from this room', async () => {
    mocks.member.mockResolvedValue(null)
    expect((await getMessageReactions(query('id=client&kind=heart'), 'room')).status).toBe(404)
    mocks.member.mockResolvedValue('room-session')
    mocks.findFirst.mockResolvedValue(null)
    expect((await getMessageReactions(query('id=client&kind=heart'), 'room')).status).toBe(404)
    expect(mocks.reactions).not.toHaveBeenCalled()
  })
})
