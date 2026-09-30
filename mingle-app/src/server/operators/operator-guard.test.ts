import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: m.findFirst } } }))

import { OperatorAccountRequiredError, findOperatorAccount, requireOperatorAccount } from './operator-guard'

const operator = {
  id: 'op_1',
  handle: 'lucas.martins',
  name: 'Lucas',
  image: null,
  primaryLanguages: ['pt'],
  defaultConversationLanguages: ['pt'],
  defaultDisplayLanguage: 'pt',
  isActive: true,
}

describe('operator guard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('only matches a user flagged as operator that is not deleted', async () => {
    m.findFirst.mockResolvedValue(operator)
    await expect(findOperatorAccount('op_1')).resolves.toEqual(operator)
    expect(m.findFirst).toHaveBeenCalledWith({
      where: { id: 'op_1', isOperator: true, isDeleted: false },
      select: {
        id: true,
        handle: true,
        name: true,
        image: true,
        primaryLanguages: true,
        defaultConversationLanguages: true,
        defaultDisplayLanguage: true,
        isActive: true,
      },
    })
  })

  it('returns null for a regular or deleted user (no row matches)', async () => {
    m.findFirst.mockResolvedValue(null)
    await expect(findOperatorAccount('user_1')).resolves.toBeNull()
  })

  it('returns null without querying for a missing id', async () => {
    await expect(findOperatorAccount('')).resolves.toBeNull()
    await expect(findOperatorAccount(undefined as unknown as string)).resolves.toBeNull()
    expect(m.findFirst).not.toHaveBeenCalled()
  })

  it('still returns an inactive operator, flagged as such', async () => {
    m.findFirst.mockResolvedValue({ ...operator, isActive: false })
    await expect(findOperatorAccount('op_1')).resolves.toMatchObject({ isActive: false })
  })

  it('requireOperatorAccount returns the record for an operator', async () => {
    m.findFirst.mockResolvedValue(operator)
    await expect(requireOperatorAccount('op_1')).resolves.toEqual(operator)
  })

  it('requireOperatorAccount throws OperatorAccountRequiredError for anyone else', async () => {
    m.findFirst.mockResolvedValue(null)
    const error = await requireOperatorAccount('user_1').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(OperatorAccountRequiredError)
    expect(error).toMatchObject({
      name: 'OperatorAccountRequiredError',
      message: 'operator_account_required',
      userId: 'user_1',
    })
  })
})
