import { prisma } from '@/lib/prisma'
import { isReviewPhoneNumber } from '@/server/phone-verification'
import { ReferralError, redeemReferralCode } from '@/server/referral'

/**
 * Invite-only access. With INVITE_GATE=on, an account made on or after
 * INVITE_GATE_SINCE (ISO date; no date = every account) can use the app once
 * it has accepted someone's invite. Accounts from before that date, operators,
 * the official account and store-review accounts always get in. Review
 * accounts are the PHONE_REVIEW_LOGINS numbers and the REVIEW_ACCOUNT_EMAILS
 * addresses (comma-separated), so a reviewer never needs an invite.
 *
 * Only for some app languages: INVITE_GATE_LOCALES (comma-separated, default
 * "ko") lists them, "*" means every language. The app sends the language it
 * shows (the one picked on the first screen); any other language gets in.
 *
 * An account the gate stops is put on the waitlist by itself the first time
 * it asks ('waitlisted'); an admin lets it in from the waitlist tab
 * ('granted', src/app/admin/waitlist).
 *
 * Off by default: until INVITE_GATE=on nothing changes for anyone.
 */
export type AppAccessReason =
  | 'gate_off' | 'other_locale' | 'existing' | 'invited' | 'granted' | 'staff' | 'review' | 'needs_invite' | 'waitlisted'

export type AppAccess = { allowed: boolean; reason: AppAccessReason }

export type AppAccessUser = {
  createdAt: Date
  referredByUserId: string | null
  isOperator: boolean
  isOfficial: boolean
  phoneE164: string | null
  email: string | null
  waitlistedAt?: Date | null
  accessGrantedAt?: Date | null
}

function readGateSince(env: NodeJS.ProcessEnv): Date | null {
  const raw = env.INVITE_GATE_SINCE?.trim()
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isInviteGateOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['1', 'on', 'true'].includes((env.INVITE_GATE ?? '').trim().toLowerCase())
}

/** Whether the gate applies to an app language ("ko", "ko-KR", "en"...). No language sent counts as gated. */
export function isInviteGateLocale(rawLocale: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const locales = (env.INVITE_GATE_LOCALES ?? 'ko').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
  if (locales.length === 0 || locales.includes('*')) return true
  const locale = (rawLocale ?? '').trim().toLowerCase()
  if (!locale) return true
  const language = locale.split(/[-_]/)[0]
  return locales.some((entry) => entry === locale || entry === language)
}

export function isReviewAccount(user: Pick<AppAccessUser, 'phoneE164' | 'email'>, env: NodeJS.ProcessEnv = process.env): boolean {
  if (user.phoneE164 && isReviewPhoneNumber(user.phoneE164, env)) return true
  const email = user.email?.trim().toLowerCase()
  if (!email) return false
  return (env.REVIEW_ACCOUNT_EMAILS ?? '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean).includes(email)
}

export function resolveAppAccess(user: AppAccessUser, env: NodeJS.ProcessEnv = process.env, locale?: string | null): AppAccess {
  if (!isInviteGateOn(env)) return { allowed: true, reason: 'gate_off' }
  if (!isInviteGateLocale(locale, env)) return { allowed: true, reason: 'other_locale' }
  if (user.isOperator || user.isOfficial) return { allowed: true, reason: 'staff' }
  if (isReviewAccount(user, env)) return { allowed: true, reason: 'review' }
  if (user.referredByUserId) return { allowed: true, reason: 'invited' }
  if (user.accessGrantedAt) return { allowed: true, reason: 'granted' }
  const since = readGateSince(env)
  if (since && user.createdAt < since) return { allowed: true, reason: 'existing' }
  return { allowed: false, reason: user.waitlistedAt ? 'waitlisted' : 'needs_invite' }
}

const ACCESS_SELECT = {
  createdAt: true, referredByUserId: true, isOperator: true, isOfficial: true, phoneE164: true, email: true,
  waitlistedAt: true, accessGrantedAt: true,
} as const

export async function readAppAccess(userId: string, locale?: string | null): Promise<AppAccess> {
  if (!isInviteGateOn()) return { allowed: true, reason: 'gate_off' }
  if (!isInviteGateLocale(locale)) return { allowed: true, reason: 'other_locale' }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: ACCESS_SELECT })
  if (!user) return { allowed: false, reason: 'needs_invite' }
  const access = resolveAppAccess(user, process.env, locale)
  if (access.reason !== 'needs_invite') return access
  // Stopped by the gate for the first time: onto the waitlist, no button needed.
  await prisma.user.updateMany({ where: { id: userId, waitlistedAt: null }, data: { waitlistedAt: new Date() } })
  return { allowed: false, reason: 'waitlisted' }
}

/** Enters an invite code at the gate: accepts the invite (both sides get the join reward) and lets the account in. */
export async function enterInviteCode(userId: string, rawCode: unknown, locale?: string | null): Promise<AppAccess> {
  try {
    await redeemReferralCode(userId, rawCode, { source: 'code' })
  } catch (error) {
    // Already invited earlier: the gate should simply open.
    if (!(error instanceof ReferralError && error.code === 'already_redeemed')) throw error
  }
  return readAppAccess(userId, locale)
}

/** Admin: lets a waitlisted (or any) account in without an invite. */
export async function grantAppAccess(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { accessGrantedAt: new Date() } })
}

/** Admin: takes back a grant made by mistake. */
export async function revokeAppAccessGrant(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { accessGrantedAt: null } })
}
