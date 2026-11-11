import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  blockFindFirst: vi.fn(),
  followFindUnique: vi.fn(),
  followCreate: vi.fn(),
  notificationCreate: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    userFollow: { findUnique: mocks.followFindUnique, create: mocks.followCreate },
    userNotification: { create: mocks.notificationCreate },
  }
  return {
    prisma: {
      user: { findMany: mocks.userFindMany },
      userBlock: { findFirst: mocks.blockFindFirst },
      $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    },
  }
})
vi.mock('@/server/push-notifications', () => ({ sendPushNotificationForUserNotification: mocks.push }))

import { ensureMutualFollowBetween } from './mutual-follow'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.userFindMany.mockResolvedValue([
    { id: 'a', inAppNotificationsEnabled: true },
    { id: 'b', inAppNotificationsEnabled: true },
  ])
  mocks.blockFindFirst.mockResolvedValue(null)
  mocks.followFindUnique.mockResolvedValue(null)
  let n = 0
  mocks.notificationCreate.mockImplementation(async () => ({ id: `n${++n}` }))
  mocks.push.mockResolvedValue(undefined)
})

describe('ensureMutualFollowBetween', () => {
  it('makes both follows, one notification and push each', async () => {
    await expect(ensureMutualFollowBetween('a', 'b')).resolves.toBe(2)
    expect(mocks.followCreate.mock.calls.map(([arg]) => arg.data)).toEqual([
      { followerId: 'a', followingId: 'b' },
      { followerId: 'b', followingId: 'a' },
    ])
    expect(mocks.notificationCreate.mock.calls.map(([arg]) => arg.data)).toEqual([
      { recipientId: 'b', actorId: 'a', type: 'follow' },
      { recipientId: 'a', actorId: 'b', type: 'follow' },
    ])
    expect(mocks.push).toHaveBeenCalledTimes(2)
  })

  it('only adds the missing follow, and no notification when they turned it off', async () => {
    mocks.followFindUnique.mockImplementation(async ({ where }) => (
      where.followerId_followingId.followerId === 'a' ? { id: 'existing' } : null
    ))
    mocks.userFindMany.mockResolvedValue([
      { id: 'a', inAppNotificationsEnabled: false },
      { id: 'b', inAppNotificationsEnabled: true },
    ])
    await expect(ensureMutualFollowBetween('a', 'b')).resolves.toBe(1)
    expect(mocks.followCreate).toHaveBeenCalledWith({ data: { followerId: 'b', followingId: 'a' } })
    expect(mocks.notificationCreate).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('does nothing across a block, for a missing account, or for oneself', async () => {
    mocks.blockFindFirst.mockResolvedValueOnce({ id: 'block' })
    await expect(ensureMutualFollowBetween('a', 'b')).resolves.toBe(0)
    mocks.userFindMany.mockResolvedValueOnce([{ id: 'a', inAppNotificationsEnabled: true }])
    await expect(ensureMutualFollowBetween('a', 'b')).resolves.toBe(0)
    await expect(ensureMutualFollowBetween('a', 'a')).resolves.toBe(0)
    expect(mocks.followCreate).not.toHaveBeenCalled()
  })

  it('keeps the follows when a push fails', async () => {
    mocks.push.mockRejectedValueOnce(new Error('apns'))
    await expect(ensureMutualFollowBetween('a', 'b')).resolves.toBe(2)
  })
})
