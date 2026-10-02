import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePolarOrder, readPolarConfig, verifyPolarWebhookSignature } from './polar'

const NOW = 1_800_000_000_000
const timestamp = String(NOW / 1000)
const body = JSON.stringify({ type: 'order.paid', data: { id: 'order-1' } })

function signature(key: Buffer, id = 'msg_1', ts = timestamp, payload = body): string {
  return `v1,${createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest('base64')}`
}

describe('verifyPolarWebhookSignature', () => {
  const rawKey = Buffer.from('0123456789abcdef0123456789abcdef')
  const secret = `whsec_${rawKey.toString('base64')}`
  const base = { secret, webhookId: 'msg_1', webhookTimestamp: timestamp, rawBody: body, now: NOW }

  it('accepts a Standard Webhooks signature (key = base64 part of the secret)', () => {
    expect(verifyPolarWebhookSignature({ ...base, webhookSignature: signature(rawKey) })).toBe(true)
  })

  it('accepts the older Polar scheme (key = the whole secret string)', () => {
    expect(verifyPolarWebhookSignature({ ...base, webhookSignature: signature(Buffer.from(secret, 'utf8')) })).toBe(true)
  })

  it('accepts any valid entry of a rotated signature list', () => {
    expect(verifyPolarWebhookSignature({ ...base, webhookSignature: `v1,AAAA ${signature(rawKey)}` })).toBe(true)
  })

  it('rejects a changed body, another key, a stale timestamp and missing parts', () => {
    expect(verifyPolarWebhookSignature({ ...base, rawBody: `${body} `, webhookSignature: signature(rawKey) })).toBe(false)
    expect(verifyPolarWebhookSignature({ ...base, webhookSignature: signature(Buffer.from('other-key')) })).toBe(false)
    expect(verifyPolarWebhookSignature({ ...base, now: NOW + 6 * 60_000, webhookSignature: signature(rawKey) })).toBe(false)
    expect(verifyPolarWebhookSignature({ ...base, webhookSignature: null })).toBe(false)
    expect(verifyPolarWebhookSignature({ ...base, secret: '', webhookSignature: signature(rawKey) })).toBe(false)
    expect(verifyPolarWebhookSignature({ ...base, webhookSignature: signature(rawKey).replace('v1,', 'v2,') })).toBe(false)
  })
})

describe('parsePolarOrder', () => {
  it('reads the buyer and the pack from our checkout metadata', () => {
    expect(parsePolarOrder({
      id: 'order-1',
      status: 'paid',
      paid: true,
      total_amount: 999,
      refunded_amount: 0,
      currency: 'usd',
      billing_address: { country: 'KR' },
      product_id: 'polar-product',
      customer: { external_id: 'user-from-customer' },
      metadata: { mingle_user_id: 'user-1', mingle_coin_product: 'coin_10000' },
    })).toMatchObject({
      id: 'order-1', paid: true, totalAmount: 999, currency: 'usd', country: 'KR',
      polarProductId: 'polar-product', userId: 'user-1', coinProductId: 'coin_10000',
    })
  })

  it('falls back to the customer external id and the nested product id', () => {
    const order = parsePolarOrder({ id: 'order-2', product: { id: 'nested' }, customer: { external_id: 'user-2' }, metadata: {} })
    expect(order).toMatchObject({ userId: 'user-2', polarProductId: 'nested', coinProductId: null, paid: false })
  })

  it('rejects a payload without an order id', () => {
    expect(() => parsePolarOrder({ status: 'paid' })).toThrow('invalid_transaction')
  })
})

describe('readPolarConfig', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it('is off without a token and picks the API host from POLAR_SERVER', () => {
    delete process.env.POLAR_ACCESS_TOKEN
    expect(readPolarConfig()).toBeNull()
    process.env.POLAR_ACCESS_TOKEN = 'polar_pat_x'
    expect(readPolarConfig()).toMatchObject({ apiBase: 'https://api.polar.sh', sandbox: false })
    process.env.POLAR_SERVER = 'sandbox'
    expect(readPolarConfig()).toMatchObject({ apiBase: 'https://sandbox-api.polar.sh', sandbox: true })
  })
})
