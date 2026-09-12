import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import sharp from 'sharp'
const m = vi.hoisted(() => ({ session: vi.fn(), member: vi.fn(), blocked: vi.fn(), materialize: vi.fn(), members: vi.fn(), notify: vi.fn(), push: vi.fn(), after: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), put: vi.fn(), get: vi.fn(), remove: vi.fn() }))
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: m.after }))
vi.mock('@/server/push-notifications', () => ({ sendPushNotificationForConversationMessage: m.push }))
vi.mock('next-auth', () => ({ getServerSession: m.session }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({ prisma: { appMessage: { findUnique: m.findUnique, findFirst: m.findFirst, create: m.create } } }))
vi.mock('@/lib/app-conversations', () => ({ getConversationSessionKeyForMember: m.member, isMessageSenderBlockedInConversation: m.blocked, materializePendingConversationInvitees: m.materialize, listChannelMemberUserIdsBySessionKey: m.members }))
vi.mock('@/server/conversation-image-storage', () => ({ putConversationImage: m.put, getConversationImage: m.get, deleteConversationImage: m.remove }))
vi.mock('@/server/conversation-realtime', () => ({ notifyConversationMessage: m.notify }))
import { postConversationImage, readConversationImage } from './conversation-image-controller'
const url = 'http://localhost/api/conversations/room/images'
function upload(bytes: Uint8Array, type = 'image/png', id = 'image-client-message') {
  const data = new FormData(); data.set('file', new File([new Uint8Array(bytes)], 'photo.png', { type })); data.set('clientMessageId', id)
  return new NextRequest(url, { method: 'POST', body: data })
}
beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: 'alice' } }); m.member.mockResolvedValue('session'); m.blocked.mockResolvedValue(false)
  m.members.mockResolvedValue(['alice', 'bob']); m.findUnique.mockResolvedValue(null)
  m.create.mockImplementation(async ({ data }) => ({ id: 'db-image', ...data, createdAt: new Date() }))
  m.put.mockResolvedValue(undefined); m.remove.mockResolvedValue(undefined)
})
const png = () => sharp({ create: { width: 64, height: 32, channels: 3, background: '#ffa000' } }).png().withMetadata({ orientation: 6 }).toBuffer()
describe('conversation images', () => {
  it.each([['anonymous', 401], ['nonmember', 404], ['blocked', 403]])('rejects %s before storage access', async (who, status) => {
    if (who === 'anonymous') m.session.mockResolvedValue(null)
    if (who === 'nonmember') m.member.mockResolvedValue(null)
    if (who === 'blocked') m.blocked.mockResolvedValue(true)
    expect((await postConversationImage(upload(await png()), 'room')).status).toBe(status)
    expect(m.put).not.toHaveBeenCalled()
  })
  it('decodes, rotates and strips metadata before storing a JPEG and one message', async () => {
    const response = await postConversationImage(upload(await png()), 'room')
    expect(response.status).toBe(201)
    const output = await sharp(m.put.mock.calls[0][1]).metadata()
    expect(output).toMatchObject({ format: 'jpeg', width: 32, height: 64 })
    expect(output.exif).toBeUndefined(); expect(output.orientation).toBeUndefined()
    expect(m.create.mock.calls[0][0].data).toMatchObject({ userId: 'alice', sessionKey: 'session', clientMessageId: 'image-client-message', contents: { create: { text: '📷 Photo' } } })
    expect(m.materialize).toHaveBeenCalledWith('session', expect.any(Date))
    expect(m.notify).toHaveBeenCalledWith('session', ['alice', 'bob'], undefined, { timeoutMs: 3000 })
    expect(m.after).toHaveBeenCalledTimes(1)
    expect(m.push).not.toHaveBeenCalled()
    await m.after.mock.calls[0][0]()
    expect(m.push).toHaveBeenCalledWith({ messageId: 'db-image', sessionKey: 'session', senderUserId: 'alice', sourceText: '📷 Photo', memberUserIds: ['alice', 'bob'] })
  })
  it('rejects spoofed raster content and excessive payloads', async () => {
    expect((await postConversationImage(upload(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), 'room')).status).toBe(400)
    expect((await postConversationImage(new NextRequest(url, { method: 'POST', headers: { 'Content-Length': String(11 * 1024 * 1024) } }), 'room')).status).toBe(413)
    expect(m.put).not.toHaveBeenCalled()
  })
  it('reuses a committed matching request after a lost response instead of uploading again', async () => {
    const bytes = await png()
    m.findUnique.mockResolvedValue({ id: 'db-image', userId: 'alice', createdAt: new Date(), metadata: { image: { objectKey: 'conversation-images/key.jpg', sha256: createHash('sha256').update(bytes).digest('hex'), width: 32, height: 64 } } })
    expect((await postConversationImage(upload(bytes), 'room')).status).toBe(201)
    expect(m.put).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled()
    expect(m.after).not.toHaveBeenCalled()
  })
  it('removes only its losing upload when a concurrent identical retry already committed', async () => {
    const bytes = await png()
    const winner = { id: 'winning-image', userId: 'alice', createdAt: new Date(), metadata: { image: { objectKey: 'conversation-images/winner.jpg', sha256: createHash('sha256').update(bytes).digest('hex'), width: 32, height: 64 } } }
    m.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner)
    m.create.mockRejectedValue(new Error('unique_constraint'))
    const response = await postConversationImage(upload(bytes), 'room')
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ messageId: 'winning-image' })
    expect(m.remove).toHaveBeenCalledWith(m.put.mock.calls[0][0])
    expect(m.remove).not.toHaveBeenCalledWith('conversation-images/winner.jpg')
    expect(m.after).not.toHaveBeenCalled()
  })
  it('keeps a committed photo successful when background push delivery fails', async () => {
    m.push.mockRejectedValue(new Error('push_unavailable'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await postConversationImage(upload(await png()), 'room')).status).toBe(201)
      await expect(m.after.mock.calls[0][0]()).resolves.toBeUndefined()
      expect(m.push).toHaveBeenCalledTimes(1)
      expect(m.remove).not.toHaveBeenCalled()
    } finally { error.mockRestore() }
  })
  it('resolves recipients after pending invitees have been materialized', async () => {
    m.members.mockResolvedValue(['alice'])
    m.materialize.mockImplementation(async () => { m.members.mockResolvedValue(['alice', 'new-member']) })
    expect((await postConversationImage(upload(await png()), 'room')).status).toBe(201)
    await m.after.mock.calls[0][0]()
    expect(m.push).toHaveBeenCalledWith(expect.objectContaining({ memberUserIds: ['alice', 'new-member'] }))
  })
  it('cannot reuse another sender message identifier', async () => {
    m.findUnique.mockResolvedValue({ id: 'db-image', userId: 'bob' })
    expect((await postConversationImage(upload(await png()), 'room')).status).toBe(409)
    expect(m.put).not.toHaveBeenCalled()
  })
  it('cleans up an uploaded object if membership is revoked during upload', async () => {
    m.member.mockResolvedValueOnce('session').mockResolvedValueOnce(null)
    expect((await postConversationImage(upload(await png()), 'room')).status).toBe(403)
    expect(m.remove).toHaveBeenCalledWith(m.put.mock.calls[0][0]); expect(m.create).not.toHaveBeenCalled()
  })
  it('does not create a message when object storage fails', async () => {
    m.put.mockRejectedValue(new Error('unavailable'))
    expect((await postConversationImage(upload(await png()), 'room')).status).toBe(503)
    expect(m.create).not.toHaveBeenCalled()
    expect(m.after).not.toHaveBeenCalled()
  })
  it('only serves images belonging to visible messages in the authorized room', async () => {
    m.findFirst.mockResolvedValue({ metadata: { image: { objectKey: 'conversation-images/key.jpg', sha256: 'hash', width: 32, height: 64 } } })
    m.get.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const response = await readConversationImage(new NextRequest(url), 'room', 'db-image')
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/jpeg'); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(m.findFirst.mock.calls[0][0].where).toEqual({ id: 'db-image', sessionKey: 'session', OR: [{ isDeleted: null }, { isDeleted: false }] })
    m.member.mockResolvedValue(null)
    expect((await readConversationImage(new NextRequest(url), 'room', 'db-image')).status).toBe(404)
    expect(m.get).toHaveBeenCalledTimes(1)
  })
})
