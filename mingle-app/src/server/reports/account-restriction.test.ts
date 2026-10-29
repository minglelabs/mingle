import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUserFindUnique } = vi.hoisted(() => ({ mockUserFindUnique: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mockUserFindUnique } } }))

import { accountRestrictionGuard, isAccountRestricted } from './account-restriction'

describe('account restriction guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads moderationRestrictedAt for the given user', async () => {
    mockUserFindUnique.mockResolvedValue({ moderationRestrictedAt: null })
    await expect(isAccountRestricted('u1')).resolves.toBe(false)
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { moderationRestrictedAt: true },
    })
  })

  it('lets an unrestricted (or unknown) account through', async () => {
    mockUserFindUnique.mockResolvedValue({ moderationRestrictedAt: null })
    await expect(accountRestrictionGuard('u1')).resolves.toBeNull()
    mockUserFindUnique.mockResolvedValue(null)
    await expect(accountRestrictionGuard('u1')).resolves.toBeNull()
  })

  it('answers 403 account_restricted for a restricted account', async () => {
    mockUserFindUnique.mockResolvedValue({ moderationRestrictedAt: new Date('2026-09-26T00:00:00Z') })
    const res = await accountRestrictionGuard('u1')
    expect(res?.status).toBe(403)
    await expect(res?.json()).resolves.toEqual({ error: 'account_restricted' })
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
