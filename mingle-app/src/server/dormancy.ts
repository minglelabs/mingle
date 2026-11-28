import { prisma } from '@/lib/prisma'
import { isReviewAccount } from '@/server/app-access'

/**
 * Dormant accounts (owner, 2026-11-25). Every account that had no profile
 * photo was put to sleep (`User.dormantAt`, set once by the migration
 * `20261125160000_add_dormant_at`): it is left out of the explore tab, and
 * its owner sees only the "dormant account" screen until they wake it.
 *
 * Waking it needs a profile photo with a face and the selfie check against
 * that photo. Women need the photo only (owner, 2026-11-25: no selfie check
 * for women anywhere). Operator accounts, the official account and
 * store-review accounts are never dormant.
 */
export type DormancyUser = {
  dormantAt: Date | null
  isOperator: boolean
  isOfficial: boolean
  email: string | null
  phoneE164: string | null
}

export function isDormantAccount(user: DormancyUser, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!user.dormantAt) return false
  if (user.isOperator || user.isOfficial) return false
  return !isReviewAccount(user, env)
}

export type DormancyReleaseUser = {
  image: string | null
  imageFaceCheck: string | null
  faceVerifiedAt: Date | null
  gender: string | null
}

/** Whether a dormant account has done what waking it takes. */
export function canReleaseDormancy(user: DormancyReleaseUser): boolean {
  if (!user.image?.trim() || user.imageFaceCheck === 'no_face') return false
  return user.gender === 'female' || user.faceVerifiedAt !== null
}

/** Called after a photo upload and after a passed selfie check. True when the account woke up. */
export async function releaseDormancyIfReady(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dormantAt: true, image: true, imageFaceCheck: true, faceVerifiedAt: true, gender: true },
  })
  if (!user?.dormantAt || !canReleaseDormancy(user)) return false
  await prisma.user.updateMany({ where: { id: userId, dormantAt: { not: null } }, data: { dormantAt: null } })
  return true
}

export async function readIsDormant(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dormantAt: true, isOperator: true, isOfficial: true, email: true, phoneE164: true },
  })
  return user ? isDormantAccount(user) : false
}
