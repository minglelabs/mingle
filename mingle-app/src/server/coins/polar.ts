import { createHmac, timingSafeEqual } from 'node:crypto'
import { IapVerificationError } from './iap-apple'

// Polar (polar.sh) web checkout for coins. Polar is the merchant of record:
// we create a checkout session for one of our Polar products, the buyer pays
// on Polar's page, and Polar tells us through a signed webhook. The webhook is
// only a trigger: the order is always read back from the API before granting.

const POLAR_PRODUCTION_API = 'https://api.polar.sh'
const POLAR_SANDBOX_API = 'https://sandbox-api.polar.sh'
const REQUEST_TIMEOUT_MS = 10_000
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000

export const POLAR_METADATA_USER_ID = 'mingle_user_id'
export const POLAR_METADATA_PRODUCT = 'mingle_coin_product'

export type PolarConfig = { accessToken: string; apiBase: string; sandbox: boolean }

/** POLAR_ACCESS_TOKEN + POLAR_SERVER (sandbox | production; default production). null = web checkout is off. */
export function readPolarConfig(): PolarConfig | null {
  const accessToken = (process.env.POLAR_ACCESS_TOKEN || '').trim()
  if (!accessToken) return null
  const sandbox = (process.env.POLAR_SERVER || '').trim().toLowerCase() === 'sandbox'
  return { accessToken, apiBase: sandbox ? POLAR_SANDBOX_API : POLAR_PRODUCTION_API, sandbox }
}

async function polarRequest<T>(config: PolarConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.apiBase}${path}`, {
      method: init.method ?? 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    })
  } catch {
    throw new IapVerificationError('polar_unavailable')
  }
  if (response.status === 401 || response.status === 403) throw new IapVerificationError('polar_not_configured')
  if (response.status === 404) throw new IapVerificationError('invalid_transaction')
  if (!response.ok) throw new IapVerificationError('polar_unavailable')
  return response.json() as Promise<T>
}

export async function createPolarCheckout(config: PolarConfig, input: {
  polarProductId: string
  userId: string
  coinProductId: string
  customerEmail?: string | null
  successUrl: string
  returnUrl: string
}): Promise<{ id: string; url: string }> {
  const checkout = await polarRequest<{ id?: string; url?: string }>(config, '/v1/checkouts/', {
    method: 'POST',
    body: {
      products: [input.polarProductId],
      external_customer_id: input.userId,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      // Copied onto the order: this is how the webhook knows whom to credit.
      metadata: { [POLAR_METADATA_USER_ID]: input.userId, [POLAR_METADATA_PRODUCT]: input.coinProductId },
      success_url: input.successUrl,
      return_url: input.returnUrl,
      allow_discount_codes: false,
    },
  })
  if (!checkout.id || !checkout.url) throw new IapVerificationError('polar_unavailable')
  return { id: checkout.id, url: checkout.url }
}

export type PolarOrder = {
  id: string
  status: string
  paid: boolean
  totalAmount: number | null
  refundedAmount: number
  currency: string | null
  country: string | null
  polarProductId: string | null
  userId: string | null
  coinProductId: string | null
  raw: Record<string, unknown>
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parsePolarOrder(raw: Record<string, unknown>): PolarOrder {
  const metadata = (typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {}) as Record<string, unknown>
  const product = (typeof raw.product === 'object' && raw.product !== null ? raw.product : {}) as Record<string, unknown>
  const customer = (typeof raw.customer === 'object' && raw.customer !== null ? raw.customer : {}) as Record<string, unknown>
  const billing = (typeof raw.billing_address === 'object' && raw.billing_address !== null ? raw.billing_address : {}) as Record<string, unknown>
  const id = readString(raw.id)
  if (!id) throw new IapVerificationError('invalid_transaction')
  return {
    id,
    status: readString(raw.status) ?? '',
    paid: raw.paid === true,
    totalAmount: typeof raw.total_amount === 'number' ? raw.total_amount : null,
    refundedAmount: typeof raw.refunded_amount === 'number' ? raw.refunded_amount : 0,
    currency: readString(raw.currency),
    country: readString(billing.country),
    polarProductId: readString(raw.product_id) ?? readString(product.id),
    userId: readString(metadata[POLAR_METADATA_USER_ID]) ?? readString(customer.external_id),
    coinProductId: readString(metadata[POLAR_METADATA_PRODUCT]),
    raw,
  }
}

export async function getPolarOrder(config: PolarConfig, orderId: string): Promise<PolarOrder> {
  if (!/^[0-9a-fA-F-]{16,64}$/.test(orderId)) throw new IapVerificationError('invalid_transaction')
  return parsePolarOrder(await polarRequest<Record<string, unknown>>(config, `/v1/orders/${orderId}`))
}

/** Creates a one-time USD product in Polar; returns its id. Used by /admin/coins to set up the web packs. */
export async function createPolarProduct(config: PolarConfig, input: { name: string; description: string; priceUsdCents: number; coinProductId: string }): Promise<string> {
  const product = await polarRequest<{ id?: string }>(config, '/v1/products/', {
    method: 'POST',
    body: {
      name: input.name,
      description: input.description,
      recurring_interval: null,
      prices: [{ amount_type: 'fixed', price_amount: input.priceUsdCents, price_currency: 'usd' }],
      metadata: { [POLAR_METADATA_PRODUCT]: input.coinProductId },
    },
  })
  if (!product.id) throw new IapVerificationError('polar_unavailable')
  return product.id
}

/**
 * Standard Webhooks signature check. Signed content is `${id}.${timestamp}.${body}`,
 * HMAC-SHA256, base64, sent as a space-separated list of `v1,<signature>`.
 * Polar secrets created before 2026-09-08 key the HMAC with the UTF-8 bytes of
 * the whole secret string; newer ones use the base64-decoded part after
 * `whsec_`. Both are accepted.
 */
export function verifyPolarWebhookSignature(input: {
  secret: string
  webhookId: string | null
  webhookTimestamp: string | null
  webhookSignature: string | null
  rawBody: string
  now?: number
}): boolean {
  const { secret, webhookId, webhookTimestamp, webhookSignature } = input
  if (!secret || !webhookId || !webhookTimestamp || !webhookSignature) return false
  const timestampMs = Number(webhookTimestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs((input.now ?? Date.now()) - timestampMs) > WEBHOOK_TOLERANCE_MS) return false

  const content = `${webhookId}.${webhookTimestamp}.${input.rawBody}`
  const keys = [Buffer.from(secret, 'utf8')]
  if (secret.startsWith('whsec_')) keys.push(Buffer.from(secret.slice('whsec_'.length), 'base64'))
  const expected = keys.map(key => createHmac('sha256', key).update(content).digest())
  return webhookSignature.split(' ').some((entry) => {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) return false
    const provided = Buffer.from(value, 'base64')
    return expected.some(candidate => candidate.length === provided.length && timingSafeEqual(candidate, provided))
  })
}
