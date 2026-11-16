import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

// Codes for numbers we text ourselves (Korean numbers through Sendon or
// Solapi, see @/server/korean-sms). The code is made and checked here; the
// provider only delivers the text.
//
// Codes live in memory for SMS_CODE_TTL_MS: the app runs as one server, and a
// restart only means asking for a new code.

export const SMS_CODE_TTL_MS = 5 * 60 * 1000
export const SMS_CODE_MAX_ATTEMPTS = 5

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

/** Korean providers take numbers in domestic form: +821012345678 -> 01012345678. */
export function toKoreanDomesticNumber(e164: string): string | null {
  return /^\+82\d{8,11}$/.test(e164) ? `0${e164.slice(3)}` : null
}
