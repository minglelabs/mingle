import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveCoinBillingMode } from './config'
import { isInternalCoinRequestAuthorized, mintSttBillingToken, verifySttBillingToken } from './stt-token'

describe('STT billing token', () => {
  const previous = process.env.COIN_INTERNAL_SECRET
  beforeEach(() => {
    process.env.COIN_INTERNAL_SECRET = 'test-secret'
  })
  afterEach(() => {
    process.env.COIN_INTERNAL_SECRET = previous
  })

  it('round-trips the user id', () => {
    const token = mintSttBillingToken('user-1', 1_000)
    expect(verifySttBillingToken(token, 2_000)).toEqual({ userId: 'user-1' })
  })

  it('rejects expired, tampered and foreign-secret tokens', () => {
    const token = mintSttBillingToken('user-1', 1_000)!
    expect(verifySttBillingToken(token, 1_000 + 13 * 60 * 60 * 1000)).toBeNull()
    const [body, signature] = token.split('.')
    const forgedBody = Buffer.from(JSON.stringify({ u: 'user-2', exp: 9e15 })).toString('base64url')
    expect(verifySttBillingToken(`${forgedBody}.${signature}`, 2_000)).toBeNull()
    expect(verifySttBillingToken(`${body}.${signature}x`, 2_000)).toBeNull()
    expect(verifySttBillingToken(undefined)).toBeNull()
    process.env.COIN_INTERNAL_SECRET = 'other-secret'
    expect(verifySttBillingToken(token, 2_000)).toBeNull()
  })

  it('is disabled without a secret', () => {
    process.env.COIN_INTERNAL_SECRET = ''
    expect(mintSttBillingToken('user-1')).toBeNull()
    expect(isInternalCoinRequestAuthorized('Bearer ')).toBe(false)
  })

  it('authorizes only the exact bearer secret', () => {
    expect(isInternalCoinRequestAuthorized('Bearer test-secret')).toBe(true)
    expect(isInternalCoinRequestAuthorized('Bearer test-secreT')).toBe(false)
    expect(isInternalCoinRequestAuthorized(null)).toBe(false)
  })
})

describe('resolveCoinBillingMode', () => {
  it('is off unless explicitly enabled', () => {
    expect(resolveCoinBillingMode(undefined)).toBe('off')
    expect(resolveCoinBillingMode('0')).toBe('off')
    expect(resolveCoinBillingMode('shadow')).toBe('shadow')
    expect(resolveCoinBillingMode('1')).toBe('enforce')
    expect(resolveCoinBillingMode('TRUE')).toBe('enforce')
  })
})
