import { createPrivateKey, sign } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { resolveIosBundleId } from './iap-apple'

// Answers Apple's CONSUMPTION_REQUEST (a customer asked Apple for a refund)
// with Send Consumption Information v2. Policy (docs/coin-iap-spec.md 6.4): a
// Hash pack is refundable only while none of it has been used; once any of it
// was spent or gifted we ask Apple to decline. Apple makes the final call.
// Apple wants the answer within 12 hours; a failed call becomes a 5xx on the
// webhook, so Apple redelivers the notification and we try again.

const PRODUCTION_HOST = 'https://api.storekit.apple.com'
const SANDBOX_HOST = 'https://api.storekit-sandbox.apple.com'
// Apple: exp may be at most 60 minutes after iat.
const JWT_LIFETIME_SECONDS = 5 * 60
// consumptionPercentage is in milliunits: 100000 = 100%.
const FULL_CONSUMPTION = 100_000n

export type AppleApiConfig = { issuerId: string; keyId: string; privateKey: string; bundleId: string }

/** App Store Server API key (App Store Connect > Users and Access > Integrations > In-App Purchase). */
export function readAppleApiConfig(env: NodeJS.ProcessEnv = process.env): AppleApiConfig | null {
  const issuerId = (env.APPLE_IAP_ISSUER_ID || '').trim()
  const keyId = (env.APPLE_IAP_KEY_ID || '').trim()
  // Env files often carry the PEM on one line with literal \n.
  const privateKey = (env.APPLE_IAP_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n')
  if (!issuerId || !keyId || !privateKey) return null
  return { issuerId, keyId, privateKey, bundleId: resolveIosBundleId() }
}

/** ES256 JWT for the App Store Server API. A fresh one per request. */
export function signAppleApiJwt(config: AppleApiConfig, now = new Date()): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const iat = Math.floor(now.getTime() / 1000)
  const header = encode({ alg: 'ES256', kid: config.keyId, typ: 'JWT' })
  const payload = encode({ iss: config.issuerId, iat, exp: iat + JWT_LIFETIME_SECONDS, aud: 'appstoreconnect-v1', bid: config.bundleId })
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: 'ieee-p1363',
  })
  return `${header}.${payload}.${signature.toString('base64url')}`
}

export type AppleConsumptionBody = {
  customerConsented: true
  deliveryStatus: 'DELIVERED'
  sampleContentProvided: boolean
  consumptionPercentage: number
  refundPreference: 'DECLINE' | 'GRANT_FULL'
}

/**
 * What to tell Apple about one pack. Everything that left the pack's lot counts
 * as used: spent on translation or interpreting, or gifted to another user.
 */
export function buildAppleConsumptionBody(lot: { grantedMicro: bigint; remainingMicro: bigint }): AppleConsumptionBody {
  const granted = lot.grantedMicro > 0n ? lot.grantedMicro : 0n
  const usedMicro = granted - (lot.remainingMicro < 0n ? 0n : lot.remainingMicro < granted ? lot.remainingMicro : granted)
  let percentage = granted > 0n ? (usedMicro * FULL_CONSUMPTION) / granted : 0n
  // A single Hash used must not read as 0%.
  if (usedMicro > 0n && percentage === 0n) percentage = 1n
  return {
    customerConsented: true,
    deliveryStatus: 'DELIVERED',
    // Every account gets free Hash at sign-up to try the paid features first.
    sampleContentProvided: true,
    consumptionPercentage: Number(percentage),
    refundPreference: usedMicro > 0n ? 'DECLINE' : 'GRANT_FULL',
  }
}

export class AppleConsumptionRetryableError extends Error {}

export type AppleConsumptionResult =
  | 'consumption_sent'
  | 'consumption_not_configured'
  | 'consumption_purchase_not_found'
  | `consumption_rejected_${number}`

/**
 * Responds to one CONSUMPTION_REQUEST. A purchase we never granted is left
 * unanswered: we cannot vouch for a delivery we have no record of. Throws
 * AppleConsumptionRetryableError when Apple should redeliver the notification.
 */
export async function respondToAppleConsumptionRequest(input: {
  transactionId: string
  environment: 'sandbox' | 'production'
  config?: AppleApiConfig | null
  fetchImpl?: typeof fetch
  now?: Date
}): Promise<AppleConsumptionResult> {
  const config = input.config === undefined ? readAppleApiConfig() : input.config
  if (!config) return 'consumption_not_configured'

  const purchase = await prisma.appIapPurchase.findUnique({
    where: { storeTransactionId: input.transactionId },
    select: { platform: true, lotId: true },
  })
  const lot = purchase?.platform === 'ios' && purchase.lotId
    ? await prisma.appCoinLot.findUnique({ where: { id: purchase.lotId }, select: { grantedMicro: true, remainingMicro: true } })
    : null
  if (!lot) return 'consumption_purchase_not_found'

  const host = input.environment === 'production' ? PRODUCTION_HOST : SANDBOX_HOST
  let response: Response
  try {
    response = await (input.fetchImpl ?? fetch)(
      `${host}/inApps/v2/transactions/consumption/${encodeURIComponent(input.transactionId)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${signAppleApiJwt(config, input.now)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAppleConsumptionBody(lot)),
        signal: AbortSignal.timeout(10_000),
      },
    )
  } catch (error) {
    throw new AppleConsumptionRetryableError(error instanceof Error ? error.message : 'apple_consumption_network_error')
  }
  if (response.status === 202 || response.ok) return 'consumption_sent'
  // 401 too: a fixed key would make the redelivery succeed.
  if (response.status === 401 || response.status === 429 || response.status >= 500) {
    throw new AppleConsumptionRetryableError(`apple_consumption_http_${response.status}`)
  }
  console.error('[coins] apple consumption request rejected', response.status, await response.text().catch(() => ''))
  return `consumption_rejected_${response.status}`
}
