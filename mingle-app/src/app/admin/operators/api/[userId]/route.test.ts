import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  getOperatorAccountDetail: vi.fn(),
  updateOperatorAccount: vi.fn(),
  after: vi.fn(),
}))

vi.mock('next/server', async importOriginal => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/admin/guard', () => ({ requireAdminApi: mocks.requireAdminApi }))
vi.mock('@/server/operators/operator-admin-query', () => ({ getOperatorAccountDetail: mocks.getOperatorAccountDetail }))
vi.mock('@/server/operators/create-operator', async importOriginal => ({
  ...(await importOriginal<typeof import('@/server/operators/create-operator')>()),
  updateOperatorAccount: mocks.updateOperatorAccount,
}))

import { OperatorHandleTakenError } from '@/server/operators/create-operator'
import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import { GET, PATCH } from './route'

const CTX = { sessionId: null, ip: null, userAgent: null }
const context = (userId = 'op_1') => ({ params: Promise.resolve({ userId }) })

function patch(body: unknown, userId = 'op_1') {
  return PATCH(new Request(`https://example.com/admin/operators/api/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }), context(userId))
}

describe('/admin/operators/api/[userId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApi.mockResolvedValue({ ok: true, ctx: CTX })
    mocks.getOperatorAccountDetail.mockResolvedValue({ id: 'op_1', handle: 'mina.k' })
    mocks.updateOperatorAccount.mockResolvedValue({ changed: ['name'] })
  })

  it('requires an admin session for both methods', async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    expect((await GET(new Request('https://example.com'), context())).status).toBe(401)
    expect((await patch({ name: 'Mina' })).status).toBe(401)
    expect(mocks.updateOperatorAccount).not.toHaveBeenCalled()
  })

  it('GET returns 404 for anyone who is not an operator account', async () => {
    mocks.getOperatorAccountDetail.mockResolvedValue(null)
    expect((await GET(new Request('https://example.com'), context('user_1'))).status).toBe(404)
  })

  it('PATCH validates before writing', async () => {
    const response = await patch({ handle: 'no spaces allowed' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_patch', errors: [{ field: 'handle', error: 'invalid_handle' }] })
    expect(mocks.updateOperatorAccount).not.toHaveBeenCalled()
  })

  it('PATCH refuses non-operators and maps a taken handle to 409', async () => {
    mocks.updateOperatorAccount.mockRejectedValueOnce(new OperatorAccountRequiredError('user_1'))
    expect((await patch({ name: 'Mina' }, 'user_1')).status).toBe(404)

    mocks.updateOperatorAccount.mockRejectedValueOnce(new OperatorHandleTakenError())
    const taken = await patch({ handle: 'taken.one' })
    expect(taken.status).toBe(409)
    expect(await taken.json()).toEqual({ error: 'handle_taken', errors: [{ field: 'handle', error: 'handle_taken' }] })
  })

  it('PATCH applies the parsed patch with the admin context and returns the fresh account', async () => {
    const response = await patch({ name: ' Mina ', notes: 'beach' })
    expect(response.status).toBe(200)
    expect(mocks.updateOperatorAccount).toHaveBeenCalledWith(CTX, 'op_1', { name: 'Mina', notes: 'beach' })
    expect(await response.json()).toEqual({ account: { id: 'op_1', handle: 'mina.k' } })
    expect(mocks.after).not.toHaveBeenCalled()

    mocks.updateOperatorAccount.mockResolvedValueOnce({ changed: ['bio'] })
    expect((await patch({ bio: 'hello' })).status).toBe(200)
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })
})
