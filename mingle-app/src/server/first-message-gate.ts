import { prisma } from '@/lib/prisma'
import { isReviewAccount } from '@/server/app-access'
import { isPhoneVerificationAvailable } from '@/server/phone-verification'

/**
 * Before someone opens a first room with a person they have no room with yet
 * (from Home, Explore or a profile), the account needs:
 * - a verified phone number ('phone'), and
 * - a profile photo with a face in it ('face_photo': no photo, or the phone
 *   found no face), or, for a photo that was never checked, a check of it
 *   ('face_check': the app checks the photo it already has on the phone).
 *
 * The face check runs on the phone (iOS Vision, ML Kit on Android); only
 * its result is stored (`User.imageFaceCheck`). A photo uploaded where no check
 * runs (a browser, an older app) is 'unchecked' and passes, so nobody is locked
 * out by the device they use.
 *
 * Operators, the official account and store-review accounts skip it. While the
 * server cannot send a code (no SMS provider) the phone step is skipped.
 * FIRST_MESSAGE_GATE=off turns the whole gate off.
 */
export type FirstMessageNeed = 'phone' | 'face_photo' | 'face_check'

export const FIRST_MESSAGE_NEEDS: readonly FirstMessageNeed[] = ['phone', 'face_photo', 'face_check']

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
  image: string | null
  imageFaceCheck: string | null
}

export function resolveFirstMessageNeeds(
  user: FirstMessageGateUser,
  options: { env?: NodeJS.ProcessEnv; canSendCodes?: boolean } = {},
): FirstMessageNeed[] {
  const env = options.env ?? process.env
  if (!isFirstMessageGateOn(env)) return []
  if (user.isOperator || user.isOfficial || isReviewAccount(user, env)) return []
  const needs: FirstMessageNeed[] = []
  const canSendCodes = options.canSendCodes ?? isPhoneVerificationAvailable()
  if (canSendCodes && !(user.phoneE164 && user.phoneVerifiedAt)) needs.push('phone')
  const check = parseImageFaceCheck(user.imageFaceCheck)
  if (!user.image?.trim() || check === 'no_face') needs.push('face_photo')
  else if (check === null) needs.push('face_check')
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
  if (inviteeUserIds.every((id) => knownIds.has(id))) return []
  return readFirstMessageNeeds(userId)
}

export async function readFirstMessageNeeds(userId: string): Promise<FirstMessageNeed[]> {
  if (!isFirstMessageGateOn()) return []
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isOperator: true, isOfficial: true, email: true,
      phoneE164: true, phoneVerifiedAt: true, image: true, imageFaceCheck: true,
    },
  })
  return user ? resolveFirstMessageNeeds(user) : []
}
