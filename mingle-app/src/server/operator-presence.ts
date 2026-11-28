import { prisma } from '@/lib/prisma'

/**
 * Operator accounts that look online (owner, 2026-11-25): so the app never
 * feels empty, a share of the operator accounts is kept "online" at any
 * moment. The share itself is picked at random for each half hour, between
 * PRESENCE_SHARE_MIN and PRESENCE_SHARE_MAX of all operator accounts. Which
 * accounts follow their country's local time: someone in Seoul is more likely
 * online at 21:00 Seoul time than at 04:00. "Online" is simply a fresh
 * `lastSeenAt`, so the explore cards, their dot and filters and the profile
 * all agree with no special case. Run from the operator automation worker.
 */
export const PRESENCE_SHARE_MIN = 0.1
export const PRESENCE_SHARE_MAX = 0.3
/** One set of online accounts per half hour; within it, lastSeenAt is kept fresh. */
export const PRESENCE_SLOT_MS = 30 * 60_000
/** How often the chosen accounts are touched: under the 5-minute "online" window. */
export const PRESENCE_REFRESH_MS = 2 * 60_000

/** Usual UTC offset (hours) of each persona country; others use Korea's. */
const COUNTRY_UTC_OFFSET: Record<string, number> = {
  KR: 9, JP: 9, CN: 8, TW: 8, HK: 8, MO: 8, MN: 8, PH: 8, SG: 8, MY: 8, AU: 10, NZ: 13,
  VN: 7, TH: 7, ID: 7, KH: 7, LA: 7, MM: 6.5, BD: 6, IN: 5.5, NP: 5.75, LK: 5.5, PK: 5, KZ: 5, UZ: 5,
  RU: 3, TR: 3, SA: 3, AE: 4, IR: 3.5, IL: 2, EG: 2, UA: 2, PL: 1, DE: 1, FR: 1, ES: 1, IT: 1, NL: 1, BE: 1,
  SE: 1, NO: 1, DK: 1, CH: 1, AT: 1, CZ: 1, HU: 1, GB: 0, IE: 0, PT: 0, MA: 1, NG: 1, ZA: 2, KE: 3,
  US: -6, CA: -5, MX: -6, BR: -3, AR: -3, CL: -4, CO: -5, PE: -5,
}

export function utcOffsetForCountry(country: string | null | undefined): number {
  return COUNTRY_UTC_OFFSET[(country ?? '').toUpperCase()] ?? 9
}

/** How likely someone is on their phone at this local hour (0–23). */
export function activityAtLocalHour(hour: number): number {
  if (hour >= 2 && hour < 7) return 0.08
  if (hour >= 7 && hour < 10) return 0.55
  if (hour >= 10 && hour < 18) return 0.7
  if (hour >= 18 || hour < 1) return 1
  return 0.4 // 01:00–02:00
}

/** A number in [0, 1) from a string, the same every time (FNV-1a). */
export function seededUnit(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash / 0x100000000
}

/** The share of operator accounts online during this half hour: random, 10–30 %. */
export function presenceShareForSlot(slot: number): number {
  return PRESENCE_SHARE_MIN + seededUnit(`presence-share:${slot}`) * (PRESENCE_SHARE_MAX - PRESENCE_SHARE_MIN)
}

export type PresenceCandidate = { id: string; country: string | null }

/**
 * The accounts online now: the slot's share of them, preferring those for
 * whom it is a waking hour. Deterministic per slot, so several app servers
 * pick the same set.
 */
export function selectOnlineOperators(candidates: readonly PresenceCandidate[], now: Date): string[] {
  if (candidates.length === 0) return []
  const slot = Math.floor(now.getTime() / PRESENCE_SLOT_MS)
  const target = Math.round(presenceShareForSlot(slot) * candidates.length)
  if (target <= 0) return []
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60
  const scored = candidates.map((candidate) => {
    const localHour = Math.floor((((utcHours + utcOffsetForCountry(candidate.country)) % 24) + 24) % 24)
    // Weighted random pick (Efraimidis–Spirakis): u^(1/w), highest first.
    const weight = activityAtLocalHour(localHour)
    const score = Math.pow(Math.max(seededUnit(`presence:${slot}:${candidate.id}`), 1e-9), 1 / weight)
    return { id: candidate.id, score }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, target).map((entry) => entry.id)
}

const PRESENCE_STATE_KEY = Symbol.for('mingle.operatorPresence.lastRefreshAt.v1')

/** Touches lastSeenAt of the accounts that are online now; at most once per PRESENCE_REFRESH_MS in this process. */
export async function refreshOperatorPresence(now: Date = new Date()): Promise<number | 'waiting'> {
  const holder = globalThis as typeof globalThis & { [PRESENCE_STATE_KEY]?: number }
  const last = holder[PRESENCE_STATE_KEY] ?? 0
  if (now.getTime() - last < PRESENCE_REFRESH_MS) return 'waiting'
  holder[PRESENCE_STATE_KEY] = now.getTime()
  if (['0', 'off', 'false'].includes((process.env.OPERATOR_PRESENCE ?? '').trim().toLowerCase())) return 0
  const operators = await prisma.user.findMany({
    where: {
      isOperator: true, isOfficial: false, isActive: true, isDeleted: false,
      moderationHiddenAt: null, moderationRestrictedAt: null,
      // Only published personas (a photo, a persona country): never staff accounts like @admin.
      image: { not: null },
      operatorAccount: { personaCountry: { not: null } },
    },
    select: { id: true, nationalityCountry: true, operatorAccount: { select: { personaCountry: true } } },
    take: 5000,
  })
  const online = selectOnlineOperators(
    operators.map((operator) => ({ id: operator.id, country: operator.operatorAccount?.personaCountry ?? operator.nationalityCountry })),
    now,
  )
  if (online.length === 0) return 0
  const updated = await prisma.user.updateMany({ where: { id: { in: online } }, data: { lastSeenAt: now } })
  return updated.count
}
