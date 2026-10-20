import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const m = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  countUnread: vi.fn(),
  loadInboxList: vi.fn(),
  loadInboxRoomView: vi.fn(),
  resolveAccess: vi.fn(),
  markRead: vi.fn(),
  photoKey: vi.fn(),
  sendOperatorMessage: vi.fn(),
  translateRoom: vi.fn(),
  getImage: vi.fn(),
}))

vi.mock('@/server/admin/guard', () => ({ requireAdminApi: m.requireAdminApi }))
vi.mock('@/server/operator-inbox/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operator-inbox/inbox')>()),
  countOperatorInboxUnread: m.countUnread,
  loadInboxList: m.loadInboxList,
  loadInboxRoomView: m.loadInboxRoomView,
  resolveInboxRoomAccess: m.resolveAccess,
  markInboxRoomRead: m.markRead,
  resolveInboxPhotoObjectKey: m.photoKey,
}))
vi.mock('@/server/operator-inbox/send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operator-inbox/send')>()),
  sendOperatorMessage: m.sendOperatorMessage,
}))
vi.mock('@/server/operator-inbox/staff-translate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operator-inbox/staff-translate')>()),
  translateRoomMessagesForStaff: m.translateRoom,
}))
vi.mock('@/server/conversation-image-storage', () => ({ getConversationImage: m.getImage }))

import { GET as getSummary } from '@/app/admin/inbox/api/summary/route'
import { GET as getRooms } from '@/app/admin/inbox/api/rooms/route'
import { GET as getRoom } from '@/app/admin/inbox/api/rooms/[conversationId]/route'
import { POST as postMessage } from '@/app/admin/inbox/api/rooms/[conversationId]/messages/route'
import { POST as postRead } from '@/app/admin/inbox/api/rooms/[conversationId]/read/route'
import { POST as postTranslate } from '@/app/admin/inbox/api/rooms/[conversationId]/translate/route'
import { GET as getImage } from '@/app/admin/inbox/api/images/[messageId]/route'
import { OperatorSendError } from '@/server/operator-inbox/send'
import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'

const ctx = { sessionId: null, ip: '127.0.0.1', userAgent: 'test' }
const params = (conversationId = 'conv_1') => ({ params: Promise.resolve({ conversationId }) })
const roomAccess = (operatorUserId = 'op_1') => ({
  ok: true,
  room: { conversationId: 'conv_1', sessionKey: 'sess_1', operator: { userId: operatorUserId } },
})

function post(path: string, body: unknown): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('admin inbox API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.requireAdminApi.mockResolvedValue({ ok: true, ctx })
  })

  it('every route answers 401 without an admin session and touches nothing', async () => {
    m.requireAdminApi.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    const responses = await Promise.all([
      getSummary(),
      getRooms(new Request('https://example.com/admin/inbox/api/rooms')),
      getRoom(new Request('https://example.com/admin/inbox/api/rooms/conv_1'), params()),
      postMessage(post('/admin/inbox/api/rooms/conv_1/messages', { text: 'hi' }), params()),
      postRead(post('/admin/inbox/api/rooms/conv_1/read', {}), params()),
      postTranslate(post('/admin/inbox/api/rooms/conv_1/translate', { messageIds: ['m1'] }), params()),
      getImage(new Request('https://example.com/admin/inbox/api/images/m1'), { params: Promise.resolve({ messageId: 'm1' }) }),
    ])
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401, 401])
    for (const mock of [m.countUnread, m.loadInboxList, m.loadInboxRoomView, m.sendOperatorMessage, m.markRead, m.translateRoom, m.photoKey]) {
      expect(mock).not.toHaveBeenCalled()
    }
  })

  it('summary returns the unread total, uncached', async () => {
    m.countUnread.mockResolvedValue(5)
    const response = await getSummary()
    expect(await response.json()).toEqual({ unreadTotal: 5 })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rooms passes filter, cursor, limit and the Korean flag, and rejects malformed ones', async () => {
    m.loadInboxList.mockResolvedValue({ rooms: [], nextCursor: null, unreadTotal: 0, operators: [], serverNowMs: 1 })
    const ok = await getRooms(new Request('https://example.com/admin/inbox/api/rooms?operator=op_1&cursor=123.conv_9&limit=30&ko=1'))
    expect(ok.status).toBe(200)
    expect(m.loadInboxList).toHaveBeenCalledWith({
      operatorUserId: 'op_1',
      cursor: { activityMs: 123, conversationId: 'conv_9' },
      limit: 30,
      includeKorean: true,
    })
    expect((await getRooms(new Request('https://example.com/admin/inbox/api/rooms?cursor=nope'))).status).toBe(400)
    expect((await getRooms(new Request('https://example.com/admin/inbox/api/rooms?operator=a%20b'))).status).toBe(400)
  })

  it('room hydration audits inbox.open only for a first-page open=1 request', async () => {
    m.loadInboxRoomView.mockResolvedValue({ ok: true, view: { room: {}, hydration: {} } })
    await getRoom(new Request('https://example.com/admin/inbox/api/rooms/conv_1?as=op_2'), params())
    expect(m.loadInboxRoomView).toHaveBeenLastCalledWith({
      ctx, conversationId: 'conv_1', operatorUserId: 'op_2', before: null, auditOpen: false,
    })
    await getRoom(new Request('https://example.com/admin/inbox/api/rooms/conv_1?open=1'), params())
    expect(m.loadInboxRoomView).toHaveBeenLastCalledWith(expect.objectContaining({ auditOpen: true }))
    await getRoom(new Request('https://example.com/admin/inbox/api/rooms/conv_1?open=1&beforeMs=100&beforeId=msg_1'), params())
    expect(m.loadInboxRoomView).toHaveBeenLastCalledWith(expect.objectContaining({
      before: { createdAtMs: 100, messageId: 'msg_1' },
      auditOpen: false,
    }))
  })

  it('room hydration maps access errors to 404/403', async () => {
    m.loadInboxRoomView.mockResolvedValue({ ok: false, error: 'not_found' })
    expect((await getRoom(new Request('https://example.com/admin/inbox/api/rooms/conv_1'), params())).status).toBe(404)
    m.loadInboxRoomView.mockResolvedValue({ ok: false, error: 'operator_required' })
    expect((await getRoom(new Request('https://example.com/admin/inbox/api/rooms/conv_1'), params())).status).toBe(403)
    expect((await getRoom(new Request('https://example.com/admin/inbox/api/rooms/x'), params('../etc'))).status).toBe(404)
  })

  it('reply resolves the operator (explicit when ambiguous) and returns 201, or 200 for a retry', async () => {
    m.resolveAccess.mockResolvedValue(roomAccess('op_2'))
    m.sendOperatorMessage.mockResolvedValue({ duplicate: false, messageId: 'msg_1', utterance: {} })
    const created = await postMessage(post('/x', { text: 'Olá', as: 'op_2', clientRequestId: 'req-00000001' }), params())
    expect(created.status).toBe(201)
    expect(m.resolveAccess).toHaveBeenCalledWith({ conversationId: 'conv_1', operatorUserId: 'op_2', requireExplicitOperator: true })
    expect(m.sendOperatorMessage).toHaveBeenCalledWith(ctx, {
      operatorUserId: 'op_2', conversationId: 'conv_1', text: 'Olá', clientRequestId: 'req-00000001',
    })

    m.sendOperatorMessage.mockResolvedValue({ duplicate: true, messageId: 'msg_1', utterance: {} })
    expect((await postMessage(post('/x', { text: 'Olá' }), params())).status).toBe(200)
  })

  it('reply maps refusals: ambiguous operator 400, non-operator 403, retryable translation failure 503', async () => {
    m.resolveAccess.mockResolvedValue({ ok: false, error: 'operator_ambiguous' })
    expect((await postMessage(post('/x', { text: 'hi' }), params())).status).toBe(400)

    m.resolveAccess.mockResolvedValue(roomAccess())
    m.sendOperatorMessage.mockRejectedValue(new OperatorAccountRequiredError('op_1'))
    const notOperator = await postMessage(post('/x', { text: 'hi' }), params())
    expect(notOperator.status).toBe(403)
    expect(await notOperator.json()).toEqual({ error: 'operator_required' })

    m.sendOperatorMessage.mockRejectedValue(new OperatorSendError('translation_failed'))
    const failed = await postMessage(post('/x', { text: 'hi' }), params())
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ error: 'translation_failed', retryable: true })

    m.sendOperatorMessage.mockRejectedValue(new OperatorSendError('blocked'))
    expect((await postMessage(post('/x', { text: 'hi' }), params())).status).toBe(403)
  })

  it('reply rejects a malformed body before resolving anything', async () => {
    expect((await postMessage(post('/x', 'not json'), params())).status).toBe(400)
    expect((await postMessage(post('/x', { text: 12 }), params())).status).toBe(400)
    expect((await postMessage(post('/x', { text: 'hi', clientRequestId: 42 }), params())).status).toBe(400)
    expect((await postMessage(post('/x', { text: 'hi', as: 'no spaces allowed' }), params())).status).toBe(403)
    expect(m.resolveAccess).not.toHaveBeenCalled()
    expect(m.sendOperatorMessage).not.toHaveBeenCalled()
  })

  it('read marks the room read as the operator', async () => {
    m.markRead.mockResolvedValue({ ok: true, operatorUserId: 'op_1' })
    const response = await postRead(post('/x', { as: 'op_1' }), params())
    expect(response.status).toBe(200)
    expect(m.markRead).toHaveBeenCalledWith({ ctx, conversationId: 'conv_1', operatorUserId: 'op_1' })
    m.markRead.mockResolvedValue({ ok: false, error: 'operator_required' })
    expect((await postRead(post('/x', {}), params())).status).toBe(403)
  })

  it('translate validates ids, requires an inbox room and returns staff-only Korean', async () => {
    expect((await postTranslate(post('/x', { messageIds: [] }), params())).status).toBe(400)
    expect((await postTranslate(post('/x', { messageIds: Array.from({ length: 51 }, (_, i) => `m${i}`) }), params())).status).toBe(400)
    expect((await postTranslate(post('/x', { messageIds: ['ok', 'bad id'] }), params())).status).toBe(400)

    m.resolveAccess.mockResolvedValue({ ok: false, error: 'not_found' })
    expect((await postTranslate(post('/x', { messageIds: ['m1'] }), params())).status).toBe(404)
    expect(m.translateRoom).not.toHaveBeenCalled()

    m.resolveAccess.mockResolvedValue(roomAccess())
    m.translateRoom.mockResolvedValue({ m1: '안녕하세요' })
    const response = await postTranslate(post('/x', { messageIds: ['m1'] }), params())
    expect(await response.json()).toEqual({ language: 'ko', translations: { m1: '안녕하세요' } })
    expect(m.translateRoom).toHaveBeenCalledWith({ sessionKey: 'sess_1', messageIds: ['m1'], language: 'ko' })
  })

  it('image proxy serves only inbox photos', async () => {
    const context = { params: Promise.resolve({ messageId: 'm1' }) }
    m.photoKey.mockResolvedValue(null)
    expect((await getImage(new Request('https://example.com/i'), context)).status).toBe(404)
    expect(m.getImage).not.toHaveBeenCalled()

    m.photoKey.mockResolvedValue('conversation-images/a.jpg')
    m.getImage.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const response = await getImage(new Request('https://example.com/i'), { params: Promise.resolve({ messageId: 'm1' }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(m.getImage).toHaveBeenCalledWith('conversation-images/a.jpg')

    m.getImage.mockRejectedValue(new Error('s3 down'))
    expect((await getImage(new Request('https://example.com/i'), { params: Promise.resolve({ messageId: 'm1' }) })).status).toBe(503)
  })
})
