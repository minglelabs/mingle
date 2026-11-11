import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { isE164 } from '@/lib/phone-number'

// A user proves a phone number with a 6-digit SMS code. The code is made,
// sent and checked by Twilio Verify (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_VERIFY_SERVICE_SID); it is never stored here. Without Twilio set up,
// a non-production server accepts the code 000000 so the flow can be tried
// locally; production then answers "unavailable".

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

/** Sends a code to the number, within the daily caps. */
export async function startPhoneVerification(userId: string, rawPhone: unknown, options: { locale?: string } = {}): Promise<void> {
  const phone = typeof rawPhone === 'string' ? rawPhone.trim() : ''
  if (!isE164(phone)) throw new PhoneVerificationFailure('invalid_phone')
  const config = readTwilioConfig()
  if (!config && !devCodesAllowed()) throw new PhoneVerificationFailure('unavailable')

  const since = new Date(Date.now() - DAY_MS)
  const [byUser, byNumber] = await Promise.all([
    prisma.phoneVerificationRequest.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.phoneVerificationRequest.count({ where: { phoneE164: phone, createdAt: { gte: since } } }),
  ])
  if (byUser >= PHONE_CODES_PER_USER_PER_DAY || byNumber >= PHONE_CODES_PER_NUMBER_PER_DAY) {
    throw new PhoneVerificationFailure('too_many_requests')
  }
  await prisma.phoneVerificationRequest.create({ data: { userId, phoneE164: phone } })

  if (!config) {
    console.info('[phone-verification] dev mode: the code is', DEV_CODE)
    return
  }
  const locale = twilioLocale(options.locale)
  const response = await twilioRequest(config, 'Verifications', { To: phone, Channel: 'sms', ...(locale ? { Locale: locale } : {}) })
  if (response.ok) return
  // 60200: invalid parameter (a number Twilio cannot text); 60203: Twilio's own send cap.
  const body = await response.json().catch(() => ({})) as { code?: number }
  if (body.code === 60200 || response.status === 400) throw new PhoneVerificationFailure('invalid_phone')
  if (body.code === 60203 || response.status === 429) throw new PhoneVerificationFailure('too_many_requests')
  throw new Error(`twilio_verify_${response.status}`)
}

async function checkCode(phone: string, code: string): Promise<boolean> {
  const config = readTwilioConfig()
  if (!config) {
    if (!devCodesAllowed()) throw new PhoneVerificationFailure('unavailable')
    return code === DEV_CODE
  }
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

/** The account's verified number, if any. */
export async function readVerifiedPhone(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phoneE164: true, phoneVerifiedAt: true } })
  return user?.phoneE164 && user.phoneVerifiedAt ? user.phoneE164 : null
}

/** Removes the number from the account: it can no longer be found by it. */
export async function removeVerifiedPhone(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { phoneE164: null, phoneHash: null, phoneVerifiedAt: null } })
}
