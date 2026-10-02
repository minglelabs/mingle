import { createHmac, timingSafeEqual } from 'node:crypto'
import { readCoinInternalSecret } from './config'

// Billing identity for mingle-stt (spec 5.3). The STT service has no user
// sessions and no database: the client forwards this token in its STT config
// and mingle-stt hands it back to the internal charge API, which verifies it.

const STT_BILLING_TOKEN_TTL_MS = 12 * 60 * 60 * 1000

export function mintSttBillingToken(userId: string, now = Date.now()): string | null {
  const secret = readCoinInternalSecret()
  if (!secret || !userId) return null
  const body = Buffer.from(JSON.stringify({ u: userId, exp: now + STT_BILLING_TOKEN_TTL_MS }), 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(`stt-billing:${body}`).digest('base64url')
  return `${body}.${signature}`
}

export function verifySttBillingToken(token: unknown, now = Date.now()): { userId: string } | null {
  const secret = readCoinInternalSecret()
  if (!secret || typeof token !== 'string') return null
  const [body, signature, ...rest] = token.split('.')
  if (!body || !signature || rest.length) return null
  const expected = Buffer.from(createHmac('sha256', secret).update(`stt-billing:${body}`).digest('base64url'))
  const provided = Buffer.from(signature)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { u?: unknown; exp?: unknown }
    if (typeof payload.u !== 'string' || !payload.u || typeof payload.exp !== 'number' || payload.exp < now) return null
    return { userId: payload.u }
  } catch {
    return null
  }
}

export function isInternalCoinRequestAuthorized(authorizationHeader: string | null): boolean {
  const secret = readCoinInternalSecret()
  if (!secret || !authorizationHeader) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const provided = Buffer.from(authorizationHeader)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}
