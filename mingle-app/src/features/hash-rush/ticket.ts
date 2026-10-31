// Entry tickets for the Hash Rush game server. A room member asks the app
// server (POST /conversations/{id}/hash-rush/ticket, src/server/hash-rush) and
// joins that room's game with it, under their chat name.
//
// The server's ticket lasts 2 hours and the game reconnects with the same
// ticket after a dropped line. A ticket is reused (opening the game again in
// the same room, reconnecting) until shortly before it runs out: one that is
// almost spent would stop the next reconnect.

import { buildClientApiPath } from '@/lib/api-contract'

export const HASH_RUSH_TICKET_REUSE_MARGIN_MS = 10 * 60 * 1000

export type HashRushTicketGrant = {
  ticket: string
  room: string
  name: string
  /** On this device's clock: when the ticket was received plus its lifetime. */
  expiresAtMs: number
}

/**
 * Reads the ticket API's answer. `expiresIn` (seconds) is counted from when the
 * answer arrived, so a phone clock that is off does not matter. An answer
 * without it is used once and not kept for reuse.
 */
export function parseHashRushTicketGrant(body: unknown, receivedAtMs: number): HashRushTicketGrant | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const { ticket, room, name, expiresIn } = body as Record<string, unknown>
  if (typeof ticket !== 'string' || !ticket.trim()) return null
  if (typeof room !== 'string' || !room.trim()) return null
  const lifetimeSec = typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 0
  return {
    ticket,
    room,
    name: typeof name === 'string' ? name : '',
    expiresAtMs: receivedAtMs + lifetimeSec * 1000,
  }
}

export function isHashRushTicketGrantReusable(
  grant: HashRushTicketGrant | null | undefined,
  nowMs: number,
  marginMs = HASH_RUSH_TICKET_REUSE_MARGIN_MS,
): grant is HashRushTicketGrant {
  return !!grant && grant.expiresAtMs - nowMs > marginMs
}

// Tickets by viewer and room for this page's life.
const grants = new Map<string, HashRushTicketGrant>()

/**
 * A ticket into the game of chat room `conversationId` for `viewerKey`: a
 * good one already held, or a new one. `fresh` always asks for a new one (a
 * "try again" after the game could not get in).
 */
export async function requestHashRushTicket(input: { conversationId: string, viewerKey: string, fresh?: boolean }): Promise<HashRushTicketGrant> {
  const key = `${input.viewerKey}|${input.conversationId}`
  const held = grants.get(key)
  if (!input.fresh && isHashRushTicketGrantReusable(held, Date.now())) return held
  grants.delete(key)
  const response = await fetch(
    buildClientApiPath(`/conversations/${encodeURIComponent(input.conversationId)}/hash-rush/ticket` as `/${string}`),
    { method: 'POST', credentials: 'include' },
  )
  if (!response.ok) throw new Error(`hash_rush_ticket_${response.status}`)
  const grant = parseHashRushTicketGrant(await response.json(), Date.now())
  if (!grant) throw new Error('hash_rush_ticket_missing')
  if (isHashRushTicketGrantReusable(grant, Date.now())) grants.set(key, grant)
  return grant
}
