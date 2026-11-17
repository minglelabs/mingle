import { Prisma } from '@prisma/client'
import { HAMZZI_USER_ID } from '@/lib/hamzzi'
import { prisma } from '@/lib/prisma'
import {
  OperatorAccountRequiredError,
  requireOperatorAccount,
  type OperatorAccountRecord,
} from '@/server/operators/operator-guard'

/**
 * The accounts staff read and answer in the inbox: every operator account,
 * plus Hamzzi (an official account whose DMs the AI answers, and staff may
 * answer by hand too). Hamzzi's rooms join the inbox only once the other
 * person has written, so its welcome-only rooms never flood the list.
 */
export const STAFF_ANSWERED_OFFICIAL_USER_IDS: readonly string[] = [HAMZZI_USER_ID]

export function isStaffAnsweredOfficialId(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && STAFF_ANSWERED_OFFICIAL_USER_IDS.includes(userId)
}

/** True for a member staff act as in the inbox (an operator, or Hamzzi). */
export function isInboxAccountUser(user: { id: string; isOperator?: boolean | null; isDeleted?: boolean | null }): boolean {
  if (user.isDeleted === true) return false
  return user.isOperator === true || isStaffAnsweredOfficialId(user.id)
}

/** Prisma filter for an inbox account (operator or Hamzzi), not deleted. */
export const INBOX_ACCOUNT_USER_WHERE = {
  isDeleted: false,
  OR: [{ isOperator: true }, { id: { in: [...STAFF_ANSWERED_OFFICIAL_USER_IDS] } }],
} satisfies Prisma.UserWhereInput

/** SQL ids of the staff-answered official accounts, for `IN (...)`. */
export const STAFF_ANSWERED_OFFICIAL_IDS_SQL = Prisma.join([...STAFF_ANSWERED_OFFICIAL_USER_IDS])

/**
 * Like `requireOperatorAccount`, but also accepts Hamzzi: the inbox's "act as
 * this account" guard. Any other user id throws `OperatorAccountRequiredError`.
 */
export async function requireInboxAccount(userId: string): Promise<OperatorAccountRecord> {
  if (!isStaffAnsweredOfficialId(userId)) return requireOperatorAccount(userId)
  const official = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
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
  if (official) return official
  throw new OperatorAccountRequiredError(userId)
}
