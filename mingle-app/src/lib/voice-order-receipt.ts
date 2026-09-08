import { createHmac, timingSafeEqual } from 'node:crypto'
import { readRealtimeSecret } from './realtime-token'

type Scope = { userId: string; sessionKey: string; clientMessageId: string }
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const signature = (body: string, secret: string) => createHmac('sha256', secret)
  .update(`mingle-voice-order-v1:${body}`).digest('base64url')

// A receipt reserves ordering without creating empty messages or changing the
// persistence timestamps used by unread counts and history pagination.
export function mintVoiceOrderReceipt(scope: Scope, now = Date.now()): string | null {
  const secret = readRealtimeSecret()
  if (!secret) return null
  const body = Buffer.from(JSON.stringify({ ...scope, startedAtMs: now })).toString('base64url')
  return `${body}.${signature(body, secret)}`
}

export function verifyVoiceOrderReceipt(value: unknown, scope: Scope, now = Date.now()): number | null {
  const secret = readRealtimeSecret()
  if (!secret || typeof value !== 'string' || value.length > 4096) return null
  try {
    const parts = value.split('.')
    if (parts.length !== 2) return null
    const expected = Buffer.from(signature(parts[0], secret))
    const actual = Buffer.from(parts[1])
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (data.userId !== scope.userId || data.sessionKey !== scope.sessionKey || data.clientMessageId !== scope.clientMessageId) return null
    const time = data.startedAtMs
    return Number.isSafeInteger(time) && time > 0 && time <= now && now - time <= MAX_AGE_MS ? time : null
  } catch { return null }
}
