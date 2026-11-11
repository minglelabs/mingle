import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
  grantLot: vi.fn(),
  hasLedgerEntry: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique, updateMany: mocks.updateMany, count: mocks.count } },
}))
vi.mock('@/server/coins/ledger', () => ({
  grantLot: mocks.grantLot,
  hasLedgerEntry: mocks.hasLedgerEntry,
  withLockedWallet: (userId: string, fn: (ctx: unknown) => Promise<unknown>) => fn({ wallet: { userId } }),
}))

import { ReferralError, ensureReferralCode, getReferralState, redeemReferralCode } from './referral'

type UserRow = Record<string, unknown>

function stubUsers(me: UserRow | null, inviter: UserRow | null) {
  mocks.findUnique.mockImplementation(async ({ where }: { where: { id?: string; referralCode?: string } }) => (
    where.referralCode ? inviter : me
  ))
}

async function redeemError(code: unknown): Promise<string> {
  try {
    await redeemReferralCode('me', code)
  } catch (error) {
    if (error instanceof ReferralError) return error.code
    throw error
  }
  return 'no_error'
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.hasLedgerEntry.mockResolvedValue(false)
  mocks.grantLot.mockResolvedValue({ lotId: 'lot' })
})

describe('redeemReferralCode', () => {
  it('pays 1,000 free coins to both sides, once each', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, { id: 'friend', referredByUserId: null })
    await expect(redeemReferralCode('me', ' AB3DE ')).resolves.toEqual({ rewardCoins: 1000 })

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'me', referredByUserId: null },
      data: expect.objectContaining({ referredByUserId: 'friend' }),
    }))
    expect(mocks.grantLot.mock.calls.map(([ctx, input]) => [ctx.wallet.userId, input.idempotencyKey, input.amountMicro, input.isFree, input.source]))
      .toEqual([
        ['me', 'referral:invitee:me', 1_000_000_000n, true, 'referral'],
        ['friend', 'referral:inviter:friend:me', 1_000_000_000n, true, 'referral'],
      ])
  })

  it('rejects a bad, unknown, own, repeated or mutual code without paying', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, null)
    expect(await redeemError('abc')).toBe('invalid_code')
    expect(await redeemError('abcde')).toBe('not_found')

    stubUsers({ id: 'me', referredByUserId: null }, { id: 'me', referredByUserId: null })
    expect(await redeemError('abcde')).toBe('own_code')

    stubUsers({ id: 'me', referredByUserId: 'someone' }, { id: 'friend', referredByUserId: null })
    expect(await redeemError('abcde')).toBe('already_redeemed')

    stubUsers({ id: 'me', referredByUserId: null }, { id: 'friend', referredByUserId: 'me' })
    expect(await redeemError('abcde')).toBe('not_allowed')

    stubUsers({ id: 'me', referredByUserId: null, isOperator: true }, { id: 'friend', referredByUserId: null })
    expect(await redeemError('abcde')).toBe('not_allowed')

    expect(mocks.grantLot).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('loses the race to a second request without paying', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, { id: 'friend', referredByUserId: null })
    mocks.updateMany.mockResolvedValue({ count: 0 })
    expect(await redeemError('abcde')).toBe('already_redeemed')
    expect(mocks.grantLot).not.toHaveBeenCalled()
  })

  it('does not pay again for a ledger key that already exists', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, { id: 'friend', referredByUserId: null })
    mocks.hasLedgerEntry.mockResolvedValue(true)
    await redeemReferralCode('me', 'abcde')
    expect(mocks.grantLot).not.toHaveBeenCalled()
  })

  it('frees the claim when paying fails, so the person can retry', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, { id: 'friend', referredByUserId: null })
    mocks.grantLot.mockRejectedValueOnce(new Error('db down'))
    await expect(redeemReferralCode('me', 'abcde')).rejects.toThrow('db down')
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'me', referredByUserId: 'friend' },
      data: { referredByUserId: null, referredAt: null },
    })
  })
})

describe('ensureReferralCode', () => {
  it('returns the stored code', async () => {
    mocks.findUnique.mockResolvedValue({ referralCode: 'abcde' })
    await expect(ensureReferralCode('me')).resolves.toBe('abcde')
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('makes a code and tries again when it is taken', async () => {
    mocks.findUnique.mockResolvedValue({ referralCode: null })
    mocks.updateMany.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({ count: 1 })
    const code = await ensureReferralCode('me')
    expect(code).toMatch(/^[a-z0-9]{5}$/)
    expect(mocks.updateMany).toHaveBeenCalledTimes(2)
  })
})

describe('getReferralState', () => {
  it('asks to show the contact-sync screen only when it was never shown', async () => {
    mocks.count.mockResolvedValue(2)
    mocks.findUnique.mockResolvedValue({ referralCode: 'abcde', referredByUserId: null, contactSyncPromptedAt: null })
    await expect(getReferralState('me')).resolves.toEqual({
      code: 'abcde', rewardCoins: 1000, redeemed: false, invitedCount: 2, shouldPromptContactSync: true,
    })
    mocks.findUnique.mockResolvedValue({ referralCode: 'abcde', referredByUserId: 'friend', contactSyncPromptedAt: new Date() })
    await expect(getReferralState('me')).resolves.toMatchObject({ redeemed: true, shouldPromptContactSync: false })
  })
})
