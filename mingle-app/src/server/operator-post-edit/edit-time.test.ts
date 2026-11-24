import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { post: { findUnique: mocks.findUnique, update: mocks.update } } }))
vi.mock('@/server/admin/audit', () => ({ writeAdminAudit: mocks.audit }))

import { editOperatorPostTime } from './edit'

const NOW = new Date('2026-11-24T08:00:00Z')
const ctx = { sessionId: 's', ip: null, userAgent: null } as never

describe('moving a published operator post to another time', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue({ id: 'p1', authorId: 'op1', bodyVersion: 1, sourceText: 'x', sourceLanguage: 'ko', author: { isOperator: true } })
  })

  it('sets both its publish and creation time', async () => {
    await expect(editOperatorPostTime(ctx, 'p1', '2026-11-24T05:37:12.000Z', NOW)).resolves.toEqual({ ok: true })
    const at = new Date('2026-11-24T05:37:12.000Z')
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { publishedAt: at, createdAt: at } })
  })

  it('refuses a future or unreadable time, and real users\' posts', async () => {
    await expect(editOperatorPostTime(ctx, 'p1', '2026-11-25T00:00:00Z', NOW)).resolves.toMatchObject({ ok: false, error: 'invalid_time' })
    await expect(editOperatorPostTime(ctx, 'p1', 'nope', NOW)).resolves.toMatchObject({ ok: false, error: 'invalid_time' })
    mocks.findUnique.mockResolvedValue({ id: 'p2', author: { isOperator: false } })
    await expect(editOperatorPostTime(ctx, 'p2', '2026-11-24T05:00:00Z', NOW)).resolves.toMatchObject({ ok: false, error: 'not_found' })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
