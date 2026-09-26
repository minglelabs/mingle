/**
 * Abuse-prevention rate limiter for the posting feature's write actions.
 *
 * A per-(user, action) sliding window over an in-memory store. Limits are
 * deliberately conservative so normal use is never blocked — they only catch
 * abnormal bursts (scripted spam, a stuck retry loop).
 *
 * ⚠️ In-memory: the counters live in this process only, so with multiple
 * server instances each instance enforces the limit independently and the
 * effective ceiling is (limit × instance count). See the report's "merge
 * notes". A shared store (Redis / a DB table) would make it exact; the
 * contract (`checkRateLimit` / `rateLimitGuard`) is written so that swap is
 * internal.
 *
 * On the response shape, this matches the frozen contract from the common
 * rules: HTTP 429, body `{ error: 'rate_limited', retryAfterSeconds }`, and a
 * `Retry-After` header.
 */

import { NextResponse } from 'next/server'

export type RateLimitAction =
  | 'create_post'
  | 'create_comment'
  | 'like_post'
  | 'like_comment'

type WindowRule = { limit: number; windowMs: number }

/**
 * Conservative ceilings. A real person never writes 10 posts or 30 comments a
 * minute, nor likes 60 posts a minute, but a burst well above these is abuse.
 */
const RULES: Record<RateLimitAction, WindowRule> = {
  create_post: { limit: 10, windowMs: 60_000 },
  create_comment: { limit: 30, windowMs: 60_000 },
  like_post: { limit: 60, windowMs: 60_000 },
  like_comment: { limit: 60, windowMs: 60_000 },
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

/**
 * Timestamps (ms) of the recent hits per `${action}:${userId}` key. Pruned to
 * the window on each check, so memory stays bounded by active users × limit.
 */
type Store = Map<string, number[]>

const globalStore: Store = new Map()

function keyOf(action: RateLimitAction, userId: string): string {
  return `${action}:${userId}`
}

/**
 * Record one hit and decide. `now`/`store` are injectable for tests; callers
 * in route handlers pass neither and get the process-global store + real clock.
 */
export function checkRateLimit(
  action: RateLimitAction,
  userId: string,
  now: number = Date.now(),
  store: Store = globalStore,
): RateLimitDecision {
  const rule = RULES[action]
  const key = keyOf(action, userId)
  const windowStart = now - rule.windowMs

  const hits = (store.get(key) ?? []).filter((ts) => ts > windowStart)

  if (hits.length >= rule.limit) {
    // Oldest hit in the window frees a slot when it ages out.
    const oldest = hits[0]
    const retryAfterMs = Math.max(0, oldest + rule.windowMs - now)
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
    store.set(key, hits)
    return { allowed: false, retryAfterSeconds }
  }

  hits.push(now)
  store.set(key, hits)
  return { allowed: true }
}

/**
 * One-line guard for a write handler: returns a ready 429 `NextResponse` when
 * the limit is hit, or `null` to proceed. Usage in a route (right after auth):
 *
 *   const limited = rateLimitGuard('create_post', userId)
 *   if (limited) return limited
 */
export function rateLimitGuard(
  action: RateLimitAction,
  userId: string,
): NextResponse | null {
  const decision = checkRateLimit(action, userId)
  if (decision.allowed) return null
  return NextResponse.json(
    { error: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds },
    {
      status: 429,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': String(decision.retryAfterSeconds),
      },
    },
  )
}

/** Test-only: clear the process-global counters between cases. */
export function __resetRateLimitStore(): void {
  globalStore.clear()
}
