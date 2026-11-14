import { toKoreanDomesticNumber } from '@/server/sms-codes'

// Sendon plain SMS (10.5 KRW a message). SENDON_ID and SENDON_API_KEY come
// from the Sendon console (API KEY 관리), SENDON_SENDER is a sender number
// registered there (digits only). Sendon only takes calls from allowed IPs, so
// the server's outbound IP must be listed in the console (허용 IP 관리).

type SendonConfig = { id: string; apiKey: string; sender: string }

export function readSendonConfig(env: NodeJS.ProcessEnv = process.env): SendonConfig | null {
  const id = env.SENDON_ID?.trim() ?? ''
  const apiKey = env.SENDON_API_KEY?.trim() ?? ''
  const sender = (env.SENDON_SENDER ?? '').replace(/\D/g, '')
  return id && apiKey && sender ? { id, apiKey, sender } : null
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
