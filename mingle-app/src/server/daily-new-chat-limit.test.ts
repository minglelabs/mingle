import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ userFindMany: vi.fn(), channelFindMany: vi.fn() }))
vi.mock('@/lib/signup-welcome-onboarding', () => ({ ROYCE_USER_ID: 'royce' }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: db.userFindMany }, appConversationChannel: { findMany: db.channelFindMany } },
}))

import { checkDailyNewChatLimit, isLimitedPair, newPeopleFromOpenedRooms, readDailyNewChatLimit } from './daily-new-chat-limit'

const env = (value?: string) => ({ DAILY_NEW_CHAT_LIMIT: value }) as unknown as NodeJS.ProcessEnv
const room = (others: string[], pending: string[] = []) => ({ ownerUserId: 'me', pendingInviteeUserIds: pending, members: [{ userId: 'me' }, ...others.map((userId) => ({ userId }))] })

type Account = { id: string; isOperator?: boolean; isOfficial?: boolean; gender?: string | null }
// The pair (me, target) and the genders of everyone written to today.
function accounts(pair: Account[], women: string[] = []) {
  db.userFindMany.mockImplementation(async ({ where }: { where: { gender?: unknown } }) => (
    where.gender === 'female'
      ? women.map((id) => ({ id }))
      : pair.map((account) => ({ isOperator: false, isOfficial: false, ...account }))
  ))
}
const man = { id: 'me', gender: 'male' }
const woman = { id: 'target', gender: 'female' }

beforeEach(() => {
  vi.clearAllMocks()
  accounts([man, woman])
  db.channelFindMany.mockResolvedValue([])
})

describe('daily new chat limit (a man to new women, 3 a day)', () => {
  it('is 3 by default, reads a number, and can be turned off', () => {
    expect(readDailyNewChatLimit(env())).toBe(3)
    expect(readDailyNewChatLimit(env('5'))).toBe(5)
    expect(readDailyNewChatLimit(env('off'))).toBeNull()
    expect(readDailyNewChatLimit(env('0'))).toBeNull()
    expect(readDailyNewChatLimit(env('abc'))).toBe(3)
  })

  it('limits only a man writing to a woman', () => {
    expect(isLimitedPair('male', 'female')).toBe(true)
    expect(isLimitedPair('male', 'male')).toBe(false)
    expect(isLimitedPair('female', 'female')).toBe(false)
    expect(isLimitedPair('female', 'male')).toBe(false)
    expect(isLimitedPair(null, 'female')).toBe(false)
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

  it('lets a man write to three new women a day and stops the fourth', async () => {
    db.channelFindMany.mockResolvedValue([room(['a']), room(['b'])])
    accounts([man, woman], ['a', 'b'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    db.channelFindMany.mockResolvedValue([room(['a']), room(['b']), room([], ['c'])])
    accounts([man, woman], ['a', 'b', 'c'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: false, limit: 3 })
    expect(db.channelFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { ownerUserId: 'me', createdAt: { gte: expect.any(Date) } },
    }))
  })

  it('counts only the women written to (men, the official account and the welcome account do not use up the day)', async () => {
    db.channelFindMany.mockResolvedValue([room(['a']), room(['b']), room(['c']), room(['royce'])])
    accounts([man, woman], ['a'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
  })

  it('never limits man to man, woman to anyone, the same woman again, staff, or anyone while it is off', async () => {
    db.channelFindMany.mockResolvedValue([room(['a']), room(['b']), room(['c'])])
    accounts([man, { id: 'target', gender: 'male' }], ['a', 'b', 'c'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    accounts([{ id: 'me', gender: 'female' }, woman], ['a', 'b', 'c'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    accounts([{ id: 'me', gender: 'female' }, { id: 'target', gender: 'male' }], ['a', 'b', 'c'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    db.channelFindMany.mockResolvedValue([room(['a']), room(['b']), room(['target'])])
    accounts([man, woman], ['a', 'b', 'target'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    accounts([{ ...man, isOperator: true }, woman], ['a', 'b', 'c'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    accounts([man, { ...woman, isOfficial: true }], ['a', 'b', 'c'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env() })).resolves.toEqual({ allowed: true })
    accounts([man, woman], ['a', 'b', 'c'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env('off') })).resolves.toEqual({ allowed: true })
    await expect(checkDailyNewChatLimit('me', 'royce', { env: env() })).resolves.toEqual({ allowed: true })
  })

  it('counts an operator woman like anyone else, and follows the configured number', async () => {
    db.channelFindMany.mockResolvedValue([room(['a'])])
    accounts([man, { ...woman, isOperator: true }], ['a'])
    await expect(checkDailyNewChatLimit('me', 'target', { env: env('1') })).resolves.toEqual({ allowed: false, limit: 1 })
    await expect(checkDailyNewChatLimit('me', 'target', { env: env('2') })).resolves.toEqual({ allowed: true })
  })
})
