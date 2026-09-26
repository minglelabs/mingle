import { describe, expect, it } from 'vitest'
import { checkRateLimit, rateLimitGuard, __resetRateLimitStore } from './rate-limit'

describe('checkRateLimit', () => {
  it('allows up to the limit within the window, then blocks', () => {
    const store = new Map<string, number[]>()
    const now = 1_000_000
    // create_post limit is 10/min
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('create_post', 'u1', now, store).allowed).toBe(true)
    }
    const blocked = checkRateLimit('create_post', 'u1', now, store)
    expect(blocked.allowed).toBe(false)
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('frees a slot once the oldest hit ages out of the window', () => {
    const store = new Map<string, number[]>()
    const start = 1_000_000
    for (let i = 0; i < 10; i++) checkRateLimit('create_post', 'u1', start, store)
    // Just before the window rolls: still blocked.
    expect(checkRateLimit('create_post', 'u1', start + 59_000, store).allowed).toBe(false)
    // After the window: the first hit is gone, one slot is free.
    expect(checkRateLimit('create_post', 'u1', start + 61_000, store).allowed).toBe(true)
  })

  it('isolates counters per user and per action', () => {
    const store = new Map<string, number[]>()
    const now = 1_000_000
    for (let i = 0; i < 10; i++) checkRateLimit('create_post', 'u1', now, store)
    // Different user — own budget.
    expect(checkRateLimit('create_post', 'u2', now, store).allowed).toBe(true)
    // Different action — own budget.
    expect(checkRateLimit('like_post', 'u1', now, store).allowed).toBe(true)
  })

  it('reports a retryAfter that shrinks as the window ages', () => {
    const store = new Map<string, number[]>()
    const start = 1_000_000
    for (let i = 0; i < 30; i++) checkRateLimit('create_comment', 'u1', start, store)
    const early = checkRateLimit('create_comment', 'u1', start + 10_000, store)
    const late = checkRateLimit('create_comment', 'u1', start + 50_000, store)
    if (!early.allowed && !late.allowed) {
      expect(late.retryAfterSeconds).toBeLessThan(early.retryAfterSeconds)
    } else {
      throw new Error('expected both to be blocked')
    }
  })
})

describe('rateLimitGuard', () => {
  it('returns null while under the limit', () => {
    __resetRateLimitStore()
    expect(rateLimitGuard('like_comment', 'guard-user')).toBeNull()
  })

  it('returns a 429 with the fixed body + Retry-After once over the limit', async () => {
    __resetRateLimitStore()
    // like_comment limit is 60/min
    for (let i = 0; i < 60; i++) rateLimitGuard('like_comment', 'guard-user-2')
    const res = rateLimitGuard('like_comment', 'guard-user-2')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    expect(res!.headers.get('Retry-After')).toBeTruthy()
    const body = await res!.json()
    expect(body.error).toBe('rate_limited')
    expect(typeof body.retryAfterSeconds).toBe('number')
  })
})

describe('edit / translate actions (W4)', () => {
  it.each([
    ['update_comment', 30],
    ['translate_post', 60],
    ['translate_comment', 60],
  ] as const)('%s allows %i per minute per user, then blocks', (action, limit) => {
    const store = new Map<string, number[]>()
    const now = 5_000_000
    for (let i = 0; i < limit; i++) expect(checkRateLimit(action, 'u1', now, store).allowed).toBe(true)
    expect(checkRateLimit(action, 'u1', now, store).allowed).toBe(false)
    expect(checkRateLimit(action, 'u2', now, store).allowed).toBe(true)
  })
})
