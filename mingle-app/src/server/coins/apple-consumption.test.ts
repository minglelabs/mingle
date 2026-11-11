import { generateKeyPairSync, verify } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ purchase: vi.fn(), lot: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { appIapPurchase: { findUnique: m.purchase }, appCoinLot: { findUnique: m.lot } },
}))

import {
  AppleConsumptionRetryableError,
  buildAppleConsumptionBody,
  respondToAppleConsumptionRequest,
  signAppleApiJwt,
  type AppleApiConfig,
} from './apple-consumption'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const config: AppleApiConfig = {
  issuerId: 'issuer',
  keyId: 'KEY123',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  bundleId: 'com.example.app',
}
const COIN = 1_000_000n

describe('buildAppleConsumptionBody', () => {
  it('asks for a full refund while nothing of the pack was used', () => {
    expect(buildAppleConsumptionBody({ grantedMicro: 100n * COIN, remainingMicro: 100n * COIN })).toEqual({
      customerConsented: true,
      deliveryStatus: 'DELIVERED',
      sampleContentProvided: true,
      consumptionPercentage: 0,
      refundPreference: 'GRANT_FULL',
    })
  })

  it('asks Apple to decline once any of it was used or gifted', () => {
    expect(buildAppleConsumptionBody({ grantedMicro: 100n * COIN, remainingMicro: 25n * COIN }))
      .toMatchObject({ consumptionPercentage: 75_000, refundPreference: 'DECLINE' })
    // One Hash out of 100,000 still reads as used.
    expect(buildAppleConsumptionBody({ grantedMicro: 100_000n * COIN, remainingMicro: 99_999n * COIN + 999_999n }))
      .toMatchObject({ consumptionPercentage: 1, refundPreference: 'DECLINE' })
    expect(buildAppleConsumptionBody({ grantedMicro: 10n * COIN, remainingMicro: 0n }))
      .toMatchObject({ consumptionPercentage: 100_000, refundPreference: 'DECLINE' })
  })
})

describe('signAppleApiJwt', () => {
  it('signs an ES256 token Apple accepts the shape of', () => {
    const now = new Date('2026-11-11T00:00:00Z')
    const [header, payload, signature] = signAppleApiJwt(config, now).split('.')
    const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString())
    expect(decode(header)).toEqual({ alg: 'ES256', kid: 'KEY123', typ: 'JWT' })
    const iat = now.getTime() / 1000
    expect(decode(payload)).toEqual({ iss: 'issuer', iat, exp: iat + 300, aud: 'appstoreconnect-v1', bid: 'com.example.app' })
    expect(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true)
  })
})

describe('respondToAppleConsumptionRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.purchase.mockResolvedValue({ platform: 'ios', lotId: 'lot1' })
    m.lot.mockResolvedValue({ grantedMicro: 10n * COIN, remainingMicro: 4n * COIN })
  })

  it('does nothing without an API key', async () => {
    expect(await respondToAppleConsumptionRequest({ transactionId: 't1', environment: 'production', config: null })).toBe('consumption_not_configured')
    expect(m.purchase).not.toHaveBeenCalled()
  })

  it('leaves a purchase we never granted unanswered', async () => {
    m.purchase.mockResolvedValue(null)
    const fetchImpl = vi.fn()
    expect(await respondToAppleConsumptionRequest({ transactionId: 't1', environment: 'production', config, fetchImpl }))
      .toBe('consumption_purchase_not_found')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('PUTs the v2 consumption body to the environment of the transaction', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    expect(await respondToAppleConsumptionRequest({ transactionId: 't 1', environment: 'sandbox', config, fetchImpl })).toBe('consumption_sent')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.storekit-sandbox.apple.com/inApps/v2/transactions/consumption/t%201')
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/)
    expect(JSON.parse(init.body)).toMatchObject({ consumptionPercentage: 60_000, refundPreference: 'DECLINE' })
  })

  it('asks for a redelivery on a server error, but not on a definite refusal', async () => {
    const respond = (status: number) => respondToAppleConsumptionRequest({
      transactionId: 't1',
      environment: 'production',
      config,
      fetchImpl: vi.fn().mockResolvedValue(new Response('{}', { status })),
    })
    await expect(respond(500)).rejects.toBeInstanceOf(AppleConsumptionRetryableError)
    await expect(respond(429)).rejects.toBeInstanceOf(AppleConsumptionRetryableError)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await respond(404)).toBe('consumption_rejected_404')
  })
})
