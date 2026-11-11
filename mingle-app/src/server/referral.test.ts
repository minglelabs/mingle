import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
  grantLot: vi.fn(),
  hasLedgerEntry: vi.fn(),
  findOrCreateDirectConversation: vi.fn(),
  capture: vi.fn(),
  userFindMany: vi.fn(),
  messageFindUnique: vi.fn(),
  messageFindFirst: vi.fn(),
  mutualFollow: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, updateMany: mocks.updateMany, count: mocks.count, findMany: mocks.userFindMany },
    appMessage: { findUnique: mocks.messageFindUnique, findFirst: mocks.messageFindFirst },
  },
}))
vi.mock('@/lib/app-conversations', () => ({ findOrCreateDirectConversation: mocks.findOrCreateDirectConversation }))
vi.mock('@/lib/posthog-server', () => ({ captureMingleEvent: mocks.capture }))
vi.mock('@/server/follows/mutual-follow', () => ({ ensureMutualFollowBetween: mocks.mutualFollow }))
vi.mock('@/server/coins/ledger', () => ({
  grantLot: mocks.grantLot,
  hasLedgerEntry: mocks.hasLedgerEntry,
  withLockedWallet: (userId: string, fn: (ctx: unknown) => Promise<unknown>) => fn({ wallet: { userId } }),
}))

import {
  ReferralError,
  acceptInvite,
  ensureReferralCode,
  getReferralState,
  noteInvitePairMessage,
  redeemReferralCode,
  resolveInviteFirstChatRewardCoins,
  resolveInviteJoinRewardCoins,
} from './referral'

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
  mocks.findOrCreateDirectConversation.mockResolvedValue({ conversation: { id: 'room1' }, reused: false })
  mocks.mutualFollow.mockResolvedValue(2)
  delete process.env.COIN_INVITE_JOIN_COINS
  delete process.env.COIN_INVITE_FIRST_CHAT_COINS
})

describe('redeemReferralCode', () => {
  it('pays 1,000 free coins to both sides, once each', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, { id: 'friend', referredByUserId: null })
    await expect(redeemReferralCode('me', ' AB3DE ', { source: 'link' })).resolves.toEqual({ rewardCoins: 1000, inviterUserId: 'friend' })
    expect(mocks.mutualFollow).toHaveBeenCalledWith('me', 'friend')

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'me', referredByUserId: null },
      data: expect.objectContaining({ referredByUserId: 'friend', referralSource: 'link', usagePurpose: 'social', discoverySource: 'friend' }),
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
      data: { referredByUserId: null, referredAt: null, referralSource: null },
    })
  })
})

describe('invite reward settings', () => {
  it('uses the provisional amounts unless the environment says otherwise', () => {
    expect(resolveInviteJoinRewardCoins(undefined)).toBe(1000)
    expect(resolveInviteJoinRewardCoins('500')).toBe(500)
    expect(resolveInviteJoinRewardCoins('0')).toBe(0)
    expect(resolveInviteJoinRewardCoins('abc')).toBe(1000)
    expect(resolveInviteFirstChatRewardCoins(undefined)).toBe(0)
    expect(resolveInviteFirstChatRewardCoins('300')).toBe(300)
  })

  it('keeps an existing usage purpose and pays nothing when the join reward is 0', async () => {
    process.env.COIN_INVITE_JOIN_COINS = '0'
    stubUsers({ id: 'me', referredByUserId: null, usagePurpose: 'work', discoverySource: 'threads' }, { id: 'friend', referredByUserId: null })
    await expect(redeemReferralCode('me', 'abcde')).resolves.toMatchObject({ rewardCoins: 0 })
    const data = mocks.updateMany.mock.calls[0][0].data
    expect(data).not.toHaveProperty('usagePurpose')
    expect(data).not.toHaveProperty('discoverySource')
    expect(mocks.grantLot).not.toHaveBeenCalled()
  })
})

describe('acceptInvite', () => {
  const inviter = { id: 'friend', name: 'Yuki', referredByUserId: null, isActive: true }

  it('accepts the invite and opens the 1:1 room with the inviter', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, inviter)
    await expect(acceptInvite('me', 'abcde', { source: 'install_referrer', locale: 'ja' })).resolves.toEqual({
      rewarded: true, rewardCoins: 1000, conversationId: 'room1', inviterName: 'Yuki',
    })
    expect(mocks.findOrCreateDirectConversation).toHaveBeenCalledWith({ userId: 'me', targetUserId: 'friend', locale: 'ja' })
    expect(mocks.mutualFollow).toHaveBeenCalledWith('me', 'friend')
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({
      event: 'mingle_invite_accepted',
      properties: expect.objectContaining({ invite_source: 'install_referrer' }),
    }))
  })

  it('still opens the room, unpaid, for an account that already accepted an invite', async () => {
    stubUsers({ id: 'me', referredByUserId: 'someone' }, inviter)
    await expect(acceptInvite('me', 'abcde')).resolves.toEqual({
      rewarded: false, rewardCoins: 0, conversationId: 'room1', inviterName: 'Yuki',
    })
    expect(mocks.grantLot).not.toHaveBeenCalled()
    expect(mocks.mutualFollow).toHaveBeenCalledWith('me', 'friend')
  })

  it('keeps the invite when the follows cannot be made', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, inviter)
    mocks.mutualFollow.mockRejectedValueOnce(new Error('db down'))
    await expect(acceptInvite('me', 'abcde')).resolves.toMatchObject({ rewarded: true, conversationId: 'room1' })
  })

  it('rejects an unknown or own code and survives a room that cannot open', async () => {
    stubUsers({ id: 'me', referredByUserId: null }, null)
    await expect(acceptInvite('me', 'abcde')).rejects.toMatchObject({ code: 'not_found' })
    stubUsers({ id: 'me', referredByUserId: null }, { ...inviter, id: 'me' })
    await expect(acceptInvite('me', 'abcde')).rejects.toMatchObject({ code: 'own_code' })
    stubUsers({ id: 'me', referredByUserId: null }, inviter)
    mocks.findOrCreateDirectConversation.mockRejectedValueOnce(new Error('target_user_blocked'))
    await expect(acceptInvite('me', 'abcde')).resolves.toMatchObject({ rewarded: true, conversationId: null })
  })
})

describe('noteInvitePairMessage', () => {
  const now = new Date('2026-11-11T12:00:00Z')

  it('does nothing more for a sender in no invite pair', async () => {
    mocks.userFindMany.mockResolvedValue([])
    await noteInvitePairMessage({ userId: 'me', messageId: 'm1', now })
    expect(mocks.messageFindUnique).not.toHaveBeenCalled()
  })

  it('marks the first chat once both have written in the room, and pays the configured bonus', async () => {
    process.env.COIN_INVITE_FIRST_CHAT_COINS = '300'
    mocks.userFindMany.mockResolvedValue([{ id: 'me', externalUserId: 'track-me', referredByUserId: 'friend', referralFirstChatAt: null }])
    mocks.messageFindUnique.mockResolvedValue({ sessionKey: 'room-key' })
    mocks.messageFindFirst.mockResolvedValueOnce(null)
    await noteInvitePairMessage({ userId: 'me', messageId: 'm1', now })
    expect(mocks.updateMany).not.toHaveBeenCalled()

    mocks.messageFindFirst.mockResolvedValueOnce({ id: 'm0' })
    await noteInvitePairMessage({ userId: 'me', messageId: 'm2', now })
    expect(mocks.messageFindFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { sessionKey: 'room-key', userId: 'friend' } }))
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 'me', referralFirstChatAt: null }, data: { referralFirstChatAt: now } })
    expect(mocks.grantLot.mock.calls.map(([ctx, input]) => [ctx.wallet.userId, input.idempotencyKey, input.amountMicro])).toEqual([
      ['me', 'referral:first-chat:invitee:me', 300_000_000n],
      ['friend', 'referral:first-chat:inviter:friend:me', 300_000_000n],
    ])
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ distinctId: 'track-me', event: 'mingle_invite_first_chat' }))
  })

  it('pays no first-chat bonus by default', async () => {
    mocks.userFindMany.mockResolvedValue([{ id: 'me', externalUserId: null, referredByUserId: 'friend', referralFirstChatAt: null }])
    mocks.messageFindUnique.mockResolvedValue({ sessionKey: 'room-key' })
    mocks.messageFindFirst.mockResolvedValue({ id: 'm0' })
    await noteInvitePairMessage({ userId: 'friend', messageId: 'm2', now })
    expect(mocks.grantLot).not.toHaveBeenCalled()
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ event: 'mingle_invite_first_chat' }))
  })

  it('counts talking again only 12 hours to 7 days after the first chat', async () => {
    mocks.messageFindUnique.mockResolvedValue({ sessionKey: 'room-key' })
    mocks.messageFindFirst.mockResolvedValue({ id: 'm0' })
    const pair = (hoursAgo: number) => [{
      id: 'me', externalUserId: 'track-me', referredByUserId: 'friend',
      referralFirstChatAt: new Date(now.getTime() - hoursAgo * 3_600_000),
    }]
    mocks.userFindMany.mockResolvedValue(pair(2))
    await noteInvitePairMessage({ userId: 'me', messageId: 'm3', now })
    mocks.userFindMany.mockResolvedValue(pair(8 * 24))
    await noteInvitePairMessage({ userId: 'me', messageId: 'm3', now })
    expect(mocks.updateMany).not.toHaveBeenCalled()

    mocks.userFindMany.mockResolvedValue(pair(30))
    await noteInvitePairMessage({ userId: 'me', messageId: 'm3', now })
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 'me', referralRechatAt: null }, data: { referralRechatAt: now } })
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ event: 'mingle_invite_rechat_7d' }))
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
