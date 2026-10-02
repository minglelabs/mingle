import { prisma } from '@/lib/prisma'
import { personaLanguageOf } from './operator-check'
import type { OperatorPostPickerEntry } from './types'

const MAX_OPERATORS = 1000

/**
 * Every operator account the composer can pick from (active ones first).
 * Inactive and restricted accounts are listed but flagged, so staff see why
 * they cannot post as them instead of wondering where an account went.
 */
export async function listOperatorsForPosting(): Promise<OperatorPostPickerEntry[]> {
  const users = await prisma.user.findMany({
    where: { isOperator: true, isDeleted: false },
    select: {
      id: true,
      handle: true,
      name: true,
      image: true,
      primaryLanguages: true,
      isActive: true,
      moderationRestrictedAt: true,
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { handle: 'asc' }],
    take: MAX_OPERATORS,
  })
  return users.map((user) => ({
    id: user.id,
    handle: user.handle,
    name: user.name,
    image: user.image,
    language: personaLanguageOf(user),
    isActive: user.isActive,
    restricted: user.moderationRestrictedAt !== null,
  }))
}
