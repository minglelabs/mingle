import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * "Never act as any user" (contract §0): every admin code path that acts as a
 * user calls `requireOperatorAccount(userId)` first, so only accounts flagged
 * `isOperator` (and not deleted) can ever be acted as.
 */
export type OperatorAccountRecord = {
  id: string
  handle: string
  name: string | null
  image: string | null
  primaryLanguages: string[]
  defaultConversationLanguages: string[]
  defaultDisplayLanguage: string | null
  isActive: boolean
}

const OPERATOR_ACCOUNT_SELECT = {
  id: true,
  handle: true,
  name: true,
  image: true,
  primaryLanguages: true,
  defaultConversationLanguages: true,
  defaultDisplayLanguage: true,
  isActive: true,
} satisfies Prisma.UserSelect

export class OperatorAccountRequiredError extends Error {
  readonly userId: string

  constructor(userId: string) {
    super('operator_account_required')
    this.name = 'OperatorAccountRequiredError'
    this.userId = userId
  }
}

/**
 * The operator account with this id, or null unless the user exists with
 * `isOperator` and is not deleted. An inactive (retired) operator is still
 * returned, with `isActive: false`; callers decide what that allows.
 */
export async function findOperatorAccount(userId: string): Promise<OperatorAccountRecord | null> {
  if (typeof userId !== 'string' || !userId) return null
  return prisma.user.findFirst({
    where: { id: userId, isOperator: true, isDeleted: false },
    select: OPERATOR_ACCOUNT_SELECT,
  })
}

/** Like `findOperatorAccount`, but throws `OperatorAccountRequiredError` instead of returning null. */
export async function requireOperatorAccount(userId: string): Promise<OperatorAccountRecord> {
  const account = await findOperatorAccount(userId)
  if (!account) throw new OperatorAccountRequiredError(userId)
  return account
}
