import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  accountFindMany: vi.fn(),
  accountFindFirst: vi.fn(),
  accountDelete: vi.fn(),
  phoneFindMany: vi.fn(),
  phoneFindFirst: vi.fn(),
  phoneDelete: vi.fn(),
  linkFindMany: vi.fn(),
  linkCreate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: db.userFindUnique },
    account: { findMany: db.accountFindMany, findFirst: db.accountFindFirst, delete: db.accountDelete },
    appUserPhone: { findMany: db.phoneFindMany, findFirst: db.phoneFindFirst, delete: db.phoneDelete },
    appIdentityLink: { findMany: db.linkFindMany, create: db.linkCreate },
  },
}))

import { identityKeyHash } from '@/server/identity/keys'
import { detachSignInMethod, listSignInMethods } from './methods'

beforeEach(() => {
  vi.resetAllMocks()
  db.userFindUnique.mockResolvedValue({ email: 'a@b.com', passwordHash: null, phoneE164: '+821012345678' })
  db.accountFindMany.mockResolvedValue([
    { id: 'acc-apple', provider: 'apple', providerAccountId: 'a-1' },
    { id: 'acc-google', provider: 'google', providerAccountId: 'g-1' },
  ])
  db.phoneFindMany.mockResolvedValue([{ id: 'ph-1', last4: '9999' }])
  db.linkFindMany.mockResolvedValue([{ method: 'google', methodKeyHash: identityKeyHash('google', 'g-1'), event: 'attached' }])
  db.linkCreate.mockResolvedValue({})
})

describe('listSignInMethods', () => {
  it('marks only what was attached later as detachable', async () => {
    await expect(listSignInMethods('me')).resolves.toEqual([
      { kind: 'account', id: 'acc-apple', provider: 'apple', detachable: false },
      { kind: 'account', id: 'acc-google', provider: 'google', detachable: true },
      { kind: 'phone', own: true, last4: '5678', detachable: false },
      { kind: 'phone', own: false, id: 'ph-1', last4: '9999', detachable: true },
    ])
  })

  it('forgets an attachment that was taken off, and never offers the last method', async () => {
    db.linkFindMany.mockResolvedValue([
      { method: 'google', methodKeyHash: identityKeyHash('google', 'g-1'), event: 'attached' },
      { method: 'google', methodKeyHash: identityKeyHash('google', 'g-1'), event: 'detached' },
    ])
    expect((await listSignInMethods('me')).filter((item) => item.detachable).map((item) => item.kind)).toEqual(['phone'])

    db.userFindUnique.mockResolvedValue({ email: null, passwordHash: null, phoneE164: null })
    db.accountFindMany.mockResolvedValue([{ id: 'acc-google', provider: 'google', providerAccountId: 'g-1' }])
    db.phoneFindMany.mockResolvedValue([])
    db.linkFindMany.mockResolvedValue([{ method: 'google', methodKeyHash: identityKeyHash('google', 'g-1'), event: 'attached' }])
    await expect(listSignInMethods('me')).resolves.toEqual([{ kind: 'account', id: 'acc-google', provider: 'google', detachable: false }])
  })
})

describe('detachSignInMethod', () => {
  it('takes off an attached sign-in method and notes it', async () => {
    db.accountFindFirst.mockResolvedValue({ providerAccountId: 'g-1' })
    await detachSignInMethod('me', { kind: 'account', id: 'acc-google' })
    expect(db.accountDelete).toHaveBeenCalledWith({ where: { id: 'acc-google' } })
    expect(db.linkCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'me', method: 'google', event: 'detached' }) })
  })

  it('refuses the method the account was made with, unless staff does it', async () => {
    db.accountFindFirst.mockResolvedValue({ providerAccountId: 'a-1' })
    await expect(detachSignInMethod('me', { kind: 'account', id: 'acc-apple' })).rejects.toMatchObject({ code: 'not_detachable' })
    expect(db.accountDelete).not.toHaveBeenCalled()
    await detachSignInMethod('me', { kind: 'account', id: 'acc-apple' }, { byAdmin: true })
    expect(db.accountDelete).toHaveBeenCalledWith({ where: { id: 'acc-apple' } })
  })

  it('takes off an attached extra number, and refuses what is not on the account', async () => {
    db.phoneFindFirst.mockResolvedValue({ phoneKeyHash: 'h' })
    await detachSignInMethod('me', { kind: 'phone', id: 'ph-1' })
    expect(db.phoneDelete).toHaveBeenCalledWith({ where: { id: 'ph-1' } })
    await expect(detachSignInMethod('me', { kind: 'phone', id: 'nope' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(detachSignInMethod('me', { kind: 'account', id: 'nope' })).rejects.toMatchObject({ code: 'not_found' })
  })
})
