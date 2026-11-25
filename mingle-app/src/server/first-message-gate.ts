import { prisma } from '@/lib/prisma'
import { isReviewAccount } from '@/server/app-access'
import { resolveNationalityCountry } from '@/lib/nationality'
import { phoneCodeReach } from '@/server/phone-verification'

/**
 * Before someone opens a first room with a person they have no room with yet
 * (from Home, Explore or a profile), the account needs:
 * - a verified phone number ('phone'), and
 * - a face-verified profile photo (owner, 2026-11-25): 'face_photo' when
 *   there is no photo or the phone found no face in it, 'face_verify' when the
 *   photo is there but the selfie check (POST /profile/face-verification) was
 *   never passed. Not asked when everyone new in the room already follows
 *   this account: they chose to hear from it.
 *
 * ('face_check', the old "is there a face in the photo" step, is no longer
 * asked: the selfie check compares with the photo, which covers it.)
 *
 * The face check runs on the phone (iOS Vision, ML Kit on Android); only
 * its result is stored (`User.imageFaceCheck`). A photo uploaded where no check
 * runs (a browser, an older app) is 'unchecked' and passes, so nobody is locked
 * out by the device they use.
 *
 * The phone step is asked only of people the server can text a code to:
 * everyone once an international SMS provider is set up, and until then only
 * Korean users (nationality KR, or Korean as the first language), since the
 * Korean provider reaches +82 numbers only. Nobody is asked for a number that
 * cannot get a code. Operators, the official account and store-review
 * accounts skip it.
 * FIRST_MESSAGE_GATE=off turns the whole gate off.
 */
export type FirstMessageNeed = 'phone' | 'face_photo' | 'face_verify' | 'face_check'

export const FIRST_MESSAGE_NEEDS: readonly FirstMessageNeed[] = ['phone', 'face_photo', 'face_verify', 'face_check']

export type ImageFaceCheck = 'face' | 'no_face' | 'unchecked'

export function parseImageFaceCheck(value: unknown): ImageFaceCheck | null {
  return value === 'face' || value === 'no_face' || value === 'unchecked' ? value : null
}

export function isFirstMessageGateOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return !['0', 'off', 'false'].includes((env.FIRST_MESSAGE_GATE ?? '').trim().toLowerCase())
}

export type FirstMessageGateUser = {
  isOperator: boolean
  isOfficial: boolean
  email: string | null
  phoneE164: string | null
  phoneVerifiedAt: Date | null
  nationalityCountry?: string | null
  primaryLanguages?: string[]
  image: string | null
  imageFaceCheck: string | null
  faceVerifiedAt?: Date | null
  gender?: string | null
}

export function resolveFirstMessageNeeds(
  user: FirstMessageGateUser,
  options: {
    env?: NodeJS.ProcessEnv
    reach?: { worldwide: boolean; korea: boolean }
    /** Everyone new in the room follows this account: no photo asked. */
    followedByTargets?: boolean
  } = {},
): FirstMessageNeed[] {
  const env = options.env ?? process.env
  if (!isFirstMessageGateOn(env)) return []
  if (user.isOperator || user.isOfficial || isReviewAccount(user, env)) return []
  const needs: FirstMessageNeed[] = []
  const reach = options.reach ?? phoneCodeReach()
  const korean = resolveNationalityCountry(user.nationalityCountry ?? null, user.primaryLanguages ?? []) === 'KR'
  const canAsk = reach.worldwide || (reach.korea && korean)
  if (canAsk && !(user.phoneE164 && user.phoneVerifiedAt)) needs.push('phone')
  if (options.followedByTargets) return needs
  const check = parseImageFaceCheck(user.imageFaceCheck)
  if (!user.image?.trim() || check === 'no_face') needs.push('face_photo')
  // The selfie check is for men only (owner, 2026-11-25).
  else if (!user.faceVerifiedAt && user.gender !== 'female') needs.push('face_verify')
  return needs
}

/**
 * What the account still needs before putting these people in a room with it:
 * nothing when it already shares a room with every one of them (they are not
 * new), otherwise the same needs as a first message. Used by group starts and
 * by adding people to an existing room, so neither gets around the gate.
 */
export async function readFirstMessageNeedsForInvitees(userId: string, inviteeUserIds: readonly string[]): Promise<FirstMessageNeed[]> {
  if (!isFirstMessageGateOn() || inviteeUserIds.length === 0) return []
  const known = await prisma.appConversationChannelMember.findMany({
    where: { userId: { in: [...inviteeUserIds] }, channel: { members: { some: { userId } } } },
    select: { userId: true },
    distinct: ['userId'],
  })
  const knownIds = new Set(known.map((member) => member.userId))
  const newIds = [...new Set(inviteeUserIds)].filter((id) => !knownIds.has(id))
  if (newIds.length === 0) return []
  return readFirstMessageNeeds(userId, newIds)
}

/** Whether every one of these people follows this account. */
async function followedByAll(userId: string, targetUserIds: readonly string[]): Promise<boolean> {
  const ids = [...new Set(targetUserIds)].filter((id) => id && id !== userId)
  if (ids.length === 0) return false
  const count = await prisma.userFollow.count({ where: { followingId: userId, followerId: { in: ids } } })
  return count === ids.length
}

/** `targetUserIds`: the people new to this account in the room being opened. */
export async function readFirstMessageNeeds(userId: string, targetUserIds: readonly string[] = []): Promise<FirstMessageNeed[]> {
  if (!isFirstMessageGateOn()) return []
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isOperator: true, isOfficial: true, email: true,
      phoneE164: true, phoneVerifiedAt: true, nationalityCountry: true, primaryLanguages: true,
      image: true, imageFaceCheck: true, faceVerifiedAt: true, gender: true,
    },
  })
  if (!user) return []
  const needs = resolveFirstMessageNeeds(user)
  if (!needs.some((need) => need !== 'phone')) return needs
  return resolveFirstMessageNeeds(user, { followedByTargets: await followedByAll(userId, targetUserIds) })
}
