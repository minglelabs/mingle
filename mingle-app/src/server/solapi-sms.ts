import { createHmac, randomBytes } from 'node:crypto'
import { toKoreanDomesticNumber } from '@/server/sms-codes'

// Solapi plain SMS (about 18 KRW a message). SOLAPI_API_KEY and
// SOLAPI_API_SECRET come from the Solapi console, SOLAPI_SENDER is a sender
// number registered there (digits only). No IP allow list is needed.

type SolapiConfig = { apiKey: string; apiSecret: string; sender: string }

export function readSolapiConfig(env: NodeJS.ProcessEnv = process.env): SolapiConfig | null {
  const apiKey = env.SOLAPI_API_KEY?.trim() ?? ''
  const apiSecret = env.SOLAPI_API_SECRET?.trim() ?? ''
  const sender = (env.SOLAPI_SENDER ?? '').replace(/\D/g, '')
  return apiKey && apiSecret && sender ? { apiKey, apiSecret, sender } : null
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
