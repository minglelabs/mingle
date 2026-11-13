import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

// Korean numbers get their code by plain SMS through Solapi (about 18 KRW a
// message, against about 140 KRW for Twilio Verify to Korea). Solapi only
// sends; the code is made and checked here (SOLAPI_API_KEY,
// SOLAPI_API_SECRET, SOLAPI_SENDER: the sender number registered in the
// Solapi console, digits only).
//
// Codes live in memory for CODE_TTL_MS: the app runs as one server, and a
// restart only means asking for a new code.

export const SMS_CODE_TTL_MS = 5 * 60 * 1000
export const SMS_CODE_MAX_ATTEMPTS = 5

type SolapiConfig = { apiKey: string; apiSecret: string; sender: string }

export function readSolapiConfig(env: NodeJS.ProcessEnv = process.env): SolapiConfig | null {
  const apiKey = env.SOLAPI_API_KEY?.trim() ?? ''
  const apiSecret = env.SOLAPI_API_SECRET?.trim() ?? ''
  const sender = (env.SOLAPI_SENDER ?? '').replace(/\D/g, '')
  return apiKey && apiSecret && sender ? { apiKey, apiSecret, sender } : null
}

/** Solapi takes Korean numbers in domestic form: +821012345678 -> 01012345678. */
export function toKoreanDomesticNumber(e164: string): string | null {
  return /^\+82\d{8,11}$/.test(e164) ? `0${e164.slice(3)}` : null
}

/** Solapi's HMAC-SHA256 header: the signature covers the date and a random salt. */
export function buildSolapiAuthorization(config: Pick<SolapiConfig, 'apiKey' | 'apiSecret'>, date: string, salt: string): string {
  const signature = createHmac('sha256', config.apiSecret).update(date + salt).digest('hex')
  return `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

export class SolapiSendError extends Error {
  constructor(readonly status: number, readonly errorCode: string) {
    super(`solapi_send_${status}_${errorCode}`)
  }
}

export async function sendSolapiSms(config: SolapiConfig, toE164: string, text: string): Promise<void> {
  const to = toKoreanDomesticNumber(toE164)
  if (!to) throw new SolapiSendError(400, 'not_korean_number')
  const date = new Date().toISOString()
  const salt = randomBytes(16).toString('hex')
  const response = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      Authorization: buildSolapiAuthorization(config, date, salt),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { to, from: config.sender, text } }),
    signal: AbortSignal.timeout(10_000),
  })
  if (response.ok) return
  const body = await response.json().catch(() => ({})) as { errorCode?: string }
  throw new SolapiSendError(response.status, body.errorCode ?? 'unknown')
}

// ── Codes ───────────────────────────────────────────────────────────────

type PendingCode = { hash: Buffer; expiresAt: number; attempts: number }
const pendingCodes = new Map<string, PendingCode>()

function hashCode(phone: string, code: string): Buffer {
  return createHash('sha256').update(`${phone}:${code}`).digest()
}

/** A new 6-digit code for the number; it replaces any earlier one. */
export function issueSmsCode(phone: string, now = Date.now()): string {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  pendingCodes.set(phone, { hash: hashCode(phone, code), expiresAt: now + SMS_CODE_TTL_MS, attempts: 0 })
  return code
}

/** True once for the right code; wrong tries count, and the code dies after SMS_CODE_MAX_ATTEMPTS or SMS_CODE_TTL_MS. */
export function checkSmsCode(phone: string, code: string, now = Date.now()): boolean {
  const pending = pendingCodes.get(phone)
  if (!pending) return false
  if (now > pending.expiresAt || pending.attempts >= SMS_CODE_MAX_ATTEMPTS) {
    pendingCodes.delete(phone)
    return false
  }
  pending.attempts += 1
  if (!timingSafeEqual(pending.hash, hashCode(phone, code))) return false
  pendingCodes.delete(phone)
  return true
}

/** Test hook. */
export function resetSmsCodes(): void {
  pendingCodes.clear()
}

/** The SMS text, in Korean for Korean numbers. */
export function buildSmsCodeText(code: string): string {
  return `[HashChat] 인증번호 ${code} (5분 안에 입력해 주세요)`
}
