import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUserFindUnique, mockReserveFindFirst, mockReserveCreate, mockQueryRaw, mockAudit } = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
  mockReserveFindFirst: vi.fn(),
  mockReserveCreate: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockAudit: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    operatorPostReserve: { findFirst: mockReserveFindFirst, create: mockReserveCreate },
    $queryRaw: mockQueryRaw,
  },
}))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mockAudit }))

import { queueOperatorAppPostForReview } from './queue-app-post'

describe('queueOperatorAppPostForReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReserveFindFirst.mockResolvedValue(null)
    mockQueryRaw.mockResolvedValue([{ low: 3 }])
    mockReserveCreate.mockResolvedValue({ id: 'reserve-1' })
  })

  it('leaves a member post alone', async () => {
    mockUserFindUnique.mockResolvedValue({ isOperator: false })
    expect(await queueOperatorAppPostForReview({ authorId: 'u1', text: 'hi', images: [] })).toBeNull()
    expect(mockReserveCreate).not.toHaveBeenCalled()
  })

  it('puts an operator post at the front of the review queue with its photos', async () => {
    mockUserFindUnique.mockResolvedValue({ isOperator: true })
    const result = await queueOperatorAppPostForReview({
      authorId: 'op1',
      text: 'hello',
      images: [{ objectKey: 'k1', width: 10, height: 20 }, { objectKey: 'k2', width: null, height: null }],
    })
    expect(result).toEqual({ reserveId: 'reserve-1' })
    expect(mockReserveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        operatorUserId: 'op1', text: 'hello', state: 'review', reviewRank: 2,
        imageObjectKey: 'k1', imageWidth: 10, imageHeight: 20,
        extraImages: [{ objectKey: 'k2', width: null, height: null }],
      }),
    }))
  })

  it('reuses the copy a resend already queued', async () => {
    mockUserFindUnique.mockResolvedValue({ isOperator: true })
    mockReserveFindFirst.mockResolvedValue({ id: 'reserve-0' })
    expect(await queueOperatorAppPostForReview({ authorId: 'op1', text: 'hello', images: [] })).toEqual({ reserveId: 'reserve-0' })
    expect(mockReserveCreate).not.toHaveBeenCalled()
  })
})
