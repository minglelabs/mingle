import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

// Korean numbers get their code by plain SMS through Sendon (10.5 KRW a
// message, against about 140 KRW for Twilio Verify to Korea). Sendon only
// sends; the code is made and checked here. SENDON_ID and SENDON_API_KEY come
// from the Sendon console (API KEY 관리), SENDON_SENDER is a sender number
// registered there (digits only). Sendon only takes calls from allowed IPs, so
// the server's outbound IP must be listed in the console (허용 IP 관리).
//
// Codes live in memory for CODE_TTL_MS: the app runs as one server, and a
// restart only means asking for a new code.

export const SMS_CODE_TTL_MS = 5 * 60 * 1000
export const SMS_CODE_MAX_ATTEMPTS = 5

type SendonConfig = { id: string; apiKey: string; sender: string }

export function readSendonConfig(env: NodeJS.ProcessEnv = process.env): SendonConfig | null {
  const id = env.SENDON_ID?.trim() ?? ''
  const apiKey = env.SENDON_API_KEY?.trim() ?? ''
  const sender = (env.SENDON_SENDER ?? '').replace(/\D/g, '')
  return id && apiKey && sender ? { id, apiKey, sender } : null
}

/** Sendon takes Korean numbers in domestic form: +821012345678 -> 01012345678. */
export function toKoreanDomesticNumber(e164: string): string | null {
  return /^\+82\d{8,11}$/.test(e164) ? `0${e164.slice(3)}` : null
}

/** HTTP Basic with the account id and the API key, as Sendon's own SDK sends it. */
export function buildSendonAuthorization(config: Pick<SendonConfig, 'id' | 'apiKey'>): string {
  return `Basic ${Buffer.from(`${config.id}:${config.apiKey}`).toString('base64')}`
}

/** `code` is Sendon's result code: it answers HTTP 200 even on failure and puts the real code in the body. */
export class SendonSendError extends Error {
  constructor(readonly code: number, readonly reason: string) {
    super(`sendon_send_${code}`)
  }
}

export async function sendSendonSms(config: SendonConfig, toE164: string, text: string): Promise<void> {
  const to = toKoreanDomesticNumber(toE164)
  if (!to) throw new SendonSendError(400, 'not_korean_number')
  const response = await fetch('https://api.sendon.io/v2/messages/sms', {
    method: 'POST',
    headers: {
      Authorization: buildSendonAuthorization(config),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'SMS', from: config.sender, to: [to], message: text, isAd: false }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await response.json().catch(() => ({})) as { code?: number; message?: string }
  const code = typeof body.code === 'number' ? body.code : response.status
  if (response.ok && code === 200) return
  throw new SendonSendError(code, body.message ?? 'unknown')
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
