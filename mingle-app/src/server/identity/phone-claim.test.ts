import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  userPhoneFindUnique: vi.fn(),
  userPhoneDeleteMany: vi.fn(),
  userPhoneUpsert: vi.fn(),
  blockFindUnique: vi.fn(),
  linkCreate: vi.fn(),
  accountFindMany: vi.fn(),
  accountUpdateMany: vi.fn(),
  pushUpdateMany: vi.fn(),
  deviceUserFindMany: vi.fn(),
  devicePhoneUpsert: vi.fn(),
  count: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/signup-welcome-onboarding', () => ({ ROYCE_USER_ID: 'royce' }))
vi.mock('@/lib/prisma', () => {
  const prisma = {
    user: { findFirst: db.userFindFirst, findUnique: db.userFindUnique, findMany: db.userFindMany, update: db.userUpdate, updateMany: db.userUpdateMany },
    appUserPhone: { findUnique: db.userPhoneFindUnique, deleteMany: db.userPhoneDeleteMany, upsert: db.userPhoneUpsert },
    appIdentityBlock: { findUnique: db.blockFindUnique },
    appIdentityLink: { create: db.linkCreate },
    account: { findMany: db.accountFindMany, updateMany: db.accountUpdateMany },
    userPushToken: { updateMany: db.pushUpdateMany },
    appDeviceUser: { findMany: db.deviceUserFindMany },
    appDevicePhone: { upsert: db.devicePhoneUpsert },
    appMessage: { count: db.count },
    post: { count: db.count },
    userFollow: { count: db.count },
    appIapPurchase: { count: db.count },
    $transaction: db.transaction,
  }
  return { prisma }
})

import { prisma } from '@/lib/prisma'
import { identityKeyHash } from '@/server/identity/keys'
import { PhoneClaimRefused, claimVerifiedPhone, decidePhoneClaim, isEmptyAccount, type PhoneClaimFacts } from './phone-claim'

const PHONE = '+821012345678'
const base: PhoneClaimFacts = { selfId: 'me', selfEmpty: false, selfExempt: false, blocked: false, numberOwnerId: null, deviceOwner: null }
const strongDevice = { id: 'd1', strong: true, exempt: false, blocked: false }

describe('decidePhoneClaim', () => {
  it('refuses a number a ban closed', () => {
    expect(decidePhoneClaim({ ...base, blocked: true, numberOwnerId: 'a' })).toEqual({ kind: 'blocked' })
  })

  it('saves a number nobody has, and its own number again', () => {
    expect(decidePhoneClaim(base)).toEqual({ kind: 'claim' })
    expect(decidePhoneClaim({ ...base, numberOwnerId: 'me' })).toEqual({ kind: 'claim' })
  })

  it('folds an empty new account into the number\'s account', () => {
    expect(decidePhoneClaim({ ...base, selfEmpty: true, numberOwnerId: 'a' })).toEqual({ kind: 'switch', toUserId: 'a', phone: 'keep' })
  })

  it('tells an account with a history that the number is in use', () => {
    expect(decidePhoneClaim({ ...base, numberOwnerId: 'a' })).toEqual({ kind: 'in_use', ownerUserId: 'a' })
  })

  it('folds an empty new account into the device\'s account: the new number becomes its own, or an extra one', () => {
    expect(decidePhoneClaim({ ...base, selfEmpty: true, deviceOwner: { userId: 'a', hasOwnPhone: false } }))
      .toEqual({ kind: 'switch', toUserId: 'a', phone: 'set_own' })
    expect(decidePhoneClaim({ ...base, selfEmpty: true, deviceOwner: { userId: 'a', hasOwnPhone: true } }))
      .toEqual({ kind: 'switch', toUserId: 'a', phone: 'attach' })
  })

  it('leaves an account with a history, and staff or review accounts, on a shared device alone', () => {
    expect(decidePhoneClaim({ ...base, deviceOwner: { userId: 'a', hasOwnPhone: true } })).toEqual({ kind: 'claim' })
    expect(decidePhoneClaim({ ...base, selfEmpty: true, selfExempt: true, deviceOwner: { userId: 'a', hasOwnPhone: true } })).toEqual({ kind: 'claim' })
  })

  it('goes by the number before the device', () => {
    expect(decidePhoneClaim({ ...base, selfEmpty: true, numberOwnerId: 'b', deviceOwner: { userId: 'a', hasOwnPhone: true } }))
      .toEqual({ kind: 'switch', toUserId: 'b', phone: 'keep' })
  })
})

function emptyNewUser() {
  db.userFindUnique.mockResolvedValue({ createdAt: new Date(), passwordHash: null, referredByUserId: null, isOperator: false, isOfficial: false })
  db.count.mockResolvedValue(0)
}

beforeEach(() => {
  vi.clearAllMocks()
  db.blockFindUnique.mockResolvedValue(null)
  db.userFindFirst.mockResolvedValue(null)
  db.userPhoneFindUnique.mockResolvedValue(null)
  db.linkCreate.mockResolvedValue({})
  db.accountFindMany.mockResolvedValue([])
  db.devicePhoneUpsert.mockResolvedValue({})
  db.deviceUserFindMany.mockResolvedValue([])
  db.userFindMany.mockResolvedValue([])
  db.transaction.mockImplementation(async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : arg))
})

describe('isEmptyAccount', () => {
  it('is an account made today that did nothing', async () => {
    emptyNewUser()
    await expect(isEmptyAccount('me')).resolves.toBe(true)
  })

  it('is not an older account, one with a password, or one that wrote something', async () => {
    db.count.mockResolvedValue(0)
    db.userFindUnique.mockResolvedValue({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), passwordHash: null, referredByUserId: null, isOperator: false, isOfficial: false })
    await expect(isEmptyAccount('me')).resolves.toBe(false)
    db.userFindUnique.mockResolvedValue({ createdAt: new Date(), passwordHash: 'x', referredByUserId: null, isOperator: false, isOfficial: false })
    await expect(isEmptyAccount('me')).resolves.toBe(false)
    emptyNewUser()
    db.count.mockResolvedValueOnce(1)
    await expect(isEmptyAccount('me')).resolves.toBe(false)
  })
})

describe('claimVerifiedPhone', () => {
  it('saves a free number on the account and notes it', async () => {
    await expect(claimVerifiedPhone('me', PHONE)).resolves.toEqual({ phoneE164: PHONE })
    expect(db.userUpdate).toHaveBeenCalledWith({
      where: { id: 'me' },
      data: { phoneE164: PHONE, phoneHash: expect.stringMatching(/^[0-9a-f]{64}$/), phoneVerifiedAt: expect.any(Date) },
    })
    expect(db.linkCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'me', method: 'phone', event: 'phone_verified', methodKeyHash: identityKeyHash('phone', PHONE) }) })
    expect(db.accountUpdateMany).not.toHaveBeenCalled()
  })

  it('refuses a banned number without touching anything', async () => {
    db.blockFindUnique.mockResolvedValue({ id: 'b1' })
    await expect(claimVerifiedPhone('me', PHONE)).rejects.toMatchObject({ code: 'blocked' })
    expect(db.userUpdate).not.toHaveBeenCalled()
  })

  it('refuses any number on a banned device', async () => {
    await expect(claimVerifiedPhone('me', PHONE, { context: { device: { ...strongDevice, blocked: true } } })).rejects.toBeInstanceOf(PhoneClaimRefused)
  })

  it('never moves a number off an account with a history: the second account is told and linked', async () => {
    db.userFindFirst.mockResolvedValue({ id: 'owner' })
    db.userFindUnique.mockResolvedValue({ createdAt: new Date('2026-01-01'), passwordHash: null, referredByUserId: null, isOperator: false, isOfficial: false })
    await expect(claimVerifiedPhone('me', PHONE)).rejects.toMatchObject({ code: 'phone_in_use' })
    expect(db.userUpdate).not.toHaveBeenCalled()
    expect(db.userUpdateMany).not.toHaveBeenCalled()
    expect(db.linkCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'me', event: 'phone_in_use' }) })
  })

  it('folds an empty new account into the number\'s account: its sign-in methods move and the row points there', async () => {
    db.userFindFirst.mockResolvedValue({ id: 'owner' })
    emptyNewUser()
    db.accountFindMany.mockResolvedValue([{ provider: 'google', providerAccountId: 'g-1' }])
    await expect(claimVerifiedPhone('me', PHONE)).resolves.toEqual({ phoneE164: PHONE, switchedTo: 'owner' })
    expect(db.accountUpdateMany).toHaveBeenCalledWith({ where: { userId: 'me' }, data: { userId: 'owner' } })
    expect(db.pushUpdateMany).toHaveBeenCalledWith({ where: { userId: 'me' }, data: { userId: 'owner' } })
    expect(db.userUpdate).toHaveBeenCalledWith({
      where: { id: 'me' },
      data: expect.objectContaining({ isDeleted: true, mergedIntoUserId: 'owner', phoneE164: null, email: '__merged_me@mingle.internal' }),
    })
    expect(db.userUpdate).toHaveBeenCalledTimes(1)
    expect(db.linkCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'owner', method: 'google', event: 'attached', methodKeyHash: identityKeyHash('google', 'g-1') }) })
  })

  it('finds the owner through an attached extra number too', async () => {
    db.userPhoneFindUnique.mockResolvedValue({ userId: 'owner' })
    db.userFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'owner' })
    emptyNewUser()
    await expect(claimVerifiedPhone('me', PHONE)).resolves.toEqual({ phoneE164: PHONE, switchedTo: 'owner' })
  })

  it('on a device with an account already, attaches the new number to that account', async () => {
    emptyNewUser()
    db.deviceUserFindMany.mockResolvedValue([{ userId: 'first' }])
    db.userFindMany.mockResolvedValue([{ id: 'first', phoneE164: '+821099999999' }])
    await expect(claimVerifiedPhone('me', PHONE, { context: { device: strongDevice } })).resolves.toEqual({ phoneE164: PHONE, switchedTo: 'first' })
    expect(db.userPhoneUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: 'first', last4: '5678', attachedViaDeviceId: 'd1' }),
    }))
    expect(db.linkCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'first', method: 'phone', event: 'attached', deviceId: 'd1' }) })
  })

  it('gives the device\'s account the number as its own when it had none', async () => {
    emptyNewUser()
    db.deviceUserFindMany.mockResolvedValue([{ userId: 'first' }])
    db.userFindMany.mockResolvedValue([{ id: 'first', phoneE164: null }])
    await expect(claimVerifiedPhone('me', PHONE, { context: { device: strongDevice } })).resolves.toEqual({ phoneE164: PHONE, switchedTo: 'first' })
    expect(db.userUpdate).toHaveBeenCalledWith({ where: { id: 'first' }, data: expect.objectContaining({ phoneE164: PHONE }) })
    expect(db.userPhoneUpsert).not.toHaveBeenCalled()
  })

  it('ignores weak device values and staff test devices', async () => {
    emptyNewUser()
    db.deviceUserFindMany.mockResolvedValue([{ userId: 'first' }])
    db.userFindMany.mockResolvedValue([{ id: 'first', phoneE164: null }])
    await expect(claimVerifiedPhone('me', PHONE, { context: { device: { ...strongDevice, strong: false } } })).resolves.toEqual({ phoneE164: PHONE })
    await expect(claimVerifiedPhone('me', PHONE, { context: { device: { ...strongDevice, exempt: true } } })).resolves.toEqual({ phoneE164: PHONE })
    expect(db.accountUpdateMany).not.toHaveBeenCalled()
  })
})
