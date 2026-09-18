'use client'

import { EXPECTED_ACCOUNT_HEADER } from '@/lib/request-account-guard'

type Scope = { ownerIdentity: string; apiNamespace: string; sessionKey: string; clientMessageId: string }
const reservations = new Map<string, { expiresAt: number; promise: Promise<string | null>; receipt?: string }>()
const keyOf = (s: Scope) => JSON.stringify([s.ownerIdentity, s.apiNamespace, s.sessionKey, s.clientMessageId])

export function rememberLiveVoiceOrder(scope: Scope, receipt: string): void {
  if (getVoiceOrderReceipt(scope)) return
  if (reservations.size >= 200) reservations.delete(reservations.keys().next().value!)
  reservations.set(keyOf(scope), { expiresAt: Date.now() + 30 * 60_000, promise: Promise.resolve(receipt), receipt })
}

export function getVoiceOrderReceipt(scope: Scope): string | undefined {
  const entry = reservations.get(keyOf(scope))
  return entry && entry.expiresAt > Date.now() ? entry.receipt : undefined
}

export function reserveVoiceOrder(scope: Scope, endpoint: string, trackingUserId: string): void {
  if (!scope.ownerIdentity.startsWith('user:')) return
  const key = keyOf(scope)
  for (const [id, value] of reservations) if (value.expiresAt < Date.now()) reservations.delete(id)
  if (reservations.has(key)) return
  if (reservations.size >= 200) reservations.delete(reservations.keys().next().value!)
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<null>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(null) }, 3500)
  })
  const request = Promise.resolve().then(() => fetch(endpoint, {
    method: 'POST', signal: controller.signal,
    headers: { 'Content-Type': 'application/json', 'x-mingle-user-id': trackingUserId,
      [EXPECTED_ACCOUNT_HEADER]: scope.ownerIdentity.slice(5) },
    body: JSON.stringify({ eventType: 'stt_turn_started', reserveOrder: true,
      sessionKey: scope.sessionKey, clientMessageId: scope.clientMessageId }),
  })).then(async response => {
    if (!response.ok) return null
    const body = await response.json()
    if (typeof body.orderReceipt === 'string') rememberLiveVoiceOrder(scope, body.orderReceipt)
    return getVoiceOrderReceipt(scope) ?? null
  }).catch(() => null)
  const promise = Promise.race([request, timeout]).then(receipt => getVoiceOrderReceipt(scope) ?? receipt).finally(() => clearTimeout(timer))
  reservations.set(key, { expiresAt: Date.now() + 30 * 60_000, promise })
}

export function consumeVoiceOrder(scope: Scope): Promise<string | null> | null {
  const key = keyOf(scope)
  const entry = reservations.get(key)
  if (!entry || entry.expiresAt < Date.now()) return null
  // Same-message retries/view handoffs may still need this receipt before it
  // reaches the durable journal. Keep it in the bounded, expiring cache.
  // A very short utterance must not wait seconds on the reservation request.
  // Long turns normally have a receipt ready before finalization.
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([entry.promise, new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), 200)
  })]).finally(() => clearTimeout(timer))
}
