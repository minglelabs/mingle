import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  createOperatorAccount: vi.fn(),
  whenOperatorBioQueueIdle: vi.fn(async () => {}),
  after: vi.fn(),
}))

vi.mock('next/server', async importOriginal => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/admin/guard', () => ({ requireAdminApi: mocks.requireAdminApi }))
vi.mock('@/server/operators/create-operator', () => ({ createOperatorAccount: mocks.createOperatorAccount }))
vi.mock('@/server/operators/bio-queue', () => ({ whenOperatorBioQueueIdle: mocks.whenOperatorBioQueueIdle }))

import { OperatorHandleUnavailableError } from '@/server/operators/operator-handles'
import { POST } from './route'

const CTX = { sessionId: 'sess-1', ip: null, userAgent: null }
const DRAFT = {
  name: 'Lucas Silva',
  handle: 'lucas.silva',
  personaCountry: 'BR',
  city: 'São Paulo',
  birthYear: 1996,
  bio: 'Futebol, música e café ☕',
  primaryLanguage: 'pt',
  gender: 'male',
}

function call(body: unknown) {
  return POST(new Request('https://example.com/admin/operators/api/create', { method: 'POST', body: JSON.stringify(body) }))
}

describe('POST /admin/operators/api/create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminApi.mockResolvedValue({ ok: true, ctx: CTX })
  })

  it('requires an admin session', async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    expect((await call({ drafts: [DRAFT] })).status).toBe(401)
    expect(mocks.createOperatorAccount).not.toHaveBeenCalled()
  })

  it('rejects an empty or oversized batch', async () => {
    expect((await call({ drafts: [] })).status).toBe(400)
    expect((await call({ drafts: Array.from({ length: 21 }, () => DRAFT) })).status).toBe(400)
  })

  it('answers one result per draft: created, invalid, handle unavailable, failed', async () => {
    mocks.createOperatorAccount
      .mockResolvedValueOnce({ userId: 'op_1', handle: 'lucas.silva', requestedHandle: 'lucas.silva', bioQueued: true })
      .mockRejectedValueOnce(new OperatorHandleUnavailableError())
      .mockRejectedValueOnce(new Error('db down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await call({
      drafts: [
        { ...DRAFT, notes: 'football' },
        { ...DRAFT, handle: 'Admin', birthYear: 2012 },
        { ...DRAFT, handle: 'lucas.s' },
        { ...DRAFT, handle: 'lucas.x' },
      ],
    })
    expect(response.status).toBe(200)
    const { results } = await response.json()
    expect(results).toEqual([
      { index: 0, ok: true, userId: 'op_1', handle: 'lucas.silva', requestedHandle: 'lucas.silva', bioQueued: true },
      {
        index: 1,
        ok: false,
        error: 'invalid_draft',
        errors: [{ field: 'handle', error: 'reserved_handle' }, { field: 'birthYear', error: 'too_young' }],
      },
      { index: 2, ok: false, error: 'handle_unavailable', errors: [{ field: 'handle', error: 'handle_taken' }] },
      { index: 3, ok: false, error: 'create_failed' },
    ])
    // The invalid draft never reached the create service; the valid one got its notes and the admin context.
    expect(mocks.createOperatorAccount).toHaveBeenCalledTimes(3)
    expect(mocks.createOperatorAccount.mock.calls[0][0]).toBe(CTX)
    expect(mocks.createOperatorAccount.mock.calls[0][1]).toMatchObject({ handle: 'lucas.silva', countryName: 'Brazil', city: 'São Paulo' })
    expect(mocks.createOperatorAccount.mock.calls[0][2]).toEqual({ notes: 'football' })
    // Queued bios keep running after the response.
    expect(mocks.after).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
