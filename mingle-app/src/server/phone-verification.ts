import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { isE164 } from '@/lib/phone-number'
import { KoreanSmsError, koreanSmsProvider, sendKoreanSms } from '@/server/korean-sms'
import { buildSmsCodeText, checkSmsCode, issueSmsCode } from '@/server/sms-codes'

// A user proves a phone number with a 6-digit SMS code. The code is made,
// sent and checked by Twilio Verify (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_VERIFY_SERVICE_SID); it is never stored here. Without Twilio set up,
// a non-production server accepts the code 000000 so the flow can be tried
// locally; production then answers "unavailable".
//
// The same code also signs in (or signs up) by phone number alone, before
// there is an account; see startPhoneSignIn / verifyPhoneSignIn.
//
// Korean numbers (+82) go through Sendon or Solapi when one is set up: a
// plain SMS with a code made here (see @/server/korean-sms), much cheaper
// than Twilio Verify to Korea. Every other number uses Twilio.
//
// App review: PHONE_REVIEW_LOGINS lists fixed numbers and codes for store
// reviewers ("+821000000000:123456,+15555550100:654321"). Those numbers get
// no SMS and always take their own code, on any server.

const DAY_MS = 24 * 60 * 60 * 1000
/** Codes one account may ask for in a day, and one number may receive. */
export const PHONE_CODES_PER_USER_PER_DAY = 5
export const PHONE_CODES_PER_NUMBER_PER_DAY = 5
const DEV_CODE = '000000'

export type PhoneVerificationError =
  | 'invalid_phone'
  | 'invalid_code'
  | 'wrong_code'
  | 'too_many_requests'
  | 'unavailable'

export class PhoneVerificationFailure extends Error {
  constructor(readonly code: PhoneVerificationError) {
    super(code)
  }
}

type TwilioConfig = { accountSid: string; authToken: string; serviceSid: string }

function readTwilioConfig(env: NodeJS.ProcessEnv = process.env): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? ''
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? ''
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID?.trim() ?? ''
  return accountSid && authToken && serviceSid ? { accountSid, authToken, serviceSid } : null
}

function devCodesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.PHONE_VERIFICATION_DEV_CODE === '1'
}

async function twilioRequest(config: TwilioConfig, path: string, form: Record<string, string>): Promise<Response> {
  return fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10_000),
  })
}

/** Store-review numbers with their fixed code (PHONE_REVIEW_LOGINS). */
export function readReviewPhoneLogins(env: NodeJS.ProcessEnv = process.env): Map<string, string> {
  const logins = new Map<string, string>()
  for (const entry of (env.PHONE_REVIEW_LOGINS ?? '').split(',')) {
    const [rawPhone, rawCode] = entry.split(':')
    const phone = rawPhone?.trim() ?? ''
    const code = rawCode?.replace(/\D/g, '') ?? ''
    if (isE164(phone) && code.length === 6) logins.set(phone, code)
  }
  return logins
}

export function isReviewPhoneNumber(phone: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return readReviewPhoneLogins(env).has(phone)
}

export function hashPhoneE164(e164: string): string {
  return createHash('sha256').update(e164).digest('hex')
}

/** Twilio's locale for the SMS text, from the app language (it falls back to English). */
function twilioLocale(uiLocale: string | undefined): string | undefined {
  const code = (uiLocale ?? '').trim().toLowerCase()
  if (!code) return undefined
  if (code === 'zh-cn') return 'zh-CN'
  if (code === 'zh-tw') return 'zh-HK'
  if (code === 'pt') return 'pt-BR'
  return code.split('-')[0]
}

type CodeRoute = 'korean_sms' | 'twilio' | 'dev'

/** Who sends and checks the number's code, or null when nobody can. */
function resolveCodeRoute(phone: string): CodeRoute | null {
  if (phone.startsWith('+82') && koreanSmsProvider()) return 'korean_sms'
  if (readTwilioConfig()) return 'twilio'
  return devCodesAllowed() ? 'dev' : null
}

/** Sends a code to the number, within the daily caps. */
export async function startPhoneVerification(userId: string, rawPhone: unknown, options: { locale?: string } = {}): Promise<void> {
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : ''
  if (!isE164(phone)) throw new PhoneVerificationFailure('invalid_phone')
  if (isReviewPhoneNumber(phone)) return
  const route = resolveCodeRoute(phone)
  if (!route) throw new PhoneVerificationFailure('unavailable')

  const since = new Date(Date.now() - DAY_MS)
  const [byUser, byNumber] = await Promise.all([
    prisma.phoneVerificationRequest.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.phoneVerificationRequest.count({ where: { phoneE164: phone, createdAt: { gte: since } } }),
  ])
  if (byUser >= PHONE_CODES_PER_USER_PER_DAY || byNumber >= PHONE_CODES_PER_NUMBER_PER_DAY) {
    throw new PhoneVerificationFailure('too_many_requests')
  }
  await prisma.phoneVerificationRequest.create({ data: { userId, phoneE164: phone } })
  await sendCode(route, phone, options.locale)
}

async function sendCode(route: CodeRoute, phone: string, uiLocale: string | undefined): Promise<void> {
  if (route === 'dev') {
    console.info('[phone-verification] dev mode: the code is', DEV_CODE)
    return
  }
  if (route === 'korean_sms') {
    try {
      await sendKoreanSms(phone, buildSmsCodeText(issueSmsCode(phone)))
    } catch (error) {
      if (error instanceof KoreanSmsError) throw new PhoneVerificationFailure(error.kind)
      throw error
    }
    return
  }
  const config = readTwilioConfig()
  if (!config) throw new PhoneVerificationFailure('unavailable')
  const locale = twilioLocale(uiLocale)
  const response = await twilioRequest(config, 'Verifications', { To: phone, Channel: 'sms', ...(locale ? { Locale: locale } : {}) })
  if (response.ok) return
  // 60200: invalid parameter (a number Twilio cannot text); 60203: Twilio's own send cap.
  const body = await response.json().catch(() => ({})) as { code?: number }
  if (body.code === 60200 || response.status === 400) throw new PhoneVerificationFailure('invalid_phone')
  if (body.code === 60203 || response.status === 429) throw new PhoneVerificationFailure('too_many_requests')
  throw new Error(`twilio_verify_${response.status}`)
}

async function checkCode(phone: string, code: string): Promise<boolean> {
  const reviewCode = readReviewPhoneLogins().get(phone)
  if (reviewCode) return code === reviewCode
  const route = resolveCodeRoute(phone)
  if (!route) throw new PhoneVerificationFailure('unavailable')
  if (route === 'korean_sms') return checkSmsCode(phone, code)
  if (route === 'dev') return code === DEV_CODE
  const config = readTwilioConfig()
  if (!config) throw new PhoneVerificationFailure('unavailable')
  const response = await twilioRequest(config, 'VerificationCheck', { To: phone, Code: code })
  // 404: no pending code for this number (expired, used up, or never sent).
  if (response.status === 404) return false
  if (response.status === 429) throw new PhoneVerificationFailure('too_many_requests')
  if (!response.ok) throw new Error(`twilio_verify_check_${response.status}`)
  const body = await response.json().catch(() => ({})) as { status?: string }
  return body.status === 'approved'
}

/**
 * Checks the code and makes the number this account's. A number belongs to
 * one account: proving it here takes it off any other account (a number that
 * changed hands, or a second account of the same person).
 */
export async function confirmPhoneVerification(userId: string, rawPhone: unknown, rawCode: unknown): Promise<{ phoneE164: string }> {
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : ''
  if (!isE164(phone)) throw new PhoneVerificationFailure('invalid_phone')
  const code = typeof rawCode === 'string' ? rawCode.replace(/\D/g, '') : ''
  if (code.length !== 6) throw new PhoneVerificationFailure('invalid_code')
  if (!(await checkCode(phone, code))) throw new PhoneVerificationFailure('wrong_code')

  const phoneHash = hashPhoneE164(phone)
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { phoneE164: phone, id: { not: userId } },
      data: { phoneE164: null, phoneHash: null, phoneVerifiedAt: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { phoneE164: phone, phoneHash, phoneVerifiedAt: new Date() },
    }),
  ])
  return { phoneE164: phone }
}

/**
 * Whether this server can verify numbers at all: Twilio is set up, or it is
 * a non-production server that takes the dev code. When false the app hides
 * the whole "find friends by number" part instead of offering a dead button.
 */
export function isPhoneVerificationAvailable(): boolean {
  return readTwilioConfig() !== null || koreanSmsProvider() !== null || devCodesAllowed()
}

/** The account's verified number, if any. */
export async function readVerifiedPhone(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneE164: true, phoneVerifiedAt: true } })
  return user?.phoneE164 && user.phoneVerifiedAt ? user.phoneE164 : null
}

/** Removes the number from the account: it can no longer be found by it. */
export async function removeVerifiedPhone(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { phoneE164: null, phoneHash: null, phoneVerifiedAt: null } })
}

// ── Sign-in by phone number ─────────────────────────────────────────────
// Before there is an account the daily caps above (per account) do not apply,
// so codes are capped per number and per client address here, in memory: a
// restart forgets them, and Twilio Verify's own per-number limit still holds.

/** Codes one number, and one client address, may ask for in a day before signing in. */
export const PHONE_SIGN_IN_CODES_PER_NUMBER_PER_DAY = 5
export const PHONE_SIGN_IN_CODES_PER_CLIENT_PER_DAY = 10

const signInRequests = new Map<string, number[]>()

function takeSignInSlot(key: string, limit: number, now: number): boolean {
  const recent = (signInRequests.get(key) ?? []).filter((at) => now - at < DAY_MS)
  if (recent.length >= limit) {
    signInRequests.set(key, recent)
    return false
  }
  recent.push(now)
  signInRequests.set(key, recent)
  return true
}

/** Test hook: forgets every sign-in request. */
export function resetPhoneSignInLimits(): void {
  signInRequests.clear()
}

/** Sends a sign-in code to the number (no account needed). `clientKey` is the caller's address. */
export async function startPhoneSignIn(rawPhone: unknown, options: { locale?: string; clientKey?: string; now?: number } = {}): Promise<void> {
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : ''
  if (!isE164(phone)) throw new PhoneVerificationFailure('invalid_phone')
  if (isReviewPhoneNumber(phone)) return
  const route = resolveCodeRoute(phone)
  if (!route) throw new PhoneVerificationFailure('unavailable')
  const now = options.now ?? Date.now()
  const clientKey = options.clientKey?.trim()
  if (clientKey && !takeSignInSlot(`client:${clientKey}`, PHONE_SIGN_IN_CODES_PER_CLIENT_PER_DAY, now)) {
    throw new PhoneVerificationFailure('too_many_requests')
  }
  if (!takeSignInSlot(`phone:${phone}`, PHONE_SIGN_IN_CODES_PER_NUMBER_PER_DAY, now)) {
    throw new PhoneVerificationFailure('too_many_requests')
  }
  await sendCode(route, phone, options.locale)
}

/** True when the code proves the number; the caller then signs that number's account in. */
export async function verifyPhoneSignIn(rawPhone: unknown, rawCode: unknown): Promise<string | null> {
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : ''
  if (!isE164(phone)) return null
  const code = typeof rawCode === 'string' ? rawCode.replace(/\D/g, '') : ''
  if (code.length !== 6) return null
  try {
    return (await checkCode(phone, code)) ? phone : null
  } catch {
    return null
  }
}
