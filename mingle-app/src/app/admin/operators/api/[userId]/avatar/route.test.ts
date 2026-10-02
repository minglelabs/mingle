import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => {
  const pipeline: Record<string, ReturnType<typeof vi.fn>> = {}
  pipeline.metadata = vi.fn(async () => ({ format: 'jpeg' }))
  pipeline.rotate = vi.fn(() => pipeline)
  pipeline.resize = vi.fn(() => pipeline)
  pipeline.flatten = vi.fn(() => pipeline)
  pipeline.jpeg = vi.fn(() => pipeline)
  pipeline.toBuffer = vi.fn(async () => Buffer.from('rendered-jpeg'))
  return {
    pipeline,
    sharp: vi.fn(() => pipeline),
    requireAdminApi: vi.fn(),
    requireOperatorAccount: vi.fn(),
    putProfileImage: vi.fn(),
    deleteProfileImage: vi.fn(),
    userFindUnique: vi.fn(),
    userUpdate: vi.fn(),
    writeAdminAudit: vi.fn(),
  }
})

vi.mock('sharp', () => ({ default: mocks.sharp }))
vi.mock('@/server/admin/guard', () => ({ requireAdminApi: mocks.requireAdminApi }))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mocks.writeAdminAudit }))
vi.mock('@/server/profile-image-storage', () => ({ putProfileImage: mocks.putProfileImage, deleteProfileImage: mocks.deleteProfileImage }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate } } }))
vi.mock('@/server/operators/operator-guard', async importOriginal => ({
  ...(await importOriginal<typeof import('@/server/operators/operator-guard')>()),
  requireOperatorAccount: mocks.requireOperatorAccount,
}))

import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import { avatarRequestTooLarge } from '@/server/operators/operator-avatar'
import { POST } from './route'

const CTX = { sessionId: null, ip: '203.0.113.9', userAgent: 'test' }

function upload(file: File | null, userId = 'op_1') {
  const form = new FormData()
  if (file) form.append('file', file)
  const request = new Request(`https://example.com/admin/operators/api/${userId}/avatar`, { method: 'POST', body: form })
  return POST(request, { params: Promise.resolve({ userId }) })
}

function jpeg(size = 16): File {
  return new File([new Uint8Array(size)], 'photo.jpg', { type: 'image/jpeg' })
}

describe('POST /admin/operators/api/[userId]/avatar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.pipeline.metadata.mockResolvedValue({ format: 'jpeg' })
    mocks.requireAdminApi.mockResolvedValue({ ok: true, ctx: CTX })
    mocks.requireOperatorAccount.mockResolvedValue({ id: 'op_1', handle: 'yuki.tnk' })
    mocks.putProfileImage.mockImplementation(async ({ objectKey }: { objectKey: string }) => `https://cdn.example.com/${objectKey}`)
    mocks.userFindUnique.mockResolvedValue({ imageObjectKey: 'profiles/op_1/old.jpg' })
    mocks.userUpdate.mockResolvedValue({ id: 'op_1' })
    mocks.deleteProfileImage.mockResolvedValue(undefined)
  })

  it('requires an admin session', async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    const response = await upload(jpeg())
    expect(response.status).toBe(401)
    expect(mocks.requireOperatorAccount).not.toHaveBeenCalled()
  })

  it('refuses a user who is not an operator account before reading the photo', async () => {
    mocks.requireOperatorAccount.mockRejectedValue(new OperatorAccountRequiredError('user_1'))
    const response = await upload(jpeg(), 'user_1')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'operator_not_found' })
    expect(mocks.sharp).not.toHaveBeenCalled()
    expect(mocks.putProfileImage).not.toHaveBeenCalled()
    expect(mocks.userUpdate).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing file', null, 'image_required'],
    ['a GIF', new File([new Uint8Array(8)], 'a.gif', { type: 'image/gif' }), 'invalid_image'],
    ['an empty file', new File([], 'a.jpg', { type: 'image/jpeg' }), 'invalid_image'],
    ['a file over 10 MB', jpeg(10 * 1024 * 1024 + 1), 'invalid_image'],
  ])('rejects %s', async (_label, file, error) => {
    const response = await upload(file)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error })
    expect(mocks.putProfileImage).not.toHaveBeenCalled()
  })

  it('rejects bytes that are not really jpeg/png/webp', async () => {
    mocks.pipeline.metadata.mockResolvedValue({ format: 'gif' })
    const response = await upload(jpeg())
    expect(response.status).toBe(400)
    expect(mocks.putProfileImage).not.toHaveBeenCalled()
  })

  it('re-encodes to a 1024 square JPEG, stores it under the account, resets the crop, deletes the old photo and audits', async () => {
    const response = await upload(jpeg())
    expect(response.status).toBe(200)

    expect(mocks.sharp).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ animated: false }))
    expect(mocks.pipeline.rotate).toHaveBeenCalled()
    expect(mocks.pipeline.resize).toHaveBeenCalledWith(expect.objectContaining({ width: 1024, height: 1024, fit: 'cover' }))
    expect(mocks.pipeline.jpeg).toHaveBeenCalledWith({ quality: 85 })

    const put = mocks.putProfileImage.mock.calls[0][0]
    expect(put.objectKey).toMatch(/^profiles\/op_1\/[0-9a-f-]{36}\.jpg$/)
    expect(put.contentType).toBe('image/jpeg')
    expect(Buffer.from(put.body).toString()).toBe('rendered-jpeg')

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'op_1' },
      data: {
        image: `https://cdn.example.com/${put.objectKey}`,
        imageObjectKey: put.objectKey,
        imageCropScale: 1,
        imageCropX: 0,
        imageCropY: 0,
      },
      select: { id: true },
    })
    expect(mocks.deleteProfileImage).toHaveBeenCalledWith('profiles/op_1/old.jpg')
    expect(mocks.writeAdminAudit).toHaveBeenCalledWith(CTX, expect.objectContaining({ action: 'operator.avatar', operatorUserId: 'op_1' }))
    expect(await response.json()).toEqual({ image: `https://cdn.example.com/${put.objectKey}` })
  })

  it('never deletes an object outside the account prefix', async () => {
    mocks.userFindUnique.mockResolvedValue({ imageObjectKey: 'profiles/someone-else/x.jpg' })
    expect((await upload(jpeg())).status).toBe(200)
    expect(mocks.deleteProfileImage).not.toHaveBeenCalled()
  })

  it('reports missing storage and removes the new object when the profile update fails', async () => {
    mocks.putProfileImage.mockRejectedValueOnce(new Error('profile_image_storage_not_configured'))
    expect((await upload(jpeg())).status).toBe(503)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.userUpdate.mockRejectedValueOnce(new Error('db down'))
    const response = await upload(jpeg())
    expect(response.status).toBe(500)
    const newKey = mocks.putProfileImage.mock.calls.at(-1)![0].objectKey
    expect(mocks.deleteProfileImage).toHaveBeenCalledWith(newKey)
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('flags requests whose declared size is over the limit', () => {
    expect(avatarRequestTooLarge(new Headers({ 'content-length': String(11 * 1024 * 1024) }))).toBe(true)
    expect(avatarRequestTooLarge(new Headers({ 'content-length': '1024' }))).toBe(false)
  })
})
