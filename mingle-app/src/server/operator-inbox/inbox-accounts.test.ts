import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  requireOperatorAccount: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findFirst: m.userFindFirst }, appMessage: { findMany: m.messageFindMany } },
}))
vi.mock('@/server/operators/operator-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/operators/operator-guard')>()),
  requireOperatorAccount: m.requireOperatorAccount,
}))

import { HAMZZI_USER_ID } from '@/lib/hamzzi'
import { OperatorAccountRequiredError } from '@/server/operators/operator-guard'
import { resolveHamzziStaffReplyLanguage } from '@/server/hamzzi/staff-reply-language'
import { isInboxAccountUser, requireInboxAccount } from './inbox-accounts'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('inbox accounts', () => {
  it('are operators and Hamzzi, never another user', () => {
    expect(isInboxAccountUser({ id: 'op_1', isOperator: true })).toBe(true)
    expect(isInboxAccountUser({ id: HAMZZI_USER_ID, isOperator: false })).toBe(true)
    expect(isInboxAccountUser({ id: HAMZZI_USER_ID, isDeleted: true })).toBe(false)
    expect(isInboxAccountUser({ id: 'user_1', isOperator: false })).toBe(false)
  })

  it('guards acting as one: operators through the operator guard, Hamzzi by its fixed id', async () => {
    m.requireOperatorAccount.mockResolvedValue({ id: 'op_1' })
    await expect(requireInboxAccount('op_1')).resolves.toEqual({ id: 'op_1' })
    expect(m.userFindFirst).not.toHaveBeenCalled()

    m.userFindFirst.mockResolvedValue({ id: HAMZZI_USER_ID, isActive: true })
    await expect(requireInboxAccount(HAMZZI_USER_ID)).resolves.toMatchObject({ id: HAMZZI_USER_ID })
    expect(m.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: HAMZZI_USER_ID, isDeleted: false } }))

    m.userFindFirst.mockResolvedValue(null)
    await expect(requireInboxAccount(HAMZZI_USER_ID)).rejects.toBeInstanceOf(OperatorAccountRequiredError)
  })
})

describe('Hamzzi staff reply language', () => {
  it("follows the other person's latest language, then Hamzzi's, then English", async () => {
    m.messageFindMany.mockResolvedValue([
      { userId: HAMZZI_USER_ID, sourceLanguage: 'en' },
      { userId: 'user_1', sourceLanguage: 'unknown' },
      { userId: 'user_1', sourceLanguage: 'ja' },
    ])
    await expect(resolveHamzziStaffReplyLanguage('sess')).resolves.toBe('ja')

    m.messageFindMany.mockResolvedValue([
      { userId: 'user_1', sourceLanguage: 'unknown' },
      { userId: HAMZZI_USER_ID, sourceLanguage: 'es' },
    ])
    await expect(resolveHamzziStaffReplyLanguage('sess')).resolves.toBe('es')

    m.messageFindMany.mockResolvedValue([])
    await expect(resolveHamzziStaffReplyLanguage('sess')).resolves.toBe('en')
  })
})
