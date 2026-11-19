import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ userFindMany: vi.fn(), channelFindMany: vi.fn() }))
vi.mock('@/lib/signup-welcome-onboarding', () => ({ ROYCE_USER_ID: 'royce' }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: db.userFindMany }, appConversationChannel: { findMany: db.channelFindMany } },
}))

import { checkDailyNewChatLimit, newPeopleFromOpenedRooms, readDailyNewChatLimit } from './daily-new-chat-limit'

const env = (value?: string) => ({ DAILY_NEW_CHAT_LIMIT: value }) as unknown as NodeJS.ProcessEnv
const room = (others: string[], pending: string[] = []) => ({ ownerUserId: 'me', pendingInviteeUserIds: pending, members: [{ userId: 'me' }, ...others.map((userId) => ({ userId }))] })

beforeEach(() => {
  vi.clearAllMocks()
  db.userFindMany.mockImplementation(async ({ where }: { where: { isOfficial?: unknown } }) => (
    where.isOfficial ? [] : [{ id: 'me', isOperator: false, isOfficial: false }, { id: 'target', isOperator: false, isOfficial: false }]
  ))
  db.channelFindMany.mockResolvedValue([])
})

describe('daily new chat limit', () => {
  it('is 1 by default, reads a number, and can be turned off', () => {
    expect(readDailyNewChatLimit(env())).toBe(1)
    expect(readDailyNewChatLimit(env('3'))).toBe(3)
    expect(readDailyNewChatLimit(env('off'))).toBeNull()
    expect(readDailyNewChatLimit(env('0'))).toBeNull()
    expect(readDailyNewChatLimit(env('abc'))).toBe(1)
  })

  it('counts the other person of each 1:1 room the user opened, pending invitees included', () => {
    const people = newPeopleFromOpenedRooms('me', [
      { ownerUserId: 'me', memberUserIds: ['me', 'a'], pendingInviteeUserIds: [] },
      { ownerUserId: 'me', memberUserIds: ['me'], pendingInviteeUserIds: ['b'] },
      { ownerUserId: 'me', memberUserIds: ['me', 'a'], pendingInviteeUserIds: [] },
      { ownerUserId: 'me', memberUserIds: ['me', 'c', 'd'], pendingInviteeUserIds: [] },
      { ownerUserId: 'me', memberUserIds: ['me'], pendingInviteeUserIds: [] },
      { ownerUserId: 'x', memberUserIds: ['x', 'me'], pendingInviteeUserIds: [] },
      { ownerUserId: 'me', memberUserIds: ['me'], pendingInviteeUserIds: ['royce'] },
    ], ['royce'])
    expect([...people].sort()).toEqual(['a', 'b'])
  })

  it('lets the first new person of the day through and stops the second', async () => {
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    db.channelFindMany.mockResolvedValue([room([], ['someone'])])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: false, limit: 1 })
    expect(db.channelFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { ownerUserId: 'me', createdAt: { gte: expect.any(Date) } },
    }))
  })

  it('does not count the same person twice, the welcome account, or the official account', async () => {
    db.channelFindMany.mockResolvedValue([room(['target'])])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    db.channelFindMany.mockResolvedValue([room(['royce'])])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    db.channelFindMany.mockResolvedValue([room(['operator'])])
    db.userFindMany.mockImplementation(async ({ where }: { where: { isOfficial?: unknown } }) => (
      where.isOfficial ? [{ id: 'operator' }] : [{ id: 'me', isOperator: false, isOfficial: false }, { id: 'target', isOperator: false, isOfficial: false }]
    ))
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
  })

  it('never limits the welcome account, a staff account doing the writing, the official account, or anyone while it is off', async () => {
    db.channelFindMany.mockResolvedValue([room(['someone'])])
    await expect(checkDailyNewChatLimit('me', 'royce', { env: env() })).resolves.toEqual({ allowed: true })
    await expect(checkDailyNewChatLimit('me', 'target', { env: env('off') })).resolves.toEqual({ allowed: true })
    db.userFindMany.mockResolvedValue([{ id: 'me', isOperator: true, isOfficial: false }, { id: 'target', isOperator: false, isOfficial: false }])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
  })

  it('counts an operator account like anyone else', async () => {
    db.channelFindMany.mockResolvedValue([{ ownerUserId: 'me', pendingInviteeUserIds: [], members: [{ userId: 'me' }, { userId: 'someone' }] }])
    db.userFindMany.mockImplementation(async ({ where }: { where: { isOfficial?: unknown } }) => (
      where.isOfficial ? [] : [{ id: 'me', isOperator: false, isOfficial: false }, { id: 'target', isOperator: true, isOfficial: false }]
    ))
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: false, limit: 1 })
    db.userFindMany.mockImplementation(async ({ where }: { where: { isOfficial?: unknown } }) => (
      where.isOfficial ? [] : [{ id: 'me', isOperator: false, isOfficial: false }, { id: 'target', isOperator: false, isOfficial: true }]
    ))
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
  })

  it('raises with the configured number', async () => {
    db.channelFindMany.mockResolvedValue([room(['a']), room(['b'])])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env('3') })).resolves.toEqual({ allowed: true })
    await expect(checkDailyNewChatLimit('me', 'target', { env: env('2') })).resolves.toEqual({ allowed: false, limit: 2 })
  })
})
