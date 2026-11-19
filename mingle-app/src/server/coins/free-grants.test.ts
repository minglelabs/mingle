import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { account: { findFirst: mocks.findFirst } } }))

import { isFreeCoinGrantEligible } from './free-grants'

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.COIN_FREE_GRANTS_ALLOW_EMAIL
})

describe('free Hash eligibility', () => {
  it('is for accounts signed in with Apple or Google', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'a1' })
    expect(await isFreeCoinGrantEligible('u1')).toBe(true)
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', provider: { in: ['apple', 'google'] } },
      select: { id: true },
    })
  })

  it('is not for an email-only account, unless the server allows it (devbox)', async () => {
    mocks.findFirst.mockResolvedValue(null)
    expect(await isFreeCoinGrantEligible('u1')).toBe(false)
    expect(await isFreeCoinGrantEligible('')).toBe(false)
    process.env.COIN_FREE_GRANTS_ALLOW_EMAIL = '1'
    expect(await isFreeCoinGrantEligible('u1')).toBe(true)
  })
})
