import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userUpdateMany: vi.fn(),
  accountFindMany: vi.fn(),
  userPhoneFindMany: vi.fn(),
  linkFindMany: vi.fn(),
  deviceUserFindMany: vi.fn(),
  pushDeleteMany: vi.fn(),
  blockCreateMany: vi.fn(),
  deviceUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: db.userFindUnique, findMany: db.userFindMany, updateMany: db.userUpdateMany },
    account: { findMany: db.accountFindMany },
    appUserPhone: { findMany: db.userPhoneFindMany },
    appIdentityLink: { findMany: db.linkFindMany },
    appDeviceUser: { findMany: db.deviceUserFindMany },
    userPushToken: { deleteMany: db.pushDeleteMany },
    appIdentityBlock: { createMany: db.blockCreateMany },
    appDevice: { updateMany: db.deviceUpdateMany },
    adminAuditLog: { create: db.auditCreate },
    $transaction: db.transaction,
  },
}))

import { identityKeyHash } from '@/server/identity/keys'
import { banUserBundle, collectBanBundle } from './ban'

// bad: +8210…1 and a Google account, on device d1.
// alt: another account seen on d1 (a second account of the same person).
// staff: an operator account also seen on d1.
// friend: shares nothing.
const users: Record<string, { email: string | null; phoneE164: string | null; mergedIntoUserId: string | null }> = {
  bad: { email: 'bad@x.com', phoneE164: '+821000000001', mergedIntoUserId: null },
  alt: { email: null, phoneE164: '+821000000002', mergedIntoUserId: null },
  staff: { email: null, phoneE164: null, mergedIntoUserId: null },
}
const deviceUsers = [
  { deviceId: 'd1', userId: 'bad' },
  { deviceId: 'd1', userId: 'alt' },
  { deviceId: 'd1', userId: 'staff' },
]

beforeEach(() => {
  vi.clearAllMocks()
  db.userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => users[where.id] ?? null)
  db.accountFindMany.mockImplementation(async ({ where }: { where: { userId: string } }) => (
    where.userId === 'bad' ? [{ provider: 'google', providerAccountId: 'g-bad' }] : []
  ))
  db.userPhoneFindMany.mockResolvedValue([])
  db.linkFindMany.mockResolvedValue([])
  db.deviceUserFindMany.mockImplementation(async ({ where }: { where: { userId?: string; deviceId?: { in: string[] } } }) => {
    if (where.userId) return deviceUsers.filter((row) => row.userId === where.userId)
    return deviceUsers.filter((row) => where.deviceId?.in.includes(row.deviceId))
  })
  db.userFindMany.mockImplementation(async ({ where }: { where: { mergedIntoUserId?: string; id?: { in: string[] }; isOperator?: boolean } }) => {
    if (where.mergedIntoUserId) return []
    return (where.id?.in ?? []).filter((id) => id !== 'staff').map((id) => ({ id }))
  })
  db.transaction.mockResolvedValue([])
})

describe('collectBanBundle', () => {
  it('reaches a second account through a shared device, but never a staff account', async () => {
    const bundle = await collectBanBundle('bad')
    expect(bundle.userIds.sort()).toEqual(['alt', 'bad'])
    expect(bundle.deviceIds).toEqual(['d1'])
    expect(bundle.truncated).toBe(false)
  })

  it('collects every number, sign-in method and e-mail of the bundle as hashes', async () => {
    const bundle = await collectBanBundle('bad')
    const keys = bundle.keys.map((key) => `${key.kind}:${key.keyHash}`).sort()
    expect(keys).toEqual([
      `email:${identityKeyHash('email', 'bad@x.com')}`,
      `google:${identityKeyHash('google', 'g-bad')}`,
      `phone:${identityKeyHash('phone', '+821000000001')}`,
      `phone:${identityKeyHash('phone', '+821000000002')}`,
    ].sort())
  })

  it('reaches an account that was only seen with the same number', async () => {
    db.deviceUserFindMany.mockResolvedValue([])
    db.linkFindMany.mockImplementation(async ({ where }: { where: { userId?: string; OR?: unknown[] } }) => (
      where.OR ? [{ userId: 'bad' }, { userId: 'alt' }] : []
    ))
    const bundle = await collectBanBundle('bad')
    expect(bundle.userIds.sort()).toEqual(['alt', 'bad'])
  })
})

describe('banUserBundle', () => {
  it('bans the bundle, closes its keys and devices, and writes the audit log', async () => {
    const result = await banUserBundle({ userId: 'bad', reason: 'scam', operatorUserId: 'op' })
    expect(result.bannedUserIds.sort()).toEqual(['alt', 'bad'])
    expect(result.blockedDevices).toBe(1)
    expect(db.userUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['bad', 'alt']) }, bannedAt: null },
      data: { bannedAt: expect.any(Date), bannedReason: 'scam' },
    })
    expect(db.blockCreateMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }))
    expect(db.deviceUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ['d1'] }, blockedAt: null }, data: { blockedAt: expect.any(Date), blockedReason: 'scam' } })
    expect(db.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'identity.ban', operatorUserId: 'op', targetId: 'bad' }) })
  })

  it('can be narrowed to the accounts the operator chose', async () => {
    const result = await banUserBundle({ userId: 'bad', onlyUserIds: [] })
    expect(result.bannedUserIds).toEqual(['bad'])
    const blocked = (db.blockCreateMany.mock.calls[0][0] as { data: { keyHash: string }[] }).data.map((row) => row.keyHash)
    expect(blocked).not.toContain(identityKeyHash('phone', '+821000000002'))
  })
})
