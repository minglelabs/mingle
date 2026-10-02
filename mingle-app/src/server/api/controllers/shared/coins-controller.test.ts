import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  session: vi.fn(),
  canSpendCoins: vi.fn(),
  chargeCoinUsage: vi.fn(),
  getCoinWallet: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: m.session }))
vi.mock('@/lib/auth-options', () => ({ getAuthOptions: () => ({}) }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/coins/purchases', () => ({ listCoinProducts: vi.fn(), refundPurchase: vi.fn(), verifyAndGrantPurchase: vi.fn() }))
vi.mock('@/server/coins/queries', () => ({ getCoinHistory: vi.fn(), getCoinUsageSummary: vi.fn(), normalizeCoinUsageRange: vi.fn() }))
vi.mock('@/server/coins/wallet', async () => ({
  ...(await vi.importActual<typeof import('@/server/coins/wallet')>('@/server/coins/wallet')),
  canSpendCoins: m.canSpendCoins,
  chargeCoinUsage: m.chargeCoinUsage,
  getCoinWallet: m.getCoinWallet,
}))

import { mintSttBillingToken } from '@/server/coins/stt-token'
import { chargeCoinsInternally, readCoinWallet } from './coins-controller'

function chargeRequest(body: Record<string, unknown>, authorization = 'Bearer secret') {
  return new NextRequest('http://app.test/api/internal/coins/charge', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('coins controller', () => {
  const env = { ...process.env }
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.COIN_INTERNAL_SECRET = 'secret'
    process.env.COIN_BILLING_ENABLED = '1'
    delete process.env.COIN_STT_ALLOW_LEGACY_ANONYMOUS
  })
  afterEach(() => {
    process.env = { ...env }
  })

  describe('POST /internal/coins/charge', () => {
    it('rejects callers without the shared secret', async () => {
      const response = await chargeCoinsInternally(chargeRequest({ kind: 'stt' }, 'Bearer wrong'))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthorized' })
    })

    it('refuses a connection without a billing token once billing is enforced', async () => {
      const response = await chargeCoinsInternally(chargeRequest({ kind: 'stt', seconds: 0, idempotencyKey: 'c:start', apiNamespace: 'ios/v2.1.1' }))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'invalid_billing_token' })
    })

    it('lets account-less 1.x clients through unbilled, unless that exemption is switched off', async () => {
      const body = { kind: 'stt', seconds: 0, idempotencyKey: 'c:start', apiNamespace: 'ios/v1.1.4' }
      expect(await (await chargeCoinsInternally(chargeRequest(body))).json()).toEqual({ balanceExhausted: false, billable: false })
      process.env.COIN_STT_ALLOW_LEGACY_ANONYMOUS = '0'
      expect((await chargeCoinsInternally(chargeRequest(body))).status).toBe(401)
    })

    it('bills nobody while billing is not enforced', async () => {
      process.env.COIN_BILLING_ENABLED = 'shadow'
      const response = await chargeCoinsInternally(chargeRequest({ kind: 'stt', seconds: 0, idempotencyKey: 'c:start', billingToken: 'garbage' }))
      expect(await response.json()).toEqual({ balanceExhausted: false, billable: false })
    })

    it('answers the start check from the spend gate and charges later chunks under a per-user key', async () => {
      const billingToken = mintSttBillingToken('user-1')
      m.canSpendCoins.mockResolvedValue(false)
      const start = await chargeCoinsInternally(chargeRequest({ kind: 'stt', seconds: 0, idempotencyKey: 'c:start', billingToken }))
      expect(await start.json()).toEqual({ balanceExhausted: true, error: 'coin_insufficient' })

      m.chargeCoinUsage.mockResolvedValue({ balanceExhausted: false })
      const chunk = await chargeCoinsInternally(chargeRequest({ kind: 'stt', seconds: 500, idempotencyKey: 'c:0', billingToken, sessionKey: 'room' }))
      expect(await chunk.json()).toEqual({ balanceExhausted: false })
      expect(m.chargeCoinUsage).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1', kind: 'stt', units: { second: 120 }, idempotencyKey: 'stt:user-1:c:0', sessionKey: 'room',
      }))
    })
  })

  describe('GET /coins/wallet', () => {
    it('touches no wallet while billing is off', async () => {
      delete process.env.COIN_BILLING_ENABLED
      m.session.mockResolvedValue({ user: { id: 'user-1' } })
      const body = await (await readCoinWallet()).json()
      expect(body).toMatchObject({ billingMode: 'off', balance: 0, sttBillingToken: null })
      expect(m.getCoinWallet).not.toHaveBeenCalled()
    })

    it('requires a session', async () => {
      m.session.mockResolvedValue(null)
      expect((await readCoinWallet()).status).toBe(401)
    })
  })
})
